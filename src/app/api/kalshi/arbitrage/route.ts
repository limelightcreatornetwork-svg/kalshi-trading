import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";
import { scanForArbitrage, filterProfitableOpportunities, calculateProfit } from "@/lib/arbitrage";

export const dynamic = 'force-dynamic';

/**
 * GET /api/kalshi/arbitrage
 * 
 * Scan for arbitrage opportunities with configurable thresholds
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Configuration
  const minProfitCents = parseInt(searchParams.get("minProfit") || "5"); // $0.05 after fees
  const minVolume = parseInt(searchParams.get("minVolume") || "1000");
  const contracts = parseInt(searchParams.get("contracts") || "10");
  const maxBudgetCents = parseInt(searchParams.get("maxBudget") || "5000"); // $50 default
  const type = searchParams.get("type"); // 'single_market' | 'cross_market'

  try {
    // Fetch active markets with liquidity
    const markets = await kalshiClient.getMarkets({
      status: 'active',
      limit: 500,
    });

    // Filter by liquidity
    const liquidMarkets = markets.filter(m => m.volume >= minVolume);

    // Scan for arbitrage
    const scanResult = scanForArbitrage(liquidMarkets);

    // Filter profitable opportunities after fees
    let opportunities = filterProfitableOpportunities(
      scanResult.opportunities,
      minProfitCents,
      contracts
    );

    // Filter by type if specified
    if (type === 'single_market' || type === 'cross_market') {
      opportunities = opportunities.filter(opp => opp.type === type);
    }

    // Filter by budget (cost to execute must be within budget)
    opportunities = opportunities.filter(opp => {
      const totalCost = opp.executionSteps.reduce((sum, step) => {
        return sum + (step.price * contracts);
      }, 0);
      return totalCost <= maxBudgetCents;
    });

    // Calculate profits and sort
    const opportunitiesWithProfit = opportunities
      .map(opp => {
        const profit = calculateProfit(opp, contracts);
        const totalCost = opp.executionSteps.reduce((sum, step) => sum + step.price * contracts, 0);
        return {
          ...opp,
          calculation: {
            contracts,
            totalCostCents: totalCost,
            grossProfitCents: profit.grossProfit,
            feesCents: profit.fees,
            netProfitCents: profit.netProfit,
            netProfitDollars: (profit.netProfit / 100).toFixed(2),
            roi: ((profit.netProfit / totalCost) * 100).toFixed(2) + '%',
          }
        };
      })
      .sort((a, b) => b.calculation.netProfitCents - a.calculation.netProfitCents);

    return NextResponse.json({
      ok: true,
      opportunities: opportunitiesWithProfit,
      summary: {
        found: opportunitiesWithProfit.length,
        marketsScanned: liquidMarkets.length,
        totalMarketsAvailable: markets.length,
        scanDuration: scanResult.scanDuration,
        thresholds: {
          minProfitCents,
          minVolume,
          contracts,
          maxBudgetCents,
        }
      },
      demo: !kalshiClient.isConfigured(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Arbitrage scan error:", error);
    return NextResponse.json(
      { ok: false, error: "Arbitrage scan failed", details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
