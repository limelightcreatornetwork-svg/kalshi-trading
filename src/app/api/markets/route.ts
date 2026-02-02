// GET /api/markets - List available markets with search/filter
import { NextRequest, NextResponse } from 'next/server';
import { getMarkets, KalshiApiError } from '@/lib/kalshi';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const params = {
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      cursor: searchParams.get('cursor') || undefined,
      event_ticker: searchParams.get('event_ticker') || undefined,
      series_ticker: searchParams.get('series_ticker') || undefined,
      status: searchParams.get('status') || undefined,
      tickers: searchParams.get('tickers') || undefined,
    };
    
    const response = await getMarkets(params);
    
    // Transform markets to include dollar values
    const markets = response.markets.map(market => ({
      ticker: market.ticker,
      eventTicker: market.event_ticker,
      title: market.title,
      subtitle: market.subtitle,
      status: market.status,
      yesBid: market.yes_bid,
      yesBidDollars: (market.yes_bid / 100).toFixed(2),
      yesAsk: market.yes_ask,
      yesAskDollars: (market.yes_ask / 100).toFixed(2),
      noBid: market.no_bid,
      noBidDollars: (market.no_bid / 100).toFixed(2),
      noAsk: market.no_ask,
      noAskDollars: (market.no_ask / 100).toFixed(2),
      lastPrice: market.last_price,
      lastPriceDollars: (market.last_price / 100).toFixed(2),
      volume: market.volume,
      volume24h: market.volume_24h,
      openInterest: market.open_interest,
      closeTime: market.close_time,
      expirationTime: market.expiration_time,
      result: market.result,
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        markets,
        cursor: response.cursor,
        count: markets.length,
      },
    });
  } catch (error) {
    console.error('Markets API error:', error);
    
    if (error instanceof KalshiApiError) {
      return NextResponse.json(
        { success: false, error: error.apiMessage },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch markets' },
      { status: 500 }
    );
  }
}
