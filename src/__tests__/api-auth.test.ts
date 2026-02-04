// API Auth Tests
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// We need to test with different API_KEY values, so we mock process.env
// and re-import the module for each test group.

function createRequest(headers: Record<string, string> = {}, url = 'http://localhost/api/test'): NextRequest {
  return new NextRequest(url, { headers });
}

describe('api-auth', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('when API key is not set (auth disabled)', () => {
    beforeEach(() => {
      delete process.env.KALSHI_APP_API_KEY;
    });

    it('should allow all requests when no API key configured', async () => {
      const { authenticateRequest } = await import('../lib/api-auth');
      const request = createRequest();
      const result = authenticateRequest(request);

      expect(result.authenticated).toBe(true);
      if (result.authenticated) {
        expect(result.clientId).toBeDefined();
        expect(result.remaining).toBeDefined();
      }
    });

    it('isAuthEnabled should return false', async () => {
      const { isAuthEnabled } = await import('../lib/api-auth');
      expect(isAuthEnabled()).toBe(false);
    });
  });

  describe('when API key is set (auth enabled)', () => {
    const TEST_API_KEY = 'test-secret-key-12345';

    beforeEach(() => {
      process.env.KALSHI_APP_API_KEY = TEST_API_KEY;
    });

    it('isAuthEnabled should return true', async () => {
      const { isAuthEnabled } = await import('../lib/api-auth');
      expect(isAuthEnabled()).toBe(true);
    });

    describe('Bearer token authentication', () => {
      it('should authenticate with valid Bearer token', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'Authorization': `Bearer ${TEST_API_KEY}`,
        });

        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(true);
      });

      it('should reject invalid Bearer token', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'Authorization': 'Bearer wrong-key',
        });

        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(false);
        if (!result.authenticated) {
          const body = await result.response.json();
          expect(body.error).toBe('Unauthorized');
          expect(result.response.status).toBe(401);
        }
      });

      it('should accept plain API key in Authorization header', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'Authorization': TEST_API_KEY,
        });

        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(true);
      });
    });

    describe('X-API-Key header authentication', () => {
      it('should authenticate with valid X-API-Key', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'X-API-Key': TEST_API_KEY,
        });

        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(true);
      });

      it('should reject invalid X-API-Key', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'X-API-Key': 'wrong-key',
        });

        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(false);
      });
    });

    describe('no credentials', () => {
      it('should reject requests without any auth headers', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest();

        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(false);
        if (!result.authenticated) {
          expect(result.response.status).toBe(401);
          const body = await result.response.json();
          expect(body.message).toContain('API key required');
        }
      });
    });

    describe('rate limiting', () => {
      it('should track remaining requests', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'Authorization': `Bearer ${TEST_API_KEY}`,
        });

        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(true);
        if (result.authenticated) {
          expect(result.remaining).toBeLessThan(120);
          expect(result.resetAt).toBeGreaterThan(Date.now());
        }
      });

      it('should decrement remaining with each request', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'Authorization': `Bearer ${TEST_API_KEY}`,
        });

        const result1 = authenticateRequest(request);
        const result2 = authenticateRequest(request);

        if (result1.authenticated && result2.authenticated) {
          expect(result2.remaining).toBe(result1.remaining - 1);
        }
      });

      it('should reject when rate limit exceeded', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'Authorization': `Bearer ${TEST_API_KEY}`,
        });

        // Exhaust the rate limit
        for (let i = 0; i < 120; i++) {
          authenticateRequest(request);
        }

        // The 121st request should be rejected
        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(false);
        if (!result.authenticated) {
          expect(result.response.status).toBe(429);
          const body = await result.response.json();
          expect(body.error).toBe('Rate limit exceeded');
          expect(body.retryAfter).toBeGreaterThan(0);
          expect(result.response.headers.get('Retry-After')).toBeDefined();
        }
      });
    });

    describe('client ID extraction', () => {
      it('should derive client ID from API key prefix', async () => {
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'X-API-Key': TEST_API_KEY,
        });

        const result = authenticateRequest(request);
        if (result.authenticated) {
          expect(result.clientId).toContain('key:');
        }
      });

      it('should derive client ID from x-forwarded-for when no API key header for client ID', async () => {
        // Auth disabled so we can test IP-based client ID
        delete process.env.KALSHI_APP_API_KEY;
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'x-forwarded-for': '192.168.1.100, 10.0.0.1',
        });

        const result = authenticateRequest(request);
        if (result.authenticated) {
          expect(result.clientId).toBe('ip:192.168.1.100');
        }
      });

      it('should derive client ID from x-real-ip as fallback', async () => {
        delete process.env.KALSHI_APP_API_KEY;
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest({
          'x-real-ip': '10.0.0.50',
        });

        const result = authenticateRequest(request);
        if (result.authenticated) {
          expect(result.clientId).toBe('ip:10.0.0.50');
        }
      });

      it('should use "unknown" when no IP headers present', async () => {
        delete process.env.KALSHI_APP_API_KEY;
        const { authenticateRequest } = await import('../lib/api-auth');
        const request = createRequest();

        const result = authenticateRequest(request);
        if (result.authenticated) {
          expect(result.clientId).toBe('ip:unknown');
        }
      });
    });
  });

  describe('withAuth wrapper', () => {
    const TEST_API_KEY = 'wrapper-test-key-99';

    beforeEach(() => {
      process.env.KALSHI_APP_API_KEY = TEST_API_KEY;
    });

    it('should pass through to handler when authenticated', async () => {
      const { withAuth } = await import('../lib/api-auth');
      const { NextResponse } = await import('next/server');

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );

      const wrapped = withAuth(handler);
      const request = createRequest({
        'Authorization': `Bearer ${TEST_API_KEY}`,
      });

      const response = await wrapped(request);
      expect(handler).toHaveBeenCalledWith(request, undefined);
      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('120');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should return 401 when not authenticated', async () => {
      const { withAuth } = await import('../lib/api-auth');
      const { NextResponse } = await import('next/server');

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );

      const wrapped = withAuth(handler);
      const request = createRequest(); // No auth headers

      const response = await wrapped(request);
      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
    });

    it('should pass context to handler', async () => {
      const { withAuth } = await import('../lib/api-auth');
      const { NextResponse } = await import('next/server');

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ ok: true })
      );

      const wrapped = withAuth(handler);
      const request = createRequest({
        'Authorization': `Bearer ${TEST_API_KEY}`,
      });
      const context = { params: Promise.resolve({ id: '123' }) };

      await wrapped(request, context);
      expect(handler).toHaveBeenCalledWith(request, context);
    });
  });

  describe('authenticateRequest with undefined request', () => {
    it('should handle undefined request when auth disabled', async () => {
      delete process.env.KALSHI_APP_API_KEY;
      const { authenticateRequest } = await import('../lib/api-auth');

      const result = authenticateRequest(undefined);
      expect(result.authenticated).toBe(true);
    });

    it('should reject undefined request when auth enabled', async () => {
      process.env.KALSHI_APP_API_KEY = 'some-key';
      const { authenticateRequest } = await import('../lib/api-auth');

      const result = authenticateRequest(undefined);
      expect(result.authenticated).toBe(false);
    });
  });
});
