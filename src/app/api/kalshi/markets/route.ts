import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventTicker = searchParams.get("event");
  const status = searchParams.get("status") || "active";
  const ticker = searchParams.get("ticker");
  const limit = parseInt(searchParams.get("limit") || "100");
  const minVolume = parseInt(searchParams.get("minVolume") || "0");

  try {
    const markets = await kalshiClient.getMarkets({
      event_ticker: eventTicker || undefined,
      status: status || undefined,
      ticker: ticker || undefined,
      limit,
    });

    // Filter by minimum volume if specified
    const filteredMarkets = minVolume > 0 
      ? markets.filter(m => m.volume >= minVolume)
      : markets;

    // Add spread calculations
    const marketsWithMetrics = filteredMarkets.map(m => ({
      ...m,
      metrics: {
        spread: m.yes_ask + m.no_ask,
        yesSpread: m.yes_ask - m.yes_bid,
        noSpread: m.no_ask - m.no_bid,
        isPotentialArbitrage: m.yes_ask + m.no_ask < 100 || m.yes_bid + m.no_bid > 100,
      }
    }));

    return NextResponse.json({
      ok: true,
      markets: marketsWithMetrics,
      count: marketsWithMetrics.length,
      totalFetched: markets.length,
      demo: !kalshiClient.isConfigured(),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching markets:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch markets", details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
