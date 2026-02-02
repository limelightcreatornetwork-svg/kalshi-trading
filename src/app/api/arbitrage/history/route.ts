// GET /api/arbitrage/history - Get historical arbitrage opportunities

import { NextRequest, NextResponse } from 'next/server';

// Dynamically import the service to avoid Prisma initialization at build time
async function getArbitrageService() {
  const { arbitrageService } = await import('@/services/ArbitrageService');
  return arbitrageService;
}

export async function GET(request: NextRequest) {
  try {
    const arbitrageService = await getArbitrageService();
    const searchParams = request.nextUrl.searchParams;
    
    const params = {
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      type: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
      minProfitCents: searchParams.get('minProfitCents') ? parseFloat(searchParams.get('minProfitCents')!) : undefined,
    };
    
    const history = await arbitrageService.getOpportunityHistory(params);
    
    return NextResponse.json({
      success: true,
      data: {
        opportunities: history,
        count: history.length,
      },
    });
  } catch (error) {
    console.error('Arbitrage history error:', error);
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get history' },
      { status: 500 }
    );
  }
}
