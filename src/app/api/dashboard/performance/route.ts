import { NextResponse } from 'next/server';
import { getBalance, getPositions, getOrders } from '@/lib/kalshi';
import { withAuth } from '@/lib/api-auth';
import { getDailyPnLService, getAnalyticsService, createUnrealizedPnLServiceWithPositions } from '@/lib/service-factories';
import { Position } from '@/types/position';
import type { WinLossStats } from '@/services/AnalyticsService';
import { createLogger } from '@/lib/logger';

const log = createLogger('PerformanceAPI');

export const GET = withAuth(async function GET() {
  try {
    const [balanceData, positionsData, ordersData] = await Promise.all([
      getBalance().catch(() => null),
      getPositions().catch(() => null),
      getOrders({ limit: 50 }).catch(() => null),
    ]);

    const positions = positionsData?.market_positions || [];
    const orders = ordersData?.orders || [];

    const totalRealizedPnl = positions.reduce((sum, p) => sum + p.realized_pnl, 0) / 100;
    const totalFees = positions.reduce((sum, p) => sum + p.fees_paid, 0) / 100;

    let dailyPnl = [] as Array<{
      date: string;
      realizedPnl: number;
      unrealizedPnl: number;
      fees: number;
      netPnl: number;
      cumulative: number;
    }>;
    let totalWins = 0;
    let totalLosses = 0;
    let totalRecordedTrades = 0;

    try {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      const { records } = await getDailyPnLService().getPnLRange(
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0]
      );

      records.forEach((record) => {
        totalWins += record.winCount;
        totalLosses += record.lossCount;
        totalRecordedTrades += record.tradesCount;
      });

      let cumulative = 0;
      dailyPnl = records.map((record) => {
        cumulative += record.netPnl;
        return {
          date: record.date,
          realizedPnl: record.realizedPnl,
          unrealizedPnl: record.unrealizedPnl,
          fees: record.fees,
          netPnl: record.netPnl,
          cumulative,
        };
      });
    } catch {
      dailyPnl = [];
    }

    if (dailyPnl.length === 0) {
      dailyPnl = [
        {
          date: new Date().toISOString().split('T')[0],
          realizedPnl: 0,
          unrealizedPnl: 0,
          fees: 0,
          netPnl: 0,
          cumulative: 0,
        },
      ];
    }

    const returns = dailyPnl.map((d) => d.netPnl);
    const sharpeRatio = calculateSharpeRatio(returns);
    const maxDrawdown = calculateMaxDrawdown(returns);
    const volatility = calculateVolatility(returns);

    // Per-trade P&L stats from AnalyticsService (KALSHI-014)
    let tradeStats: WinLossStats | null = null;
    let recentClosedTrades: Array<{
      id: string;
      ticker: string;
      side: string;
      direction: string;
      entryPrice: number;
      exitPrice: number | null;
      quantity: number;
      pnl: string;
      pnlPercent: string;
      result: string;
      holdingPeriod: number | null;
      entryDate: string;
      exitDate: string | null;
    }> = [];

    try {
      const analytics = getAnalyticsService();
      tradeStats = await analytics.calculateStats({ period: '30d' });
      const bestWorst = await analytics.getBestAndWorstTrades(5);
      const closedTrades = [...bestWorst.best, ...bestWorst.worst]
        .sort((a, b) => (b.exitDate?.getTime() ?? 0) - (a.exitDate?.getTime() ?? 0))
        .slice(0, 10);

      recentClosedTrades = closedTrades.map((t) => ({
        id: t.id,
        ticker: t.marketTicker,
        side: t.side,
        direction: t.direction,
        entryPrice: t.entryPrice / 100,
        exitPrice: t.exitPrice !== null ? t.exitPrice / 100 : null,
        quantity: t.entryQuantity,
        pnl: (t.netPnL / 100).toFixed(2),
        pnlPercent: t.pnlPercent.toFixed(2),
        result: t.result,
        holdingPeriod: t.holdingPeriod,
        entryDate: t.entryDate.toISOString(),
        exitDate: t.exitDate?.toISOString() ?? null,
      }));
    } catch {
      // Fall back to DailyPnL or order-based stats
    }

    // Use per-trade stats when available, fall back to DailyPnL aggregates
    const filledOrderCount = orders.filter((o) => o.status === 'executed' || o.fill_count > 0).length;
    const totalTrades = tradeStats?.totalTrades ?? (totalRecordedTrades || filledOrderCount);
    const wins = tradeStats?.winCount ?? (totalRecordedTrades ? totalWins : 0);
    const losses = tradeStats?.lossCount ?? (totalRecordedTrades ? totalLosses : 0);
    const winRate = tradeStats
      ? tradeStats.winRate * 100
      : totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const recentTrades = recentClosedTrades.length > 0
      ? recentClosedTrades
      : orders
          .filter((o) => o.status === 'executed' || o.fill_count > 0)
          .slice(0, 10)
          .map((o) => ({
            id: o.order_id,
            ticker: o.ticker,
            side: o.side,
            direction: o.side === 'yes' ? 'long' : 'short',
            entryPrice: (o.yes_price || o.no_price) / 100,
            exitPrice: null as number | null,
            quantity: o.fill_count,
            pnl: '0.00',
            pnlPercent: '0.00',
            result: 'UNKNOWN',
            holdingPeriod: null as number | null,
            entryDate: o.created_time,
            exitDate: null as string | null,
          }));

    let totalUnrealizedPnl = 0;
    try {
      const positionsForPnL: Position[] = positions
        .filter((p) => Math.abs(p.position) > 0)
        .map((p) => ({
          id: p.ticker,
          marketId: p.ticker,
          side: (p.position > 0 ? 'yes' : 'no') as 'yes' | 'no',
          quantity: Math.abs(p.position),
          avgPrice: Math.abs(p.market_exposure) / Math.abs(p.position),
          realizedPnl: p.realized_pnl / 100,
          unrealizedPnl: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

      if (positionsForPnL.length > 0) {
        const pnlService = createUnrealizedPnLServiceWithPositions(positionsForPnL);
        const summary = await pnlService.refreshAll();
        totalUnrealizedPnl = summary.totalUnrealizedPnl / 100; // cents to dollars
      }
    } catch {
      // Fall back to 0 if market prices unavailable
    }
    const summaryTotal = totalRealizedPnl + totalUnrealizedPnl - totalFees;

    const performanceData = {
      summary: {
        totalPnl: summaryTotal,
        realizedPnl: totalRealizedPnl,
        unrealizedPnl: totalUnrealizedPnl,
        fees: totalFees,
        portfolioValue: (balanceData?.portfolio_value || 0) / 100,
      },
      winRate,
      avgEdge: 0,
      totalTrades,
      wins,
      losses,
      dailyPnl,
      periods: {
        daily: dailyPnl[dailyPnl.length - 1]?.netPnl || 0,
        weekly: dailyPnl.slice(-7).reduce((sum, d) => sum + d.netPnl, 0),
        monthly: dailyPnl.reduce((sum, d) => sum + d.netPnl, 0),
      },
      metrics: {
        sharpeRatio,
        maxDrawdown,
        volatility,
        avgDailyReturn: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0,
      },
      perTradeMetrics: tradeStats ? {
        profitFactor: tradeStats.profitFactor === Infinity ? null : tradeStats.profitFactor,
        avgWin: tradeStats.avgWin / 100,
        avgLoss: tradeStats.avgLoss / 100,
        largestWin: tradeStats.largestWin / 100,
        largestLoss: tradeStats.largestLoss / 100,
        expectancy: tradeStats.expectancy / 100,
        avgHoldingDays: tradeStats.avgHoldingDays,
        breakeven: tradeStats.breakevenCount,
      } : null,
      strategies: [],
      recentTrades,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(performanceData);
  } catch (error) {
    log.error('Performance API error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to fetch live data' },
      { status: 500 }
    );
  }
});

// Helper functions
function calculateSharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length);
  if (std === 0) return 0;
  // Annualized (assuming daily returns)
  return (mean / std) * Math.sqrt(252);
}

function calculateMaxDrawdown(returns: number[]): number {
  let peak = 0;
  let maxDd = 0;
  let cumulative = 0;

  for (const r of returns) {
    cumulative += r;
    if (cumulative > peak) peak = cumulative;
    const dd = peak > 0 ? ((peak - cumulative) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  return maxDd;
}

function calculateVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  // Annualized
  return Math.sqrt(variance * 252);
}

