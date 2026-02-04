import { NextResponse } from 'next/server';
import { KalshiApiError } from '@/lib/kalshi';
import { createLogger } from '@/lib/logger';

const log = createLogger('API');

/**
 * Standard error handler for API routes.
 * Handles KalshiApiError with proper status codes, falls back to 500.
 */
export function handleApiError(error: unknown, fallbackMessage: string) {
  log.error(fallbackMessage, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  if (error instanceof KalshiApiError) {
    return NextResponse.json(
      { success: false, error: error.apiMessage },
      { status: error.statusCode }
    );
  }

  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 }
  );
}

/**
 * Dynamically import ArbitrageService to avoid Prisma initialization at build time.
 */
export async function getArbitrageService() {
  const { arbitrageService } = await import('@/services/ArbitrageService');
  return arbitrageService;
}

/**
 * Dynamically import Prisma to avoid initialization at build time.
 */
export async function getPrisma() {
  const { requirePrisma } = await import('@/lib/prisma');
  return requirePrisma();
}
