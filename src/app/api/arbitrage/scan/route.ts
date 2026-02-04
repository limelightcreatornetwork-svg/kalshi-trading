// POST /api/arbitrage/scan - Scan markets for arbitrage opportunities
// GET /api/arbitrage/scan - Get latest scan results

import { NextRequest, NextResponse } from 'next/server';
import { KalshiApiError } from '@/lib/kalshi';
import { withAuth } from '@/lib/api-auth';

// Dynamically import the service to avoid Prisma initialization at build time
async function getArbitrageService() {
  const { arbitrageService } = await import('@/services/ArbitrageService');
  return arbitrageService;
}

export const POST = withAuth(async function POST() {
  try {
    const arbitrageService = await getArbitrageService();
    const result = await arbitrageService.scanForOpportunities();
    
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Arbitrage scan error:', error);
    
    if (error instanceof KalshiApiError) {
      return NextResponse.json(
        { success: false, error: error.apiMessage },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Scan failed' },
      { status: 500 }
    );
  }
});

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const arbitrageService = await getArbitrageService();
    const searchParams = request.nextUrl.searchParams;
    const includeAll = searchParams.get('includeAll') === 'true';
    
    // Get active opportunities
    const opportunities = await arbitrageService.getActiveOpportunities();
    
    // Get scan stats
    const stats = await arbitrageService.getScanStats();
    
    const response: Record<string, unknown> = {
      success: true,
      data: {
        opportunities,
        stats,
        count: opportunities.length,
      },
    };
    
    // Optionally include full history
    if (includeAll) {
      (response.data as Record<string, unknown>).history = await arbitrageService.getOpportunityHistory({ limit: 50 });
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Arbitrage scan GET error:', error);
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get opportunities' },
      { status: 500 }
    );
  }
});
