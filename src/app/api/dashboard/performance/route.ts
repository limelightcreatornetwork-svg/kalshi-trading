import { NextResponse } from 'next/server';
import { getBalance, getPositions, getOrders } from '@/lib/kalshi';
import { withAuth } from '@/lib/api-auth';
import { getDailyPnLService } from '@/lib/service-factories';

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
      const records = await getDailyPnLService().getRange(
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

    const filledOrderCount = orders.filter((o) => o.status === 'executed' || o.fill_count > 0).length;
    const totalTrades = totalRecordedTrades || filledOrderCount;
    const wins = totalRecordedTrades ? totalWins : 0;
    const losses = totalRecordedTrades ? totalLosses : 0;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const recentTrades = orders
      .filter((o) => o.status === 'executed' || o.fill_count > 0)
      .slice(0, 10)
      .map((o) => ({
        id: o.order_id,
        ticker: o.ticker,
        side: o.side,
        action: o.action,
        quantity: o.fill_count,
        price: (o.yes_price || o.no_price) / 100,
        pnl: '0.00',
        thesis: getThesisForTrade(o.ticker),
        timestamp: o.created_time,
      }));

    const totalUnrealizedPnl = 0;
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
      strategies: [],
      recentTrades,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(performanceData);
  } catch (error) {
    console.error('Performance API error:', error);
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

function getThesisForTrade(ticker: string): string {
  const theses: Record<string, string> = {
    KXBTC: 'BTC thesis tracked in strategy notes',
    KXETH: 'ETH thesis tracked in strategy notes',
    KXSPY: 'SPY thesis tracked in strategy notes',
    KXFED: 'Fed thesis tracked in strategy notes',
  };

  for (const [key, thesis] of Object.entries(theses)) {
    if (ticker.includes(key)) return thesis;
  }

  return 'No thesis data recorded';
}
