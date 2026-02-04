// GET /api/arbitrage/history - Get historical arbitrage opportunities

import { NextRequest, NextResponse } from 'next/server';
import { getArbitrageService, handleApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-auth';

export const GET = withAuth(async function GET(request: NextRequest) {
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
    return handleApiError(error, 'Failed to get history');
  }
});
