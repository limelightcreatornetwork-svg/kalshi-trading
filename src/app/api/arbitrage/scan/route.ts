import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";
import { scanForArbitrage, ArbitrageScanResult } from "@/lib/arbitrage";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minProfit = parseInt(searchParams.get("minProfit") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const type = searchParams.get("type"); // 'single_market' | 'cross_market' | undefined

  try {
    // Fetch all active markets
    const markets = await kalshiClient.getMarkets({
      status: 'active',
      limit: 500,
    });

    // Run arbitrage scan
    const scanResult = scanForArbitrage(markets);

    // Filter results
    let opportunities = scanResult.opportunities
      .filter(opp => opp.profitPotential >= minProfit);

    if (type) {
      opportunities = opportunities.filter(opp => opp.type === type);
    }

    // Apply limit
    opportunities = opportunities.slice(0, limit);

    const response: ArbitrageScanResult & { 
      demo: boolean; 
      filtered: { minProfit: number; type: string | null; limit: number }
    } = {
      ...scanResult,
      opportunities,
      demo: !kalshiClient.isConfigured(),
      filtered: {
        minProfit,
        type,
        limit,
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
