/**
 * API Authentication + Rate Limiting
 *
 * Protects sensitive API endpoints with an API key
 * and applies a simple in-memory rate limit.
 */

import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.KALSHI_APP_API_KEY?.trim() ?? '';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

const rateLimitState = new Map<string, { count: number; resetAt: number }>();

function getHeader(request: NextRequest | undefined, name: string): string | null {
  return request?.headers?.get?.(name) ?? null;
}

function isAuthenticated(request: NextRequest | undefined): boolean {
  if (!API_KEY) {
    return true;
  }

  const authHeader = getHeader(request, 'Authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token === API_KEY) {
      return true;
    }
    if (authHeader === API_KEY) {
      return true;
    }
  }

  const apiKeyHeader = getHeader(request, 'X-API-Key');
  if (apiKeyHeader === API_KEY) {
    return true;
  }

  return false;
}

function getClientId(request: NextRequest | undefined): string {
  const apiKey = getHeader(request, 'X-API-Key') || getHeader(request, 'Authorization');
  if (apiKey) {
    return `key:${apiKey.slice(0, 8)}`;
  }

  const forwarded = getHeader(request, 'x-forwarded-for');
  const realIp = getHeader(request, 'x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';

  return `ip:${ip}`;
}

function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const state = rateLimitState.get(clientId);

  if (state && state.resetAt < now) {
    rateLimitState.delete(clientId);
  }

  const current = rateLimitState.get(clientId) || {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  };

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  rateLimitState.set(clientId, current);

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - current.count,
    resetAt: current.resetAt,
  };
}

function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'Unauthorized',
      message: 'Valid API key required. Set X-API-Key or Authorization: Bearer <key>.',
    },
    { status: 401 }
  );
}

function rateLimitResponse(resetAt: number): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  const response = NextResponse.json(
    {
      success: false,
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter,
    },
    { status: 429 }
  );

  response.headers.set('Retry-After', retryAfter.toString());
  return response;
}

export type AuthResult =
  | { authenticated: true; clientId: string; remaining: number; resetAt: number }
  | { authenticated: false; response: NextResponse };

export function authenticateRequest(request: NextRequest | undefined): AuthResult {
  if (!isAuthenticated(request)) {
    return { authenticated: false, response: unauthorizedResponse() };
  }

  const clientId = getClientId(request);
  const rateLimit = checkRateLimit(clientId);

  if (!rateLimit.allowed) {
    return { authenticated: false, response: rateLimitResponse(rateLimit.resetAt) };
  }

  return {
    authenticated: true,
    clientId,
    remaining: rateLimit.remaining,
    resetAt: rateLimit.resetAt,
  };
}

type RouteContext = { params: Promise<Record<string, string>> };

export function withAuth(
  handler: (request: NextRequest, context?: RouteContext) => Promise<NextResponse>
): (request: NextRequest, context?: RouteContext) => Promise<NextResponse> {
  return async (request: NextRequest, context?: RouteContext): Promise<NextResponse> => {
    const authResult = authenticateRequest(request);

    if (!authResult.authenticated) {
      return authResult.response;
    }

    const response = await handler(request, context);
    response.headers.set('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
    response.headers.set('X-RateLimit-Remaining', authResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', authResult.resetAt.toString());

    return response;
  };
}

export function isAuthEnabled(): boolean {
  return !!API_KEY;
}
