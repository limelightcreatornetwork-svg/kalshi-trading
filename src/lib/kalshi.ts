// Kalshi API Client with RSA-PSS Authentication
import crypto from 'crypto';

const KALSHI_API_BASE_URL = process.env.KALSHI_API_BASE_URL || process.env.KALSHI_BASE_URL || 'https://api.elections.kalshi.com';
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID;
// Support both naming conventions
const KALSHI_PRIVATE_KEY = process.env.KALSHI_PRIVATE_KEY || process.env.KALSHI_API_PRIVATE_KEY;

export interface KalshiRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Create RSA-PSS signature for Kalshi API authentication
 */
function createSignature(privateKeyPem: string, timestamp: string, method: string, path: string): string {
  // Strip query parameters from path before signing
  const pathWithoutQuery = path.split('?')[0];
  
  // Create the message to sign: timestamp + method + path
  const message = `${timestamp}${method}${pathWithoutQuery}`;
  
  // Sign with RSA-PSS using SHA256
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  sign.end();
  
  // Use RSA-PSS padding
  const signature = crypto.sign('sha256', Buffer.from(message), {
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  
  // Return base64 encoded signature
  return signature.toString('base64');
}

/**
 * Format PEM key from environment variable
 * The key might be stored without headers/footers or with escaped newlines
 * Kalshi keys are typically RSA PRIVATE KEY format
 */
function formatPrivateKey(key: string): string {
  // If it already looks like a PEM key, just fix newlines
  if (key.includes('-----BEGIN')) {
    return key.replace(/\\n/g, '\n');
  }
  
  // Otherwise, wrap it in RSA PRIVATE KEY PEM format
  const cleanKey = key.replace(/\s/g, '');
  const chunks = cleanKey.match(/.{1,64}/g) || [];
  return `-----BEGIN RSA PRIVATE KEY-----\n${chunks.join('\n')}\n-----END RSA PRIVATE KEY-----`;
}

// ============================================
// Rate Limiting & Caching Configuration
// ============================================

const RATE_LIMIT_DELAY_MS = 300; // ms between requests (increased from 150ms)
const MAX_RETRIES = 5; // increased retries
const RETRY_DELAY_BASE_MS = 2000; // Base delay for exponential backoff (2s)
const RETRY_DELAY_MAX_MS = 30000; // Maximum delay (30s)

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL for market data

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Simple in-memory cache for market data
const cache = new Map<string, CacheEntry<unknown>>();

let lastRequestTime = 0;

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate cache key from request options
 */
function getCacheKey(options: KalshiRequestOptions): string {
  const queryStr = options.query ? JSON.stringify(options.query) : '';
  return `${options.method}:${options.path}:${queryStr}`;
}

/**
 * Check if a request is cacheable (only GET requests for market data)
 */
function isCacheable(options: KalshiRequestOptions): boolean {
  // Cache GET requests for markets endpoint
  return options.method === 'GET' && options.path.startsWith('/markets');
}

/**
 * Get cached response if valid
 */
function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

/**
 * Store response in cache
 */
function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
  
  // Clean old entries periodically (keep cache size bounded)
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) {
        cache.delete(k);
      }
    }
  }
}

/**
 * Clear the cache (useful for testing or forced refresh)
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Make an authenticated request to the Kalshi API with rate limiting, caching, and retries
 */
