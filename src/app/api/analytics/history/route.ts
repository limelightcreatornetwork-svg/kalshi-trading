/**
 * GET /api/analytics/history - Daily P&L History
 * 
 * Query params:
 * - startDate: YYYY-MM-DD (default: 30 days ago)
 * - endDate: YYYY-MM-DD (default: today)
 * - limit: number (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  AnalyticsService, 
  InMemorySnapshotStorage, 
  InMemoryTradeStorage,
  type DailySnapshot,
} from '@/services/AnalyticsService';
import { withAuth } from '@/lib/api-auth';

// Shared service instance with storage
const snapshotStorage = new InMemorySnapshotStorage();
const tradeStorage = new InMemoryTradeStorage();

// Export for testing and sharing across API routes
export const analyticsService = new AnalyticsService(snapshotStorage, tradeStorage);
export { snapshotStorage, tradeStorage };

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const query = {
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
    };

    const result = await analyticsService.getSnapshotHistory(query);

    // Transform snapshots for API response
    const snapshots = result.snapshots.map(s => ({
      id: s.id,
      date: s.date,
      portfolioValue: s.portfolioValue,
      portfolioValueDollars: (s.portfolioValue / 100).toFixed(2),
      cashBalance: s.cashBalance,
      cashBalanceDollars: (s.cashBalance / 100).toFixed(2),
      positionValue: s.positionValue,
      positionValueDollars: (s.positionValue / 100).toFixed(2),
      realizedPnL: s.realizedPnL,
      realizedPnLDollars: (s.realizedPnL / 100).toFixed(2),
      unrealizedPnL: s.unrealizedPnL,
      unrealizedPnLDollars: (s.unrealizedPnL / 100).toFixed(2),
      dailyPnL: s.dailyPnL,
      dailyPnLDollars: (s.dailyPnL / 100).toFixed(2),
      openPositions: s.openPositions,
      closedPositions: s.closedPositions,
      drawdownPercent: (s.drawdownPercent * 100).toFixed(2) + '%',
      highWaterMark: s.highWaterMark,
    }));

    return NextResponse.json({
      success: true,
      data: {
        snapshots,
        count: snapshots.length,
        summary: {
          startValue: result.summary.startValue,
          startValueDollars: (result.summary.startValue / 100).toFixed(2),
          endValue: result.summary.endValue,
          endValueDollars: (result.summary.endValue / 100).toFixed(2),
          totalReturn: result.summary.totalReturn,
          totalReturnDollars: (result.summary.totalReturn / 100).toFixed(2),
          totalReturnPercent: result.summary.totalReturnPercent.toFixed(2) + '%',
          maxDrawdown: (result.summary.maxDrawdown * 100).toFixed(2) + '%',
          avgDailyReturn: result.summary.avgDailyReturn,
          avgDailyReturnDollars: (result.summary.avgDailyReturn / 100).toFixed(2),
        },
      },
    });
  } catch (error) {
    console.error('Analytics history API error:', error);
    
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics history';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});

// POST to create/update daily snapshot
export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const requiredFields = ['portfolioValue', 'cashBalance', 'positionValue'];
    for (const field of requiredFields) {
      if (body[field] === undefined) {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    const snapshot = await analyticsService.createDailySnapshot({
      portfolioValue: body.portfolioValue,
      cashBalance: body.cashBalance,
      positionValue: body.positionValue,
      realizedPnL: body.realizedPnL ?? 0,
      unrealizedPnL: body.unrealizedPnL ?? 0,
      openPositions: body.openPositions ?? 0,
      closedPositions: body.closedPositions ?? 0,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: snapshot.id,
        date: snapshot.date,
        portfolioValue: snapshot.portfolioValue,
        portfolioValueDollars: (snapshot.portfolioValue / 100).toFixed(2),
        dailyPnL: snapshot.dailyPnL,
        dailyPnLDollars: (snapshot.dailyPnL / 100).toFixed(2),
        drawdownPercent: (snapshot.drawdownPercent * 100).toFixed(2) + '%',
      },
    });
  } catch (error) {
    console.error('Analytics history POST error:', error);
    
    const message = error instanceof Error ? error.message : 'Failed to create snapshot';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
