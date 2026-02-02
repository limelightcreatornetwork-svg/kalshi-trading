/**
 * Kalshi API Client
 * 
 * Kalshi is a US-regulated (CFTC) prediction market exchange.
 * API Documentation: https://docs.kalshi.com/welcome
 * 
 * Authentication: RSA-PSS signatures with SHA256
 * - Message format: timestamp_ms + HTTP_METHOD + path (without query params)
 * - Headers: KALSHI-ACCESS-KEY, KALSHI-ACCESS-SIGNATURE, KALSHI-ACCESS-TIMESTAMP
 */

import crypto from 'crypto';

export interface KalshiConfig {
  apiKeyId: string;
  privateKey: string;
  environment: 'demo' | 'production';
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  sub_title?: string;
  mutually_exclusive: boolean;
  series_ticker?: string;
}

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  open_interest: number;
  status: 'active' | 'closed' | 'settled';
  result?: 'yes' | 'no';
  expiration_time: string;
  close_time?: string;
}

export interface KalshiPosition {
  ticker: string;
  market_exposure: number;
  position: number;
  resting_orders_count: number;
  total_traded: number;
  realized_pnl: number;
}

export interface KalshiOrder {
  order_id: string;
  ticker: string;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  type: 'market' | 'limit';
  count: number;
  limit_price?: number;
  status: 'pending' | 'active' | 'closed' | 'canceled';
  created_time: string;
  expiration_time?: string;
}

const BASE_URLS = {
  demo: 'https://demo-api.kalshi.co/trade-api/v2',
  production: 'https://api.elections.kalshi.com/trade-api/v2',
};

class KalshiClient {
  private config: KalshiConfig | null = null;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  configure(config: KalshiConfig) {
    this.config = config;
    this.token = null;
    this.tokenExpiry = null;
  }

  isConfigured(): boolean {
    return !!this.config?.apiKeyId && !!this.config?.privateKey;
  }

  private getBaseUrl(): string {
    const env = (this.config?.environment || 'demo').trim().toLowerCase();
    const validEnv = (env === 'production' || env === 'demo') ? env : 'demo';
    return BASE_URLS[validEnv as keyof typeof BASE_URLS];
  }

  private formatPrivateKey(key: string): string {
    // If already formatted with headers, return as-is
    if (key.includes('-----BEGIN')) {
      return key;
    }
    
    // Remove common prefixes like "Kalshi key: " (case-insensitive)
    let cleanKey = key.replace(/^kalshi\s*key:\s*/i, '');
    
    // Remove any whitespace/newlines
    cleanKey = cleanKey.replace(/\s/g, '');
    
    // Split into 64-character lines (PEM format requirement)
    const lines: string[] = [];
    for (let i = 0; i < cleanKey.length; i += 64) {
      lines.push(cleanKey.slice(i, i + 64));
    }
    
    // Wrap with RSA PRIVATE KEY headers
    return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
  }

  private signRequest(method: string, path: string, timestampMs: string): string {
    if (!this.config) {
      throw new Error('Kalshi client not configured');
    }

    // Kalshi signature format: timestamp (ms) + method + path
    // The path must include /trade-api/v2 prefix
    // IMPORTANT: Strip query parameters before signing
    const pathWithoutQuery = path.split('?')[0];
    const message = `${timestampMs}${method.toUpperCase()}${pathWithoutQuery}`;
    
    // Format the private key properly for PEM
    const pemKey = this.formatPrivateKey(this.config.privateKey);
    
    // Use createSign with RSA-SHA256 and PSS padding as per Kalshi docs
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();
    
    const signature = sign.sign({
      key: pemKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });
    
    return signature.toString('base64');
  }

  private async getAuthHeaders(method: string = 'GET', path: string = ''): Promise<Record<string, string>> {
    if (!this.config) {
      throw new Error('Kalshi client not configured');
    }

    // Timestamp must be in milliseconds
    const timestampMs = Date.now().toString();
    const signature = this.signRequest(method, path, timestampMs);

    return {
      'Content-Type': 'application/json',
      'KALSHI-ACCESS-KEY': this.config.apiKeyId,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': timestampMs,
    };
  }

  async getEvents(params?: { 
    category?: string; 
    status?: string; 
    limit?: number 
  }): Promise<KalshiEvent[]> {
    if (!this.isConfigured()) {
      return this.getMockEvents();
    }

    try {
      const queryParams = new URLSearchParams();
      if (params?.category) queryParams.set('category', params.category);
      if (params?.status) queryParams.set('status', params.status);
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const path = `/trade-api/v2/events?${queryParams}`;
      const response = await fetch(
        `${this.getBaseUrl()}/events?${queryParams}`,
        { headers: await this.getAuthHeaders('GET', path) }
      );

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      return data.events || [];
    } catch (error) {
      console.error('Kalshi getEvents error:', error);
      return this.getMockEvents();
    }
  }

