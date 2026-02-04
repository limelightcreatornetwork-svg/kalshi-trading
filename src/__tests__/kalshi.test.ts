/**
 * Tests for Kalshi API Client
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock crypto module
vi.mock('crypto', () => ({
  default: {
    createSign: vi.fn(() => ({
      update: vi.fn(),
      end: vi.fn(),
      sign: vi.fn(() => Buffer.from('mock-signature')),
    })),
    constants: {
      RSA_PKCS1_PSS_PADDING: 6,
      RSA_PSS_SALTLEN_DIGEST: -1,
    },
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Kalshi API Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      KALSHI_API_KEY_ID: 'test-api-key-id',
      KALSHI_API_PRIVATE_KEY: 'test-private-key',
      KALSHI_ENV: 'demo',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should throw error when API key ID is not configured', async () => {
      delete process.env.KALSHI_API_KEY_ID;
      const { getBalance } = await import('../lib/kalshi');

      await expect(getBalance()).rejects.toThrow('Kalshi API credentials not configured');
    });

    it('should throw error when private key is not configured', async () => {
      delete process.env.KALSHI_API_PRIVATE_KEY;
      const { getBalance } = await import('../lib/kalshi');

      await expect(getBalance()).rejects.toThrow('Kalshi API credentials not configured');
    });

    it('should use demo URL by default', async () => {
      process.env.KALSHI_ENV = 'demo';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
      });

      const { getBalance } = await import('../lib/kalshi');
      await getBalance();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('demo-api.kalshi.co'),
        expect.any(Object)
      );
    });

    it('should use production URL when configured', async () => {
      process.env.KALSHI_ENV = 'production';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
      });

      const { getBalance } = await import('../lib/kalshi');
      await getBalance();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.elections.kalshi.com'),
        expect.any(Object)
      );
    });

    it('should default to demo for invalid environment value', async () => {
      process.env.KALSHI_ENV = 'invalid';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
      });

      const { getBalance } = await import('../lib/kalshi');
      await getBalance();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('demo-api.kalshi.co'),
        expect.any(Object)
      );
    });
  });

  describe('Authentication Headers', () => {
    it('should include required auth headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
      });

      const { getBalance } = await import('../lib/kalshi');
      await getBalance();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).toHaveProperty('KALSHI-ACCESS-KEY', 'test-api-key-id');
      expect(options.headers).toHaveProperty('KALSHI-ACCESS-SIGNATURE');
      expect(options.headers).toHaveProperty('KALSHI-ACCESS-TIMESTAMP');
      expect(options.headers).toHaveProperty('Content-Type', 'application/json');
    });
  });

  describe('getBalance', () => {
    it('should return balance data on success', async () => {
      const mockBalance = { balance: 10000, portfolio_value: 5000, updated_ts: 123 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBalance),
      });

      const { getBalance } = await import('../lib/kalshi');
      const result = await getBalance();

      expect(result).toEqual(mockBalance);
    });
  });

  describe('getMarkets', () => {
    it('should fetch markets without params', async () => {
      const mockMarkets = { markets: [], cursor: null };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMarkets),
      });

      const { getMarkets } = await import('../lib/kalshi');
      const result = await getMarkets();

      expect(result).toEqual(mockMarkets);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/markets$/),
        expect.any(Object)
      );
    });

    it('should include query params when provided', async () => {
      const mockMarkets = { markets: [], cursor: 'next-cursor' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMarkets),
      });

      const { getMarkets } = await import('../lib/kalshi');
      await getMarkets({ limit: 10, status: 'active', event_ticker: 'TEST-EVENT' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('limit=10');
      expect(url).toContain('status=active');
      expect(url).toContain('event_ticker=TEST-EVENT');
    });
  });

  describe('getPositions', () => {
    it('should fetch positions', async () => {
      const mockPositions = { market_positions: [], event_positions: [], cursor: null };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPositions),
      });

      const { getPositions } = await import('../lib/kalshi');
      const result = await getPositions();

      expect(result).toEqual(mockPositions);
    });

    it('should include query params when provided', async () => {
      const mockPositions = { market_positions: [], event_positions: [], cursor: null };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPositions),
      });

      const { getPositions } = await import('../lib/kalshi');
      await getPositions({ ticker: 'TEST-TICKER', settlement_status: 'unsettled' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('ticker=TEST-TICKER');
      expect(url).toContain('settlement_status=unsettled');
    });
  });

  describe('getOrders', () => {
    it('should fetch orders', async () => {
      const mockOrders = { orders: [], cursor: null };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrders),
      });

      const { getOrders } = await import('../lib/kalshi');
      const result = await getOrders();

      expect(result).toEqual(mockOrders);
    });
  });

  describe('createOrder', () => {
    it('should create an order with required fields', async () => {
      const mockOrder = { order: { order_id: 'test-order-id' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrder),
      });

      const { createOrder } = await import('../lib/kalshi');
      const result = await createOrder({
        ticker: 'TEST-TICKER',
        side: 'yes',
        action: 'buy',
        type: 'limit',
        count: 10,
        yes_price: 50,
      });

      expect(result).toEqual(mockOrder);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.ticker).toBe('TEST-TICKER');
      expect(body.side).toBe('yes');
      expect(body.action).toBe('buy');
      expect(body.type).toBe('limit');
      expect(body.count).toBe(10);
      expect(body.yes_price).toBe(50);
    });

    it('should include optional fields when provided', async () => {
      const mockOrder = { order: { order_id: 'test-order-id' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrder),
      });

      const { createOrder } = await import('../lib/kalshi');
      await createOrder({
        ticker: 'TEST-TICKER',
        side: 'yes',
        action: 'buy',
        type: 'limit',
        count: 10,
        yes_price: 50,
        client_order_id: 'my-client-id',
        post_only: true,
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.client_order_id).toBe('my-client-id');
      expect(body.post_only).toBe(true);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an order', async () => {
      const mockOrder = { order: { order_id: 'test-order-id', status: 'canceled' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrder),
      });

      const { cancelOrder } = await import('../lib/kalshi');
      const result = await cancelOrder('test-order-id');

      expect(result).toEqual(mockOrder);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portfolio/orders/test-order-id'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw KalshiApiError on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: { message: 'Invalid ticker' } }),
      });

      const { getBalance, KalshiApiError } = await import('../lib/kalshi');

      try {
        await getBalance();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KalshiApiError);
        expect((error as Error).message).toContain('Invalid ticker');
      }
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.reject(new Error('Not JSON')),
      });

      const { getBalance } = await import('../lib/kalshi');

      try {
        await getBalance();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Bad Request');
      }
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 503 errors', async () => {
      // First call fails with 503, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: () => Promise.resolve({ message: 'Service Unavailable' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
        });

      const { getBalance } = await import('../lib/kalshi');
      const result = await getBalance();

      expect(result.balance).toBe(10000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 rate limit errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: () => Promise.resolve({ message: 'Rate limited' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
        });

      const { getBalance } = await import('../lib/kalshi');
      const result = await getBalance();

      expect(result.balance).toBe(10000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 400 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Bad request' }),
      });

      const { getBalance } = await import('../lib/kalshi');

      await expect(getBalance()).rejects.toThrow('Bad request');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      mockFetch
        .mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: () => Promise.resolve({ message: 'Service Unavailable' }),
        });

      const { getBalance } = await import('../lib/kalshi');

      await expect(getBalance()).rejects.toThrow('Service Unavailable');
      expect(mockFetch).toHaveBeenCalledTimes(3); // MAX_RETRIES = 3
    });
  });

  describe('Retry-After Header Handling', () => {
    it('should respect Retry-After header with seconds value on 429', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '2' }),
          json: () => Promise.resolve({ message: 'Rate limited' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
        });

      const { getBalance } = await import('../lib/kalshi');
      const result = await getBalance();

      expect(result.balance).toBe(10000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle Retry-After header with HTTP-date format', async () => {
      const futureDate = new Date(Date.now() + 1000).toUTCString();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': futureDate }),
          json: () => Promise.resolve({ message: 'Rate limited' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
        });

      const { getBalance } = await import('../lib/kalshi');
      const result = await getBalance();

      expect(result.balance).toBe(10000);
    });

    it('should handle missing Retry-After header on 429', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers(),
          json: () => Promise.resolve({ message: 'Rate limited' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
        });

      const { getBalance } = await import('../lib/kalshi');
      const result = await getBalance();

      expect(result.balance).toBe(10000);
    });
  });

  describe('Timeout Handling', () => {
    it('should retry on AbortError (timeout)', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
        });

      const { getBalance } = await import('../lib/kalshi');
      const result = await getBalance();

      expect(result.balance).toBe(10000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw timeout error after max retries of AbortError', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);

      const { getBalance } = await import('../lib/kalshi');
      await expect(getBalance()).rejects.toThrow('Request timeout');
    });
  });

  describe('Network Error Handling', () => {
    it('should retry on TypeError (network error)', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ balance: 10000, portfolio_value: 5000, updated_ts: 123 }),
        });

      const { getBalance } = await import('../lib/kalshi');
      const result = await getBalance();

      expect(result.balance).toBe(10000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries of network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const { getBalance } = await import('../lib/kalshi');
      await expect(getBalance()).rejects.toThrow();
    });
  });

  describe('createOrder - Additional Fields', () => {
    it('should include no_price when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ order: { order_id: 'test' } }),
      });

      const { createOrder } = await import('../lib/kalshi');
      await createOrder({
        ticker: 'TEST',
        side: 'no',
        action: 'buy',
        type: 'limit',
        count: 5,
        no_price: 40,
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.no_price).toBe(40);
      expect(body.yes_price).toBeUndefined();
    });

    it('should include time_in_force and expiration_ts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ order: { order_id: 'test' } }),
      });

      const { createOrder } = await import('../lib/kalshi');
      await createOrder({
        ticker: 'TEST',
        side: 'yes',
        action: 'buy',
        type: 'limit',
        count: 5,
        yes_price: 50,
        time_in_force: 'gtd',
        expiration_ts: 1700000000,
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.time_in_force).toBe('gtd');
      expect(body.expiration_ts).toBe(1700000000);
    });
  });

  describe('Query Parameters', () => {
    it('should build getMarkets query with cursor and series_ticker', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ markets: [], cursor: null }),
      });

      const { getMarkets } = await import('../lib/kalshi');
      await getMarkets({ cursor: 'abc123', series_ticker: 'SERIES-A', tickers: 'T1,T2' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('cursor=abc123');
      expect(url).toContain('series_ticker=SERIES-A');
      expect(url).toContain('tickers=');
    });

    it('should build getPositions query with all params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ market_positions: [], event_positions: [] }),
      });

      const { getPositions } = await import('../lib/kalshi');
      await getPositions({
        limit: 50,
        cursor: 'pos-cursor',
        event_ticker: 'EVT-1',
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('limit=50');
      expect(url).toContain('cursor=pos-cursor');
      expect(url).toContain('event_ticker=EVT-1');
    });

    it('should build getOrders query with all params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ orders: [] }),
      });

      const { getOrders } = await import('../lib/kalshi');
      await getOrders({
        limit: 25,
        cursor: 'ord-cursor',
        ticker: 'MKT-1',
        status: 'resting',
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('limit=25');
      expect(url).toContain('cursor=ord-cursor');
      expect(url).toContain('ticker=MKT-1');
      expect(url).toContain('status=resting');
    });
  });

  describe('KalshiApiError', () => {
    it('should have correct properties', async () => {
      const { KalshiApiError } = await import('../lib/kalshi');
      const error = new KalshiApiError(404, 'Not found');

      expect(error.statusCode).toBe(404);
      expect(error.apiMessage).toBe('Not found');
      expect(error.name).toBe('KalshiApiError');
      expect(error.message).toBe('Kalshi API Error 404: Not found');
    });
  });
});
