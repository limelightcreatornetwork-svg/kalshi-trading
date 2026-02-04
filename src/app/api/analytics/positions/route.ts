/**
 * GET /api/analytics/positions - Position Performance Breakdown
 * 
 * Query params:
 * - includeClosed: boolean (default: true) - Include closed positions
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyticsService, tradeStorage } from '../history/route';
import { withAuth } from '@/lib/api-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('AnalyticsPositionsAPI');

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeClosed = searchParams.get('includeClosed') !== 'false';

    const positions = await analyticsService.getPositionPerformance(includeClosed);

    // Transform positions for API response
    const formattedPositions = positions.map(p => ({
      id: p.id,
      marketTicker: p.marketTicker,
      marketTitle: p.marketTitle,
      side: p.side,
      direction: p.direction,
      entryPrice: p.entryPrice,
      entryPriceDollars: (p.entryPrice / 100).toFixed(2),
      currentPrice: p.currentPrice,
      currentPriceDollars: (p.currentPrice / 100).toFixed(2),
      quantity: p.quantity,
      pnl: p.pnl,
      pnlDollars: (p.pnl / 100).toFixed(2),
      pnlPercent: p.pnlPercent.toFixed(2) + '%',
      unrealizedPnL: p.unrealizedPnL,
      unrealizedPnLDollars: (p.unrealizedPnL / 100).toFixed(2),
      isOpen: p.isOpen,
      entryDate: p.entryDate.toISOString(),
      exitDate: p.exitDate?.toISOString() ?? null,
      holdingDays: p.holdingDays,
    }));

    // Separate open and closed
    const openPositions = formattedPositions.filter(p => p.isOpen);
    const closedPositions = formattedPositions.filter(p => !p.isOpen);

    // Calculate summary stats
    const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
    const totalUnrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const openPnL = positions.filter(p => p.isOpen).reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const closedPnL = positions.filter(p => !p.isOpen).reduce((sum, p) => sum + p.pnl, 0);

    return NextResponse.json({
      success: true,
      data: {
        positions: formattedPositions,
        openPositions,
        closedPositions,
        summary: {
          totalPositions: positions.length,
          openCount: openPositions.length,
          closedCount: closedPositions.length,
          totalPnL,
          totalPnLDollars: (totalPnL / 100).toFixed(2),
          openPnL,
          openPnLDollars: (openPnL / 100).toFixed(2),
          closedPnL,
          closedPnLDollars: (closedPnL / 100).toFixed(2),
          totalUnrealizedPnL,
          totalUnrealizedPnLDollars: (totalUnrealizedPnL / 100).toFixed(2),
        },
      },
    });
  } catch (error) {
    log.error('Analytics positions API error', { error: error instanceof Error ? error.message : String(error) });
    
    const message = error instanceof Error ? error.message : 'Failed to fetch position performance';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});

// POST to record a new trade
export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const requiredFields = ['marketTicker', 'side', 'entryPrice', 'entryQuantity', 'entryValue'];
    for (const field of requiredFields) {
      if (body[field] === undefined) {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate side
    if (!['yes', 'no'].includes(body.side)) {
      return NextResponse.json(
        { success: false, error: 'Side must be "yes" or "no"' },
        { status: 400 }
      );
    }

    const trade = await analyticsService.recordTradeEntry({
      marketTicker: body.marketTicker,
      marketTitle: body.marketTitle,
      side: body.side,
      entryPrice: body.entryPrice,
      entryQuantity: body.entryQuantity,
      entryValue: body.entryValue,
      strategyId: body.strategyId,
      thesisId: body.thesisId,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: trade.id,
        marketTicker: trade.marketTicker,
        side: trade.side,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        entryPriceDollars: (trade.entryPrice / 100).toFixed(2),
        entryQuantity: trade.entryQuantity,
        entryValue: trade.entryValue,
        entryValueDollars: (trade.entryValue / 100).toFixed(2),
        entryDate: trade.entryDate.toISOString(),
        result: trade.result,
      },
    });
  } catch (error) {
    log.error('Analytics positions POST error', { error: error instanceof Error ? error.message : String(error) });
    
    const message = error instanceof Error ? error.message : 'Failed to record trade';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});

// PATCH to update or close a trade
export const PATCH = withAuth(async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.tradeId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: tradeId' },
        { status: 400 }
      );
    }

    // Check if this is a price update or a close
    if (body.action === 'updatePrice') {
      if (body.currentPrice === undefined) {
        return NextResponse.json(
          { success: false, error: 'Missing required field: currentPrice' },
          { status: 400 }
        );
      }

      const trade = await analyticsService.updateTradePrice(body.tradeId, body.currentPrice);
      
      if (!trade) {
        return NextResponse.json(
          { success: false, error: 'Trade not found or already closed' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          id: trade.id,
          currentPrice: trade.currentPrice,
          currentPriceDollars: ((trade.currentPrice ?? 0) / 100).toFixed(2),
          unrealizedPnL: trade.unrealizedPnL,
          unrealizedPnLDollars: (trade.unrealizedPnL / 100).toFixed(2),
          pnlPercent: trade.pnlPercent.toFixed(2) + '%',
        },
      });
    }

    if (body.action === 'close') {
      const requiredFields = ['exitPrice', 'exitQuantity', 'exitValue'];
      for (const field of requiredFields) {
        if (body[field] === undefined) {
          return NextResponse.json(
            { success: false, error: `Missing required field for close: ${field}` },
            { status: 400 }
          );
        }
      }

      const trade = await analyticsService.closeTrade(body.tradeId, {
        exitPrice: body.exitPrice,
        exitQuantity: body.exitQuantity,
        exitValue: body.exitValue,
        fees: body.fees,
      });

      if (!trade) {
        return NextResponse.json(
          { success: false, error: 'Trade not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          id: trade.id,
          marketTicker: trade.marketTicker,
          result: trade.result,
          exitPrice: trade.exitPrice,
          exitPriceDollars: ((trade.exitPrice ?? 0) / 100).toFixed(2),
          exitDate: trade.exitDate?.toISOString(),
          realizedPnL: trade.realizedPnL,
          realizedPnLDollars: (trade.realizedPnL / 100).toFixed(2),
          netPnL: trade.netPnL,
          netPnLDollars: (trade.netPnL / 100).toFixed(2),
          pnlPercent: trade.pnlPercent.toFixed(2) + '%',
          holdingPeriod: trade.holdingPeriod,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use "updatePrice" or "close"' },
      { status: 400 }
    );
  } catch (error) {
    log.error('Analytics positions PATCH error', { error: error instanceof Error ? error.message : String(error) });
    
    const message = error instanceof Error ? error.message : 'Failed to update trade';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
});
