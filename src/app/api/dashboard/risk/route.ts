import { NextResponse } from 'next/server';
import { getBalance, getPositions, Market as KalshiMarket } from '@/lib/kalshi';

// Risk data aggregation endpoint
export async function GET() {
  try {
    // Fetch real data from Kalshi
    const [balanceData, positionsData] = await Promise.all([
      getBalance().catch(() => null),
      getPositions().catch(() => null),
    ]);

    // Calculate exposure from positions
    const positions = positionsData?.market_positions || [];
    const totalExposure = positions.reduce((sum, p) => sum + Math.abs(p.market_exposure), 0);
    const unrealizedPnl = positions.reduce((sum, p) => sum + p.realized_pnl, 0);
    
    // Group positions by category (using first part of ticker as proxy)
    const exposureByCategory: Record<string, number> = {};
    positions.forEach((p) => {
      const category = p.ticker.split('-')[0] || 'Other';
      exposureByCategory[category] = (exposureByCategory[category] || 0) + Math.abs(p.market_exposure);
    });

    // Calculate position limits
    const maxPositionSize = 100; // contracts
    const maxPositions = positions.map((p) => ({
      ticker: p.ticker,
      current: Math.abs(p.position),
      max: maxPositionSize,
      utilization: Math.min(100, (Math.abs(p.position) / maxPositionSize) * 100),
    }));

    // Calculate margin utilization
    const portfolioValue = balanceData?.portfolio_value || 0;
    const balance = balanceData?.balance || 0;
    const marginUsed = portfolioValue - balance;
    const marginUtilization = portfolioValue > 0 ? (marginUsed / portfolioValue) * 100 : 0;

    // Risk summary
    const riskData = {
      // Overall status
      isSafe: marginUtilization < 80 && totalExposure < 5000,
      
      // Kill switch (mock - would come from service)
      killSwitch: {
        enabled: true,
        status: 'active',
        triggeredAt: null,
        reason: null,
      },
      
      // Exposure metrics
      exposure: {
        total: totalExposure / 100, // Convert from cents to dollars
        byCategory: Object.entries(exposureByCategory).map(([category, amount]) => ({
          category,
          amount: amount / 100,
          percentage: totalExposure > 0 ? (amount / totalExposure) * 100 : 0,
        })),
      },
      
      // Position limits
      positionLimits: maxPositions.slice(0, 10), // Top 10
      
      // Margin
      margin: {
        used: marginUsed / 100,
        available: balance / 100,
        total: portfolioValue / 100,
        utilization: marginUtilization,
      },
      
      // P&L
      pnl: {
        unrealized: unrealizedPnl / 100,
        dailyLimit: 500,
        dailyUsed: Math.abs(unrealizedPnl) / 100,
        dailyUtilization: Math.min(100, (Math.abs(unrealizedPnl) / 50000) * 100),
      },
      
      // Risk limits
      limits: {
        maxDailyLoss: 500,
        maxDrawdown: 10, // percentage
        maxPositionSize: maxPositionSize,
        maxExposure: 5000,
      },
      
      // Warnings
      warnings: [] as string[],
      
      // Last updated
      lastUpdated: new Date().toISOString(),
    };

    // Generate warnings
    if (marginUtilization > 70) {
      riskData.warnings.push(`Margin utilization at ${marginUtilization.toFixed(0)}%`);
    }
    if (totalExposure / 100 > 4000) {
      riskData.warnings.push(`Total exposure approaching limit`);
    }

    return NextResponse.json(riskData);
  } catch (error) {
    console.error('Risk API error:', error);
    
    // Return mock data if API fails
    return NextResponse.json({
      isSafe: true,
      killSwitch: {
        enabled: true,
        status: 'active',
        triggeredAt: null,
        reason: null,
      },
      exposure: {
        total: 0,
        byCategory: [],
      },
      positionLimits: [],
      margin: {
        used: 0,
        available: 0,
        total: 0,
        utilization: 0,
      },
      pnl: {
        unrealized: 0,
        dailyLimit: 500,
        dailyUsed: 0,
        dailyUtilization: 0,
      },
      limits: {
        maxDailyLoss: 500,
        maxDrawdown: 10,
        maxPositionSize: 100,
        maxExposure: 5000,
      },
      warnings: [],
      lastUpdated: new Date().toISOString(),
      error: 'Failed to fetch live data',
    });
  }
}
