import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventTicker = searchParams.get("event");
  const status = searchParams.get("status");
  const ticker = searchParams.get("ticker");
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
    const markets = await kalshiClient.getMarkets({
      event_ticker: eventTicker || undefined,
      status: status || undefined,
      ticker: ticker || undefined,
      limit,
    });

    return NextResponse.json({
      ok: true,
      markets,
      count: markets.length,
      demo: !kalshiClient.isConfigured(),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching markets:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch markets" },
      { status: 500 }
    );
  }
}
