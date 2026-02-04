// GET /api/arbitrage/scan-live - Scan markets without database
// This is a lightweight endpoint that scans markets and returns results immediately
// without persisting to the database
// Query params:
//   - maxPages: Maximum number of pages to scan (default: 10, max: 50)
//   - full: Set to "true" to scan all pages (slower, may timeout)

import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getMarkets, KalshiApiError, Market } from '@/lib/kalshi';
import { createLogger } from '@/lib/logger';

const log = createLogger('ArbitrageScanLiveAPI');
import { withAuth } from '@/lib/api-auth';

interface MarketWithArbitrage {
  ticker: string;
  eventTicker: string;
  title: string;
  status: string;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  buyBothCost: number;
  sellBothRevenue: number;
  hasArbitrage: boolean;
  profitCents: number;
  profitPercent: number;
  volume24h: number;
  openInterest: number;
}

// Minimum profit in cents to consider an opportunity
const MIN_PROFIT_CENTS = 0.5;
const DEFAULT_MAX_PAGES = 10;
const ABSOLUTE_MAX_PAGES = 50;

function analyzeMarket(market: Market): MarketWithArbitrage {
  const yesBid = market.yes_bid || 0;
  const yesAsk = market.yes_ask || 0;
  const noBid = market.no_bid || 0;
  const noAsk = market.no_ask || 0;
  
  const buyBothCost = yesAsk + noAsk;
  const sellBothRevenue = yesBid + noBid;
  const profitCents = 100 - buyBothCost;
  const profitPercent = buyBothCost > 0 ? (profitCents / buyBothCost) * 100 : 0;
  const hasArbitrage = buyBothCost < 100 && yesAsk > 0 && noAsk > 0 && profitCents >= MIN_PROFIT_CENTS;
  
  return {
    ticker: market.ticker,
    eventTicker: market.event_ticker,
    title: market.title,
    status: market.status,
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    buyBothCost,
    sellBothRevenue,
    hasArbitrage,
    profitCents: hasArbitrage ? profitCents : 0,
    profitPercent: hasArbitrage ? profitPercent : 0,
    volume24h: market.volume_24h || 0,
    openInterest: market.open_interest || 0,
  };
}

export const GET = withAuth(async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const fullScan = searchParams.get('full') === 'true';
  let maxPages = parseInt(searchParams.get('maxPages') || String(DEFAULT_MAX_PAGES), 10);
  
  // Clamp maxPages
  if (isNaN(maxPages) || maxPages < 1) maxPages = DEFAULT_MAX_PAGES;
  if (maxPages > ABSOLUTE_MAX_PAGES && !fullScan) maxPages = ABSOLUTE_MAX_PAGES;
  
  try {
    const allMarkets: MarketWithArbitrage[] = [];
    const opportunities: MarketWithArbitrage[] = [];
    
    let cursor: string | undefined;
    let totalMarketsScanned = 0;
    let pagesScanned = 0;
    let hasMorePages = false;
    
    // Paginate through active markets (with page limit unless full scan)
    do {
      const response = await getMarkets({
        limit: 100,
        cursor,
        status: 'open',
      });
      
      pagesScanned++;
      
      for (const market of response.markets) {
        const analysis = analyzeMarket(market);
        allMarkets.push(analysis);
        totalMarketsScanned++;
        
        if (analysis.hasArbitrage) {
          opportunities.push(analysis);
        }
      }
      
      cursor = response.cursor || undefined;
      
      // Check if we should stop
      if (!fullScan && pagesScanned >= maxPages) {
        hasMorePages = !!cursor;
        break;
      }
    } while (cursor);
    
    const scanDurationMs = Date.now() - startTime;
    const totalProfitPotential = opportunities.reduce((sum, o) => sum + o.profitCents, 0);
    
    // Sort by profit
    opportunities.sort((a, b) => b.profitCents - a.profitCents);
    allMarkets.sort((a, b) => b.profitCents - a.profitCents);
    
    return NextResponse.json({
      success: true,
      data: {
        marketsScanned: totalMarketsScanned,
        pagesScanned,
        hasMorePages,
        opportunitiesFound: opportunities.length,
        totalProfitPotential,
        scanDurationMs,
        opportunities,
        // Include top markets with tightest spreads
        topMarkets: allMarkets.slice(0, 50),
        // Summary stats
        stats: {
          marketsWithArbitrage: opportunities.length,
          percentWithArbitrage: ((opportunities.length / totalMarketsScanned) * 100).toFixed(2),
          avgProfitCents: opportunities.length > 0 
            ? (totalProfitPotential / opportunities.length).toFixed(4)
            : 0,
          maxProfitCents: opportunities.length > 0 
            ? opportunities[0].profitCents.toFixed(4)
            : 0,
        },
        // Scan configuration
        scanConfig: {
          maxPages: fullScan ? 'unlimited' : maxPages,
          fullScan,
        },
      },
    });
  } catch (error) {
    log.error('Live arbitrage scan error', { error: error instanceof Error ? error.message : String(error) });
    
    if (error instanceof KalshiApiError) {
      return NextResponse.json(
        { success: false, error: error.apiMessage },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Scan failed' },
      { status: 500 }
    );
  }
});
