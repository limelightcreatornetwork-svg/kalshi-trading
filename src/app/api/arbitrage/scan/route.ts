import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";
import { scanForArbitrage, filterProfitableOpportunities, calculateProfit, ArbitrageScanResult } from "@/lib/arbitrage";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minProfit = parseInt(searchParams.get("minProfit") || "5"); // $0.05 min after fees
  const minVolume = parseInt(searchParams.get("minVolume") || "1000"); // Minimum liquidity
  const limit = parseInt(searchParams.get("limit") || "50");
  const type = searchParams.get("type"); // 'single_market' | 'cross_market' | undefined
  const contracts = parseInt(searchParams.get("contracts") || "10");

  try {
    // Fetch all active markets
    const markets = await kalshiClient.getMarkets({
      status: 'active',
      limit: 500,
    });

    // Filter by minimum liquidity
    const liquidMarkets = markets.filter(m => m.volume >= minVolume);

    // Run arbitrage scan
    const scanResult = scanForArbitrage(liquidMarkets);

    // Filter by minimum net profit after fees
    let opportunities = filterProfitableOpportunities(
      scanResult.opportunities,
      minProfit,
      contracts
    );

    // Add fee calculations to each opportunity
    opportunities = opportunities.map(opp => {
      const profitCalc = calculateProfit(opp, contracts);
      return {
        ...opp,
        profitCalculation: {
          contracts,
          grossProfit: profitCalc.grossProfit,
          estimatedFees: profitCalc.fees,
          netProfit: profitCalc.netProfit,
        }
      };
    });

    if (type) {
      opportunities = opportunities.filter(opp => opp.type === type);
    }

    // Sort by net profit descending
    opportunities.sort((a, b) => {
      const aProfit = calculateProfit(a, contracts).netProfit;
      const bProfit = calculateProfit(b, contracts).netProfit;
      return bProfit - aProfit;
    });

    // Apply limit
    opportunities = opportunities.slice(0, limit);

    const response: ArbitrageScanResult & { 
      demo: boolean; 
      filtered: { minProfit: number; minVolume: number; type: string | null; limit: number; contracts: number }
    } = {
      ...scanResult,
      opportunities,
      marketsScanned: liquidMarkets.length,
      demo: !kalshiClient.isConfigured(),
      filtered: {
        minProfit,
        minVolume,
        type,
        limit,
        contracts,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error scanning for arbitrage:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: "Failed to scan for arbitrage opportunities",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST endpoint to execute an arbitrage opportunity
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { opportunityId, contracts, steps } = body;

    if (!opportunityId || !contracts || !steps?.length) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: opportunityId, contracts, steps" },
        { status: 400 }
      );
    }

    // Execute each step in order
    const results = [];
    for (const step of steps) {
      const orderResult = await kalshiClient.createOrder({
        ticker: step.ticker,
        action: step.action,
        side: step.side,
        type: 'limit',
        count: contracts,
        limit_price: step.price,
      });
      
      results.push({
        step: step.order,
        ticker: step.ticker,
        result: orderResult,
      });

      // Stop if any order fails
      if (!orderResult.success) {
        return NextResponse.json({
          ok: false,
          error: `Step ${step.order} failed: ${orderResult.error}`,
          completedSteps: results,
          demo: !kalshiClient.isConfigured(),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      opportunityId,
      contracts,
      executedSteps: results,
      demo: !kalshiClient.isConfigured(),
    });
  } catch (error) {
    console.error("Error executing arbitrage:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: "Failed to execute arbitrage",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
