/**
 * GET /api/analytics/stats - Win/Loss Statistics
 * 
 * Query params:
 * - period: '7d' | '30d' | '90d' | 'all' (default: 'all')
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyticsService } from '../history/route';
import type { StatsTimeFilter } from '@/services/AnalyticsService';
import { withAuth } from '@/lib/api-auth';

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const periodParam = searchParams.get('period') ?? 'all';
    
    // Validate period
    const validPeriods = ['7d', '30d', '90d', 'all'];
    if (!validPeriods.includes(periodParam)) {
      return NextResponse.json(
        { success: false, error: `Invalid period. Must be one of: ${validPeriods.join(', ')}` },
        { status: 400 }
      );
    }

    const filter: StatsTimeFilter = {
      period: periodParam as '7d' | '30d' | '90d' | 'all',
    };

    const stats = await analyticsService.calculateStats(filter);
    const bestWorst = await analyticsService.getBestAndWorstTrades(5);

    // Format best/worst trades
    const formatTrade = (t: typeof bestWorst.best[0]) => ({
      id: t.id,
      marketTicker: t.marketTicker,
      marketTitle: t.marketTitle,
      side: t.side,
      direction: t.direction,
      entryPrice: t.entryPrice,
      entryPriceDollars: (t.entryPrice / 100).toFixed(2),
      exitPrice: t.exitPrice,
      exitPriceDollars: t.exitPrice ? (t.exitPrice / 100).toFixed(2) : null,
      netPnL: t.netPnL,
      netPnLDollars: (t.netPnL / 100).toFixed(2),
      pnlPercent: t.pnlPercent.toFixed(2) + '%',
      result: t.result,
      holdingPeriod: t.holdingPeriod,
      entryDate: t.entryDate.toISOString(),
      exitDate: t.exitDate?.toISOString() ?? null,
    });

    return NextResponse.json({
      success: true,
      data: {
        period: periodParam,
        
        // Trade counts
        trades: {
          total: stats.totalTrades,
          open: stats.openTrades,
          closed: stats.closedTrades,
          wins: stats.winCount,
          losses: stats.lossCount,
          breakeven: stats.breakevenCount,
          winRate: (stats.winRate * 100).toFixed(1) + '%',
          winRateDecimal: stats.winRate,
        },
        
        // P&L metrics (all in cents, with dollar conversion)
        pnl: {
          total: stats.totalPnL,
          totalDollars: (stats.totalPnL / 100).toFixed(2),
          realized: stats.totalRealizedPnL,
          realizedDollars: (stats.totalRealizedPnL / 100).toFixed(2),
          unrealized: stats.totalUnrealizedPnL,
          unrealizedDollars: (stats.totalUnrealizedPnL / 100).toFixed(2),
          average: stats.avgPnL,
          averageDollars: (stats.avgPnL / 100).toFixed(2),
          avgWin: stats.avgWin,
          avgWinDollars: (stats.avgWin / 100).toFixed(2),
          avgLoss: stats.avgLoss,
          avgLossDollars: (stats.avgLoss / 100).toFixed(2),
          largestWin: stats.largestWin,
          largestWinDollars: (stats.largestWin / 100).toFixed(2),
          largestLoss: stats.largestLoss,
          largestLossDollars: (stats.largestLoss / 100).toFixed(2),
        },
        
        // Advanced metrics
        metrics: {
          profitFactor: stats.profitFactor === Infinity ? 'Infinity' : stats.profitFactor.toFixed(2),
          profitFactorRaw: stats.profitFactor,
          sharpeRatio: stats.sharpeRatio.toFixed(2),
          sharpeRatioRaw: stats.sharpeRatio,
          sortinoRatio: stats.sortinoRatio === Infinity ? 'Infinity' : stats.sortinoRatio.toFixed(2),
          sortinoRatioRaw: stats.sortinoRatio,
          expectancy: stats.expectancy,
          expectancyDollars: (stats.expectancy / 100).toFixed(2),
        },
        
        // Drawdown
        drawdown: {
          max: stats.maxDrawdown,
          maxDollars: (stats.maxDrawdown / 100).toFixed(2),
          maxPercent: (stats.maxDrawdownPercent * 100).toFixed(2) + '%',
          maxPercentDecimal: stats.maxDrawdownPercent,
          current: stats.currentDrawdown,
          currentPercent: (stats.currentDrawdown * 100).toFixed(2) + '%',
        },
        
        // Holding period
        holdingPeriod: {
          average: stats.avgHoldingDays.toFixed(1) + ' days',
          averageDays: stats.avgHoldingDays,
          avgWin: stats.avgWinHoldingDays.toFixed(1) + ' days',
          avgWinDays: stats.avgWinHoldingDays,
          avgLoss: stats.avgLossHoldingDays.toFixed(1) + ' days',
          avgLossDays: stats.avgLossHoldingDays,
        },
        
        // Best/worst trades
        bestTrades: bestWorst.best.map(formatTrade),
        worstTrades: bestWorst.worst.map(formatTrade),
      },
    });
  } catch (error) {
    console.error('Analytics stats API error:', error);
    
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics stats';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
