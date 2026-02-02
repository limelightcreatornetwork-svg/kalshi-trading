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
import { apiLogger as log } from './logger';

// ============================================================================
// Configuration
// ============================================================================

const BASE_URLS = {
  demo: 'https://demo-api.kalshi.co/trade-api/v2',
  production: 'https://api.elections.kalshi.com/trade-api/v2',
};

function getConfig() {
  const apiKeyId = process.env.KALSHI_API_KEY_ID?.trim();
  const privateKey = process.env.KALSHI_API_PRIVATE_KEY?.trim();
  const envValue = (process.env.KALSHI_ENV || 'demo').trim().toLowerCase();
  const environment = (envValue === 'production' || envValue === 'demo') ? envValue : 'demo';

  return { apiKeyId, privateKey, environment };
}

function getBaseUrl(): string {
  const { environment } = getConfig();
  return BASE_URLS[environment as keyof typeof BASE_URLS];
}

function isConfigured(): boolean {
  const { apiKeyId, privateKey } = getConfig();
  return !!apiKeyId && !!privateKey;
}

// ============================================================================
// Error Class
// ============================================================================

export class KalshiApiError extends Error {
  statusCode: number;
  apiMessage: string;

  constructor(statusCode: number, apiMessage: string) {
    super(`Kalshi API Error ${statusCode}: ${apiMessage}`);
    this.name = 'KalshiApiError';
    this.statusCode = statusCode;
    this.apiMessage = apiMessage;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface Market {
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
  volume_24h: number;
  open_interest: number;
  status: string;
  result?: string;
  expiration_time: string;
  close_time?: string;
}

export interface Order {
  order_id: string;
  client_order_id?: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  type: 'limit' | 'market';
  status: string;
  yes_price: number;
  no_price: number;
  fill_count: number;
  remaining_count: number;
  initial_count: number;
  taker_fees: number;
  maker_fees: number;
  created_time: string;
  last_update_time: string;
}

export interface CreateOrderRequest {
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  type: 'limit' | 'market';
  count: number;
  yes_price?: number;
  no_price?: number;
  client_order_id?: string;
  time_in_force?: string;
  expiration_ts?: number;
  post_only?: boolean;
}

export interface MarketPosition {
  ticker: string;
  total_traded: number;
  position: number;
  market_exposure: number;
  realized_pnl: number;
  resting_orders_count: number;
  fees_paid: number;
  last_updated_ts: string;
}

export interface EventPosition {
  event_ticker: string;
  total_cost: number;
  event_exposure: number;
  realized_pnl: number;
  fees_paid: number;
}

export interface BalanceResponse {
  balance: number;
  portfolio_value: number;
  updated_ts: string;
}

// ============================================================================
// Signature Generation (RSA-PSS with SHA256)
// ============================================================================

function formatPrivateKey(key: string): string {
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

function signRequest(method: string, path: string, timestampMs: string): string {
  const { privateKey } = getConfig();
  if (!privateKey) {
    throw new KalshiApiError(500, 'Kalshi private key not configured');
  }

  // Kalshi signature format: timestamp (ms) + method + path
  // IMPORTANT: Strip query parameters before signing
  const pathWithoutQuery = path.split('?')[0];
  const message = `${timestampMs}${method.toUpperCase()}${pathWithoutQuery}`;

  // Format the private key properly for PEM
  const pemKey = formatPrivateKey(privateKey);

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

function getAuthHeaders(method: string, path: string): Record<string, string> {
  const { apiKeyId } = getConfig();
  if (!apiKeyId) {
    throw new KalshiApiError(500, 'Kalshi API key ID not configured');
  }

  const timestampMs = Date.now().toString();
  const signature = signRequest(method, path, timestampMs);

  return {
    'Content-Type': 'application/json',
    'KALSHI-ACCESS-KEY': apiKeyId,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestampMs,
  };
}

// ============================================================================
// API Request Helper
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

// Status codes that are safe to retry
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest<T>(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!isConfigured()) {
    throw new KalshiApiError(500, 'Kalshi API credentials not configured');
  }

  const baseUrl = getBaseUrl();
  const path = `/trade-api/v2${endpoint}`;
  const url = `${baseUrl}${endpoint}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Generate fresh auth headers for each attempt (timestamp must be current)
      const headers = getAuthHeaders(method, path);

      const options: RequestInit = {
        method,
        headers,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetchWithTimeout(url, options);

      if (!response.ok) {
        let apiMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          apiMessage = errorData.error?.message || errorData.message || apiMessage;
        } catch {
          apiMessage = response.statusText || apiMessage;
        }

        // Check if this error is retryable
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES - 1) {
          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delayMs);
          continue;
        }

        throw new KalshiApiError(response.status, apiMessage);
      }

      return response.json();
    } catch (error) {
      lastError = error as Error;

      // Handle timeout/abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < MAX_RETRIES - 1) {
          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delayMs);
          continue;
        }
        throw new KalshiApiError(408, 'Request timeout');
      }

      // Handle network errors (fetch failed)
      if (error instanceof TypeError && attempt < MAX_RETRIES - 1) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delayMs);
        continue;
      }

      // Re-throw KalshiApiError as-is
      if (error instanceof KalshiApiError) {
        throw error;
      }

      throw error;
    }
  }

  // Should not reach here, but just in case
  throw lastError || new KalshiApiError(500, 'Unknown error after retries');
}

// ============================================================================
// Exported API Functions
// ============================================================================

export async function getBalance(): Promise<BalanceResponse> {
  const data = await apiRequest<BalanceResponse>('GET', '/portfolio/balance');
  return data;
}

export async function getMarkets(params?: {
  limit?: number;
  cursor?: string;
  event_ticker?: string;
  series_ticker?: string;
  status?: string;
  tickers?: string;
}): Promise<{ markets: Market[]; cursor?: string }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  if (params?.event_ticker) queryParams.set('event_ticker', params.event_ticker);
  if (params?.series_ticker) queryParams.set('series_ticker', params.series_ticker);
  if (params?.status) queryParams.set('status', params.status);
  if (params?.tickers) queryParams.set('tickers', params.tickers);

  const queryString = queryParams.toString();
  const endpoint = queryString ? `/markets?${queryString}` : '/markets';

  return apiRequest('GET', endpoint);
}

export async function getPositions(params?: {
  limit?: number;
  cursor?: string;
  ticker?: string;
  event_ticker?: string;
  settlement_status?: string;
}): Promise<{ market_positions: MarketPosition[]; event_positions: EventPosition[]; cursor?: string }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  if (params?.ticker) queryParams.set('ticker', params.ticker);
  if (params?.event_ticker) queryParams.set('event_ticker', params.event_ticker);
  if (params?.settlement_status) queryParams.set('settlement_status', params.settlement_status);

  const queryString = queryParams.toString();
  const endpoint = queryString ? `/portfolio/positions?${queryString}` : '/portfolio/positions';

  return apiRequest('GET', endpoint);
}

export async function getOrders(params?: {
  limit?: number;
  cursor?: string;
  ticker?: string;
  status?: string;
}): Promise<{ orders: Order[]; cursor?: string }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  if (params?.ticker) queryParams.set('ticker', params.ticker);
  if (params?.status) queryParams.set('status', params.status);

  const queryString = queryParams.toString();
  const endpoint = queryString ? `/portfolio/orders?${queryString}` : '/portfolio/orders';

  return apiRequest('GET', endpoint);
}

export async function createOrder(order: CreateOrderRequest): Promise<{ order: Order }> {
  const body: Record<string, unknown> = {
    ticker: order.ticker,
    side: order.side,
    action: order.action,
    type: order.type,
    count: order.count,
  };
  if (order.yes_price !== undefined) body.yes_price = order.yes_price;
  if (order.no_price !== undefined) body.no_price = order.no_price;
  if (order.client_order_id) body.client_order_id = order.client_order_id;
  if (order.time_in_force) body.time_in_force = order.time_in_force;
  if (order.expiration_ts !== undefined) body.expiration_ts = order.expiration_ts;
  if (order.post_only !== undefined) body.post_only = order.post_only;

  return apiRequest('POST', '/portfolio/orders', body);
}

export async function cancelOrder(orderId: string): Promise<{ order: Order }> {
  return apiRequest('DELETE', `/portfolio/orders/${orderId}`);
}

// ============================================================================
// Additional Types
// ============================================================================

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  sub_title?: string;
  mutually_exclusive: boolean;
  series_ticker?: string;
}
