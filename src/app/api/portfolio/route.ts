import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";

export async function GET() {
  if (!kalshiClient.isConfigured()) {
    return NextResponse.json({
      success: false,
      error: "Kalshi client not configured - missing API credentials",
      configured: false,
    }, { status: 503 });
  }

  try {
    // Fetch balance and positions in parallel
    const [balanceResult, positions] = await Promise.all([
      kalshiClient.getBalanceWithError(),
      kalshiClient.getPositions(),
    ]);

    if (balanceResult.error) {
      return NextResponse.json({
        success: false,
        error: balanceResult.error,
        configured: true,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      balance: {
        available: balanceResult.available,
        total: balanceResult.total,
      },
      positions,
      positionCount: positions.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Portfolio fetch error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch portfolio";
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 });
  }
}