export async function kalshiRequest<T>({ method, path, body, query }: KalshiRequestOptions): Promise<T> {
  if (!KALSHI_API_KEY_ID || !KALSHI_PRIVATE_KEY) {
    throw new Error('Kalshi API credentials not configured');
  }

  const options: KalshiRequestOptions = { method, path, body, query };
  
  // Check cache for GET requests
  if (isCacheable(options)) {
    const cacheKey = getCacheKey(options);
    const cached = getCached<T>(cacheKey);
    if (cached) {
      console.log(`[Kalshi] Cache hit for ${path}`);
      return cached;
    }
  }

  // Rate limiting: ensure minimum delay between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    await sleep(RATE_LIMIT_DELAY_MS - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  // Build the full path with query parameters
  const fullPath = `/trade-api/v2${path}`;
  let url = `${KALSHI_API_BASE_URL}${fullPath}`;
  
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    }
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Generate timestamp (in milliseconds)
    const timestamp = Date.now().toString();
    
    // Format the private key
    const privateKeyPem = formatPrivateKey(KALSHI_PRIVATE_KEY);
    
    // Create signature
    const signature = createSignature(privateKeyPem, timestamp, method, fullPath);

    // Build headers
    const headers: Record<string, string> = {
      'KALSHI-ACCESS-KEY': KALSHI_API_KEY_ID,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'Content-Type': 'application/json',
    };

    // Make the request
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, fetchOptions);

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const retryDelay = Math.min(RETRY_DELAY_BASE_MS * Math.pow(2, attempt), RETRY_DELAY_MAX_MS);
        console.warn(`[Kalshi] Rate limited (429), retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(retryDelay);
        lastRequestTime = Date.now();
        continue;
      }

      // Handle errors
      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage: string;
        let errorJson: { code?: string; message?: string; error?: string } = {};
        try {
          errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.message || errorJson.error || errorBody;
        } catch {
          errorMessage = errorBody;
        }
        
        // Retry on rate limit errors (check error code too)
        if (errorJson.code === 'too_many_requests' && attempt < MAX_RETRIES - 1) {
          const retryDelay = Math.min(RETRY_DELAY_BASE_MS * Math.pow(2, attempt), RETRY_DELAY_MAX_MS);
          console.warn(`[Kalshi] Rate limited (code), retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(retryDelay);
          lastRequestTime = Date.now();
          continue;
        }
        
        throw new KalshiApiError(
          `Kalshi API error: ${response.status} ${response.statusText} - ${errorMessage}`,
          response.status,
          errorMessage
        );
      }

      const data = await response.json();
      
      // Cache successful GET responses for market data
      if (isCacheable(options)) {
        const cacheKey = getCacheKey(options);
        setCache(cacheKey, data);
        console.log(`[Kalshi] Cached response for ${path}`);
      }
      
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on non-rate-limit errors
      if (error instanceof KalshiApiError && error.statusCode !== 429) {
        throw error;
      }
      
      // Network errors - retry with backoff
      if (attempt < MAX_RETRIES - 1) {
        const retryDelay = Math.min(RETRY_DELAY_BASE_MS * Math.pow(2, attempt), RETRY_DELAY_MAX_MS);
        console.warn(`[Kalshi] Request failed, retrying in ${retryDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES}):`, lastError.message);
        await sleep(retryDelay);
        lastRequestTime = Date.now();
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Custom error class for Kalshi API errors
 */
export class KalshiApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public apiMessage: string
  ) {
    super(message);
    this.name = 'KalshiApiError';
  }
}

// ============================================
// API Response Types
// ============================================

export interface BalanceResponse {
  balance: number;
  portfolio_value: number;
  updated_ts: number;
}

export interface Market {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title: string;
  no_sub_title: string;
  status: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  expiration_time: string;
  result?: string;
}

export interface MarketsResponse {
  markets: Market[];
  cursor: string;
}

export interface Order {
  order_id: string;
  user_id: string;
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

export interface OrdersResponse {
  orders: Order[];
  cursor: string;
}

export interface CreateOrderRequest {
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  type?: 'limit' | 'market';
  yes_price?: number;
  no_price?: number;
  client_order_id?: string;
  time_in_force?: 'fill_or_kill' | 'good_till_canceled' | 'immediate_or_cancel';
  expiration_ts?: number;
  post_only?: boolean;
}

export interface CreateOrderResponse {
  order: Order;
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

export interface PositionsResponse {
  market_positions: MarketPosition[];
  event_positions: EventPosition[];
  cursor: string;
}

// ============================================
// API Functions
// ============================================

export async function getBalance(): Promise<BalanceResponse> {
  return kalshiRequest<BalanceResponse>({
    method: 'GET',
    path: '/portfolio/balance',
  });
}

export async function getMarkets(params?: {
  limit?: number;
  cursor?: string;
  event_ticker?: string;
  series_ticker?: string;
  status?: string;
  tickers?: string;
}): Promise<MarketsResponse> {
  return kalshiRequest<MarketsResponse>({
    method: 'GET',
    path: '/markets',
    query: params as Record<string, string | number | boolean | undefined>,
  });
}

export async function getOrders(params?: {
  limit?: number;
  cursor?: string;
  ticker?: string;
  status?: string;
}): Promise<OrdersResponse> {
  return kalshiRequest<OrdersResponse>({
    method: 'GET',
    path: '/portfolio/orders',
    query: params as Record<string, string | number | boolean | undefined>,
  });
}

export async function createOrder(order: CreateOrderRequest): Promise<CreateOrderResponse> {
  return kalshiRequest<CreateOrderResponse>({
    method: 'POST',
    path: '/portfolio/orders',
    body: order,
  });
}

export async function cancelOrder(orderId: string): Promise<void> {
  return kalshiRequest({
    method: 'DELETE',
    path: `/portfolio/orders/${orderId}`,
  });
}

export async function getPositions(params?: {
  limit?: number;
  cursor?: string;
  ticker?: string;
  event_ticker?: string;
  settlement_status?: string;
}): Promise<PositionsResponse> {
  return kalshiRequest<PositionsResponse>({
    method: 'GET',
    path: '/portfolio/positions',
    query: params as Record<string, string | number | boolean | undefined>,
  });
}
