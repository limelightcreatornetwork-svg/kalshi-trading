/**
 * Kalshi API Client
 * 
 * Kalshi is a US-regulated (CFTC) prediction market exchange.
 * API Documentation: https://trading-api.readme.io/reference/getting-started
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
  demo: 'https://demo-api.elections.kalshi.com/trade-api/v2',
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
    return BASE_URLS[this.config?.environment || 'demo'];
  }

  private signRequest(method: string, path: string, timestampMs: string): string {
    if (!this.config) {
      throw new Error('Kalshi client not configured');
    }

    // Kalshi signature format: timestamp (ms) + method + path
    // The path must include /trade-api/v2 prefix
    const message = `${timestampMs}${method.toUpperCase()}${path}`;
    
    // Format the private key properly
    let privateKey = this.config.privateKey;
    if (!privateKey.includes('-----BEGIN')) {
      privateKey = `-----BEGIN RSA PRIVATE KEY-----\n${privateKey}\n-----END RSA PRIVATE KEY-----`;
    }

    // Use RSA-PSS signature as required by Kalshi
    const signature = crypto.sign(
      'sha256',
      Buffer.from(message),
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      }
    );
    
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
      if (params?.status) queryParams.set('status', params.status);
      if (params?.ticker) queryParams.set('ticker', params.ticker);
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const path = `/trade-api/v2/markets?${queryParams}`;
      const response = await fetch(
        `${this.getBaseUrl()}/markets?${queryParams}`,
        { headers: await this.getAuthHeaders('GET', path) }
      );

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
    limit_price?: number;
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
      const response = await fetch(
        `${this.getBaseUrl()}/portfolio/orders`,
        {
          method: 'POST',
          headers: await this.getAuthHeaders('POST', path),
          body: JSON.stringify(order),
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
      {
        ticker: 'RAIN-NYC-26FEB01',
        event_ticker: 'WEATHER-NYC-26FEB',
        title: 'Rain in NYC on Feb 1, 2026',
        yes_bid: 70,
        yes_ask: 74,
        no_bid: 26,
        no_ask: 30,
        last_price: 72,
        volume: 8200,
        open_interest: 4100,
        status: 'active',
        expiration_time: '2026-02-01T23:59:59Z',
      },
      {
        ticker: 'BTC-100K-26Q1',
        event_ticker: 'CRYPTO-BTC-26Q1',
        title: 'Bitcoin above $100K end of Q1 2026',
        yes_bid: 46,
        yes_ask: 50,
        no_bid: 50,
        no_ask: 54,
        last_price: 48,
        volume: 45000,
        open_interest: 22000,
        status: 'active',
        expiration_time: '2026-03-31T23:59:59Z',
      },
    ];
  }
}

// Singleton instance
export const kalshiClient = new KalshiClient();

// Initialize from environment
if (process.env.KALSHI_API_KEY_ID && process.env.KALSHI_API_PRIVATE_KEY) {
  kalshiClient.configure({
    apiKeyId: process.env.KALSHI_API_KEY_ID,
    privateKey: process.env.KALSHI_API_PRIVATE_KEY,
    environment: (process.env.KALSHI_ENV as 'demo' | 'production') || 'demo',
  });
}