  async getMarkets(params?: {
    event_ticker?: string;
    status?: string;
    ticker?: string;
    limit?: number;
  }): Promise<KalshiMarket[]> {
    if (!this.isConfigured()) {
      return this.getMockMarkets();
    }

    try {
      const queryParams = new URLSearchParams();
      if (params?.event_ticker) queryParams.set('event_ticker', params.event_ticker);
      // Note: Kalshi API doesn't support 'active' as a status filter
      // Valid statuses are: 'open', 'closed', 'settled' (filter locally if needed)
      if (params?.status && params.status !== 'active') {
        queryParams.set('status', params.status);
      }
      if (params?.ticker) queryParams.set('ticker', params.ticker);
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const queryString = queryParams.toString();
      const path = `/trade-api/v2/markets${queryString ? `?${queryString}` : ''}`;
      const url = `${this.getBaseUrl()}/markets${queryString ? `?${queryString}` : ''}`;
      const response = await fetch(url, { headers: await this.getAuthHeaders('GET', path) });

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      return data.markets || [];
    } catch (error) {
      console.error('Kalshi getMarkets error:', error);
      return this.getMockMarkets();
    }
  }

  async getPositions(): Promise<KalshiPosition[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const path = '/trade-api/v2/portfolio/positions';
      const response = await fetch(
        `${this.getBaseUrl()}/portfolio/positions`,
        { headers: await this.getAuthHeaders('GET', path) }
      );

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      return data.market_positions || [];
    } catch (error) {
      console.error('Kalshi getPositions error:', error);
      return [];
    }
  }

  async createOrder(order: {
    ticker: string;
    action: 'buy' | 'sell';
    side: 'yes' | 'no';
    type: 'market' | 'limit';
    count: number;
    limit_price?: number;  // Price in cents (will be converted to yes_price/no_price)
    expiration_ts?: number;
  }): Promise<{ success: boolean; order?: KalshiOrder; error?: string; mock?: boolean }> {
    if (!this.isConfigured()) {
      // Return mock order for demo
      return {
        success: true,
        order: {
          order_id: `mock_${Date.now()}`,
          ticker: order.ticker,
          action: order.action,
          side: order.side,
          type: order.type,
          count: order.count,
          limit_price: order.limit_price,
          status: 'active',
          created_time: new Date().toISOString(),
        },
        mock: true,
      };
    }

    try {
      const path = '/trade-api/v2/portfolio/orders';
      
      // Convert limit_price to Kalshi's yes_price format
      // Kalshi API expects: ticker, action, side, type, count, yes_price (in cents)
      const requestBody: Record<string, unknown> = {
        ticker: order.ticker,
        action: order.action,
        side: order.side,
        type: order.type,
        count: order.count,
      };
      
      if (order.type === 'limit' && order.limit_price !== undefined) {
        // Kalshi uses yes_price (price for YES side in cents)
        requestBody.yes_price = order.limit_price;
      }
      
      if (order.expiration_ts) {
        requestBody.expiration_ts = order.expiration_ts;
      }
      
      const response = await fetch(
        `${this.getBaseUrl()}/portfolio/orders`,
        {
          method: 'POST',
          headers: await this.getAuthHeaders('POST', path),
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        order: data.order,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create order';
      console.error('Kalshi createOrder error:', error);
      return { success: false, error: message };
    }
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean; error?: string; mock?: boolean }> {
    if (!this.isConfigured()) {
      return { success: true, mock: true };
    }

    try {
      const path = `/trade-api/v2/portfolio/orders/${orderId}`;
      const response = await fetch(
        `${this.getBaseUrl()}/portfolio/orders/${orderId}`,
        {
          method: 'DELETE',
          headers: await this.getAuthHeaders('DELETE', path),
        }
      );

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel order';
      console.error('Kalshi cancelOrder error:', error);
      return { success: false, error: message };
    }
  }

  async getBalance(): Promise<{ available: number; total: number; mock?: boolean }> {
    if (!this.isConfigured()) {
      return { available: 0, total: 0, mock: true };
    }

    try {
      const path = '/trade-api/v2/portfolio/balance';
      const response = await fetch(
        `${this.getBaseUrl()}/portfolio/balance`,
        { headers: await this.getAuthHeaders('GET', path) }
      );

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        available: data.balance / 100, // Kalshi returns cents
        total: (data.balance + data.portfolio_value) / 100,
      };
    } catch (error) {
      console.error('Kalshi getBalance error:', error);
      return { available: 0, total: 0, mock: true };
    }
  }

  async getBalanceWithError(): Promise<{ available: number; total: number; error?: string }> {
    if (!this.isConfigured()) {
      return { available: 0, total: 0, error: 'Client not configured' };
    }

    try {
      const path = '/trade-api/v2/portfolio/balance';
      const headers = await this.getAuthHeaders('GET', path);
      const url = `${this.getBaseUrl()}/portfolio/balance`;
      
      console.log('Fetching balance from:', url);
      console.log('Headers:', JSON.stringify(headers, null, 2));
      
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Kalshi API error ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        return { available: 0, total: 0, error: errorMessage };
      }

      const data = await response.json();
      return {
        available: data.balance / 100,
        total: (data.balance + data.portfolio_value) / 100,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Kalshi getBalanceWithError error:', error);
      return { available: 0, total: 0, error: message };
    }
  }

  // Mock data for demo mode
  private getMockEvents(): KalshiEvent[] {
    return [
      {
        event_ticker: 'FED-RATE-26MAR',
        title: 'Fed Interest Rate Decision - March 2026',
        category: 'Economics',
        mutually_exclusive: true,
      },
      {
        event_ticker: 'WEATHER-NYC-26FEB',
        title: 'NYC Weather - February 2026',
        category: 'Weather',
        mutually_exclusive: false,
      },
    ];
  }

  private getMockMarkets(): KalshiMarket[] {
    return [
      // Normal market - no arbitrage
      {
        ticker: 'FED-26MAR-T5.00',
        event_ticker: 'FED-RATE-26MAR',
        title: 'Fed rate above 5.00% on March 26',
        yes_bid: 33,
        yes_ask: 37,
        no_bid: 63,
        no_ask: 67,
        last_price: 35,
        volume: 12500,
        open_interest: 8500,
        status: 'active',
        expiration_time: '2026-03-26T18:00:00Z',
      },
      // ARBITRAGE OPPORTUNITY: YES + NO asks = 95 (buy both for 5¢ profit!)
      {
        ticker: 'RAIN-NYC-26FEB01',
        event_ticker: 'WEATHER-NYC-26FEB',
        title: 'Rain in NYC on Feb 1, 2026',
        yes_bid: 65,
        yes_ask: 68,
        no_bid: 25,
        no_ask: 27, // 68 + 27 = 95 < 100 → arbitrage!
        last_price: 67,
        volume: 8200,
        open_interest: 4100,
        status: 'active',
        expiration_time: '2026-02-05T23:59:59Z',
      },
      // ARBITRAGE OPPORTUNITY: YES + NO asks = 97 (buy both for 3¢ profit!)
      {
        ticker: 'BTC-100K-26Q1',
        event_ticker: 'CRYPTO-BTC-26Q1',
        title: 'Bitcoin above $100K end of Q1 2026',
        yes_bid: 44,
        yes_ask: 47,
        no_bid: 48,
        no_ask: 50, // 47 + 50 = 97 < 100 → arbitrage!
        last_price: 46,
        volume: 45000,
        open_interest: 22000,
        status: 'active',
        expiration_time: '2026-03-31T23:59:59Z',
      },
      // Cross-market arbitrage setup - Fed rate brackets (mutually exclusive)
      {
        ticker: 'FED-26MAR-T4.50',
        event_ticker: 'FED-RATE-26MAR',
        title: 'Fed rate between 4.25% - 4.50%',
        yes_bid: 18,
        yes_ask: 22,
        no_bid: 75,
        no_ask: 82,
        last_price: 20,
        volume: 5000,
        open_interest: 3000,
        status: 'active',
        expiration_time: '2026-03-26T18:00:00Z',
      },
      {
        ticker: 'FED-26MAR-T4.75',
        event_ticker: 'FED-RATE-26MAR',
        title: 'Fed rate between 4.50% - 4.75%',
        yes_bid: 35,
        yes_ask: 40,
        no_bid: 57,
        no_ask: 65,
        last_price: 38,
        volume: 8000,
        open_interest: 4500,
        status: 'active',
        expiration_time: '2026-03-26T18:00:00Z',
      },
      // ARBITRAGE: sell both YES bids for 105¢ (5¢ profit if you hold positions)
      {
        ticker: 'ETH-5K-26FEB',
        event_ticker: 'CRYPTO-ETH-26FEB',
        title: 'Ethereum above $5K by Feb 28, 2026',
        yes_bid: 55, // 55 + 50 = 105 > 100 → sell arb!
        yes_ask: 60,
        no_bid: 50,
        no_ask: 55,
        last_price: 57,
        volume: 32000,
        open_interest: 18000,
        status: 'active',
        expiration_time: '2026-02-28T23:59:59Z',
      },
    ];
  }
}

// Singleton instance
export const kalshiClient = new KalshiClient();

// Initialize from environment
if (process.env.KALSHI_API_KEY_ID && process.env.KALSHI_API_PRIVATE_KEY) {
  const envValue = (process.env.KALSHI_ENV || 'demo').trim().toLowerCase();
  const validEnv = (envValue === 'production' || envValue === 'demo') ? envValue : 'demo';
  kalshiClient.configure({
    apiKeyId: process.env.KALSHI_API_KEY_ID.trim(),
    privateKey: process.env.KALSHI_API_PRIVATE_KEY.trim(),
    environment: validEnv as 'demo' | 'production',
  });
}
