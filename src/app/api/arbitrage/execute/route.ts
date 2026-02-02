// POST /api/arbitrage/execute - Execute an arbitrage opportunity

import { NextRequest, NextResponse } from 'next/server';
import { KalshiApiError } from '@/lib/kalshi';

// Dynamically import the service to avoid Prisma initialization at build time
async function getArbitrageService() {
  const { arbitrageService } = await import('@/services/ArbitrageService');
  return arbitrageService;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { opportunityId, contracts, maxSlippage } = body;
    
    if (!opportunityId) {
      return NextResponse.json(
        { success: false, error: 'opportunityId is required' },
        { status: 400 }
      );
    }
    
    if (!contracts || contracts < 1) {
      return NextResponse.json(
        { success: false, error: 'contracts must be at least 1' },
        { status: 400 }
      );
    }
    
    const arbitrageService = await getArbitrageService();
    const result = await arbitrageService.executeOpportunity({
      opportunityId,
      contracts,
      maxSlippage,
    });
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Arbitrage execute error:', error);
    
    if (error instanceof KalshiApiError) {
      return NextResponse.json(
        { success: false, error: error.apiMessage },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Execution failed' },
      { status: 500 }
    );
  }
}
