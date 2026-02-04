import { NextResponse } from 'next/server';
import { getBalance, getPositions } from '@/lib/kalshi';
import { withAuth } from '@/lib/api-auth';
import { getDailyPnLService, getKillSwitchService } from '@/lib/service-factories';

const DEFAULT_LIMITS = {
  maxDailyLoss: 500,
  maxDrawdown: 10,
  maxPositionSize: 100,
  maxExposure: 5000,
};

export const GET = withAuth(async function GET() {
  try {
    const [balanceData, positionsData] = await Promise.all([
      getBalance().catch(() => null),
      getPositions().catch(() => null),
    ]);

    const positions = positionsData?.market_positions || [];
    const totalExposure = positions.reduce((sum, p) => sum + Math.abs(p.market_exposure), 0);

    const exposureByCategory: Record<string, number> = {};
    positions.forEach((p) => {
      const category = p.ticker.split('-')[0] || 'Other';
      exposureByCategory[category] = (exposureByCategory[category] || 0) + Math.abs(p.market_exposure);
    });

    let marketLimits = new Map<string, number>();
    try {
      const { requirePrisma } = await import('@/lib/prisma');
      const prisma = requirePrisma();
      const tickers = positions.map((p) => p.ticker);
      if (tickers.length > 0) {
        const markets = await prisma.market.findMany({
          where: { externalId: { in: tickers } },
          select: { externalId: true, maxPositionSize: true },
        });
        marketLimits = new Map(
          markets.map((m) => [m.externalId, Number(m.maxPositionSize)])
        );
      }
    } catch {
      // No DB configured or market records missing
    }

    const positionLimits = positions.map((p) => {
      const maxPositionSize = marketLimits.get(p.ticker) ?? DEFAULT_LIMITS.maxPositionSize;
      return {
        ticker: p.ticker,
        current: Math.abs(p.position),
        max: maxPositionSize,
        utilization: maxPositionSize > 0 ? Math.min(100, (Math.abs(p.position) / maxPositionSize) * 100) : 0,
      };
    });

    const portfolioValue = balanceData?.portfolio_value || 0;
    const balance = balanceData?.balance || 0;
    const marginUsed = portfolioValue - balance;
    const marginUtilization = portfolioValue > 0 ? (marginUsed / portfolioValue) * 100 : 0;

    let todayPnL;
    try {
      todayPnL = await getDailyPnLService().getTodayPnL();
    } catch {
      todayPnL = null;
    }

    const realizedPnl = todayPnL?.realizedPnl ?? positions.reduce((sum, p) => sum + p.realized_pnl, 0) / 100;
    const dailyUsed = Math.abs(realizedPnl);

    let killSwitch = {
      enabled: true,
      status: 'active',
      triggeredAt: null as string | null,
      reason: null as string | null,
    };

    try {
      const activeKillSwitches = await getKillSwitchService().getActive();
      if (activeKillSwitches.length > 0) {
        killSwitch = {
          enabled: false,
          status: 'triggered',
          triggeredAt: activeKillSwitches[0].triggeredAt.toISOString(),
          reason: activeKillSwitches[0].reason,
        };
      }
    } catch {
      // Ignore kill switch errors
    }

    const warnings: string[] = [];
    if (marginUtilization > 70) {
      warnings.push(`Margin utilization at ${marginUtilization.toFixed(0)}%`);
    }
    if (totalExposure / 100 > DEFAULT_LIMITS.maxExposure * 0.8) {
      warnings.push('Total exposure approaching limit');
    }
    if (dailyUsed > DEFAULT_LIMITS.maxDailyLoss * 0.8) {
      warnings.push('Daily loss approaching limit');
    }

    const riskData = {
      isSafe:
        killSwitch.enabled &&
        marginUtilization < 80 &&
        totalExposure / 100 < DEFAULT_LIMITS.maxExposure &&
        dailyUsed < DEFAULT_LIMITS.maxDailyLoss,
      killSwitch,
      exposure: {
        total: totalExposure / 100,
        byCategory: Object.entries(exposureByCategory).map(([category, amount]) => ({
          category,
          amount: amount / 100,
          percentage: totalExposure > 0 ? (amount / totalExposure) * 100 : 0,
        })),
      },
      positionLimits: positionLimits.slice(0, 10),
      margin: {
        used: marginUsed / 100,
        available: balance / 100,
        total: portfolioValue / 100,
        utilization: marginUtilization,
      },
      pnl: {
        realized: realizedPnl,
        unrealized: todayPnL?.unrealizedPnl ?? 0,
        dailyLimit: DEFAULT_LIMITS.maxDailyLoss,
        dailyUsed,
        dailyUtilization: DEFAULT_LIMITS.maxDailyLoss > 0
          ? Math.min(100, (dailyUsed / DEFAULT_LIMITS.maxDailyLoss) * 100)
          : 0,
      },
      limits: DEFAULT_LIMITS,
      warnings,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(riskData);
  } catch (error) {
    console.error('Risk API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live data' },
      { status: 500 }
    );
  }
});
