import { NextResponse } from 'next/server';
import { KalshiApiError } from '@/lib/kalshi';

/**
 * Standard error handler for API routes.
 * Handles KalshiApiError with proper status codes, falls back to 500.
 */
export function handleApiError(error: unknown, fallbackMessage: string) {
  console.error(`${fallbackMessage}:`, error);

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
