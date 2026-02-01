import { NextResponse } from "next/server";
import { trendAggregator } from "@/lib/intelligence";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
    let trends;

    if (search) {
      trends = await trendAggregator.searchTrends(search);
    } else if (category) {
      trends = await trendAggregator.getMarketTrends(category);
    } else {
      trends = await trendAggregator.getTrends({ limit });
    }

    return NextResponse.json({
      ok: true,
      trends,
      count: trends.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching trends:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch trends" },
      { status: 500 }
    );
  }
}
