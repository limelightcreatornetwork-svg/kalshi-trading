import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";
import { calculateProfit } from "@/lib/arbitrage";

export const dynamic = 'force-dynamic';

interface ExecutionStep {
  order: number;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  ticker: string;
  price: number;
  description: string;
}

interface ExecuteRequest {
  opportunityId: string;
  contracts: number;
  steps: ExecutionStep[];
  dryRun?: boolean;
}

/**
 * POST /api/kalshi/execute
 * 
 * Execute an arbitrage opportunity
 */
export async function POST(request: Request) {
  try {
    const body: ExecuteRequest = await request.json();
    const { opportunityId, contracts, steps, dryRun = false } = body;

    // Validation
    if (!opportunityId) {
      return NextResponse.json(
        { ok: false, error: "Missing opportunityId" },
        { status: 400 }
      );
    }

    if (!contracts || contracts < 1) {
      return NextResponse.json(
        { ok: false, error: "Invalid contracts count (must be >= 1)" },
        { status: 400 }
      );
    }

    if (!steps || steps.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No execution steps provided" },
        { status: 400 }
      );
    }

    // Budget check: Max $50 per trade
    const MAX_BUDGET_CENTS = 5000;
    const totalCost = steps.reduce((sum, step) => {
      if (step.action === 'buy') {
        return sum + (step.price * contracts);
      }
      return sum;
    }, 0);

    if (totalCost > MAX_BUDGET_CENTS) {
      return NextResponse.json(
        { 
          ok: false, 
          error: `Trade exceeds budget limit ($${(totalCost/100).toFixed(2)} > $${(MAX_BUDGET_CENTS/100).toFixed(2)})` 
        },
        { status: 400 }
      );
    }

    // Check balance if not demo
    if (kalshiClient.isConfigured()) {
      const balance = await kalshiClient.getBalance();
      if (!balance.mock && balance.available * 100 < totalCost) {
        return NextResponse.json(
          { 
            ok: false, 
            error: `Insufficient balance ($${balance.available.toFixed(2)} available, need $${(totalCost/100).toFixed(2)})` 
          },
          { status: 400 }
        );
      }
    }

    // Dry run - just return what would happen
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        opportunityId,
        contracts,
        totalCostCents: totalCost,
        totalCostDollars: (totalCost / 100).toFixed(2),
        steps: steps.map(s => ({
          ...s,
          estimatedCostCents: s.action === 'buy' ? s.price * contracts : 0,
        })),
        demo: !kalshiClient.isConfigured(),
      });
    }

    // Execute orders
    const results: Array<{
      step: number;
      ticker: string;
      action: string;
      side: string;
      orderId?: string;
      status: 'success' | 'failed';
      error?: string;
      mock?: boolean;
    }> = [];

    let allSuccess = true;

    for (const step of steps.sort((a, b) => a.order - b.order)) {
      const orderResult = await kalshiClient.createOrder({
        ticker: step.ticker,
        action: step.action,
        side: step.side,
        type: 'limit',
        count: contracts,
        limit_price: step.price,
      });

      if (orderResult.success) {
        results.push({
          step: step.order,
          ticker: step.ticker,
          action: step.action,
          side: step.side,
          orderId: orderResult.order?.order_id,
          status: 'success',
          mock: orderResult.mock,
        });
      } else {
        allSuccess = false;
        results.push({
          step: step.order,
          ticker: step.ticker,
          action: step.action,
          side: step.side,
          status: 'failed',
          error: orderResult.error,
        });
        
        // Stop on first failure - don't leave partial positions
        break;
      }
    }

    // Calculate expected profit
    const mockOpportunity = {
      profitPotential: steps.reduce((sum, s) => sum + s.price, 0),
      executionSteps: steps,
    } as Parameters<typeof calculateProfit>[0];
    const profit = calculateProfit(mockOpportunity, contracts);

    return NextResponse.json({
      ok: allSuccess,
      opportunityId,
      contracts,
      results,
      summary: {
        totalSteps: steps.length,
        completedSteps: results.filter(r => r.status === 'success').length,
        failedSteps: results.filter(r => r.status === 'failed').length,
        totalCostCents: totalCost,
        expectedProfitCents: allSuccess ? profit.netProfit : 0,
      },
      demo: !kalshiClient.isConfigured(),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Execution error:", error);
    return NextResponse.json(
      { ok: false, error: "Execution failed", details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
