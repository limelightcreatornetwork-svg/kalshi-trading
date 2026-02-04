// POST /api/arbitrage/execute - Execute an arbitrage opportunity

import { NextRequest, NextResponse } from 'next/server';
import { getArbitrageService, handleApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-auth';

export const POST = withAuth(async function POST(request: NextRequest) {
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
    return handleApiError(error, 'Execution failed');
  }
});
