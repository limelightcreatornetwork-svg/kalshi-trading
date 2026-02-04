// GET /api/positions - Get current positions
import { NextRequest, NextResponse } from 'next/server';
import { getPositions } from '@/lib/kalshi';
import { handleApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-auth';

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const params = {
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      cursor: searchParams.get('cursor') || undefined,
      ticker: searchParams.get('ticker') || undefined,
      event_ticker: searchParams.get('event_ticker') || undefined,
      settlement_status: searchParams.get('settlement_status') || undefined,
    };

    const response = await getPositions(params);

    // Transform market positions
    const marketPositions = response.market_positions.map(pos => ({
      ticker: pos.ticker,
      totalTraded: pos.total_traded,
      totalTradedDollars: (pos.total_traded / 100).toFixed(2),
      position: pos.position,
      marketExposure: pos.market_exposure,
      marketExposureDollars: (pos.market_exposure / 100).toFixed(2),
      realizedPnl: pos.realized_pnl,
      realizedPnlDollars: (pos.realized_pnl / 100).toFixed(2),
      restingOrdersCount: pos.resting_orders_count,
      feesPaid: pos.fees_paid,
      feesPaidDollars: (pos.fees_paid / 100).toFixed(2),
      lastUpdatedAt: pos.last_updated_ts,
    }));

    // Transform event positions
    const eventPositions = response.event_positions.map(pos => ({
      eventTicker: pos.event_ticker,
      totalCost: pos.total_cost,
      totalCostDollars: (pos.total_cost / 100).toFixed(2),
      eventExposure: pos.event_exposure,
      eventExposureDollars: (pos.event_exposure / 100).toFixed(2),
      realizedPnl: pos.realized_pnl,
      realizedPnlDollars: (pos.realized_pnl / 100).toFixed(2),
      feesPaid: pos.fees_paid,
      feesPaidDollars: (pos.fees_paid / 100).toFixed(2),
    }));

    return NextResponse.json({
      success: true,
      data: {
        marketPositions,
        eventPositions,
        cursor: response.cursor,
        marketPositionsCount: marketPositions.length,
        eventPositionsCount: eventPositions.length,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch positions');
  }
});
