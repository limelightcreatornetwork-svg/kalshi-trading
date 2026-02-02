import { NextResponse } from 'next/server';
import { getBalance } from '@/lib/kalshi';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    api: {
      status: 'up' | 'down';
      latencyMs?: number;
      error?: string;
    };
    database: {
      status: 'up' | 'down' | 'unknown';
    };
  };
}

export async function GET() {
  const startTime = Date.now();
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    checks: {
      api: { status: 'down' },
      database: { status: 'unknown' },
    },
  };

  // Check Kalshi API connectivity
  try {
    await getBalance();
    health.checks.api = {
      status: 'up',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    health.checks.api = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    health.status = 'degraded';
  }

  // Check database connectivity (if Prisma is configured)
  try {
    const { requirePrisma } = await import('@/lib/prisma');
    await requirePrisma().$queryRaw`SELECT 1`;
    health.checks.database = { status: 'up' };
  } catch {
    health.checks.database = { status: 'down' };
    if (health.status === 'healthy') {
      health.status = 'degraded';
    }
  }

  // Determine overall status
  if (health.checks.api.status === 'down') {
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
