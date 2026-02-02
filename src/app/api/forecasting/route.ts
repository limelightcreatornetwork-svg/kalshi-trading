import { NextRequest, NextResponse } from 'next/server';
import { getMarkets } from '@/lib/kalshi';
import { createForecastingService } from '@/services/ForecastingService';
import type { ForecastingConfig } from '@/types/forecasting';

// Create service instance with default config
function getService(config: Partial<ForecastingConfig> = {}) {
  return createForecastingService({
    bankroll: Number(process.env.TRADING_BANKROLL) || 1000,
    ...config,
  });
}

/**
 * GET /api/forecasting - Get forecasting summary and opportunities
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const modelId = searchParams.get('model') || 'ensemble-v1';
    const minEdge = Number(searchParams.get('minEdge')) || 0.03;
    const bankroll = Number(searchParams.get('bankroll')) || 1000;
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);
    
    const service = getService({
      modelId,
      minEdgeToTrade: minEdge,
      bankroll,
    });

    // Fetch markets from Kalshi
    const { markets } = await getMarkets({ 
      limit, 
      status: 'open' 
    });

    // Generate summary with opportunities
    const summary = await service.generateSummary(markets, modelId);

    // Also get available models
    const models = service.listModels();

    return NextResponse.json({
      success: true,
      data: {
        summary,
        models,
        config: service.getConfig(),
        marketsScanned: markets.length,
      },
    });
  } catch (error) {
    console.error('Forecasting error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Forecasting failed',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forecasting - Generate forecast for specific market(s)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      tickers, 
      modelId = 'ensemble-v1',
      bankroll = 1000,
      minEdge = 0.03,
    } = body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'tickers array required' },
        { status: 400 }
      );
    }

    const service = getService({
      modelId,
      minEdgeToTrade: minEdge,
      bankroll,
    });

    // Fetch specific markets
    const tickerList = tickers.join(',');
    const { markets } = await getMarkets({ tickers: tickerList });

    // Generate forecasts for each market
    const forecasts = await Promise.all(
      markets.map(async (market) => {
        try {
          return await service.generateForecast(market, modelId);
        } catch (err) {
          return {
            ticker: market.ticker,
            error: err instanceof Error ? err.message : 'Forecast failed',
          };
        }
      })
    );

    // Find edge opportunities
    const opportunities = await service.findEdgeOpportunities(markets, modelId);

    return NextResponse.json({
      success: true,
      data: {
        forecasts,
        opportunities,
        config: service.getConfig(),
      },
    });
  } catch (error) {
    console.error('Forecasting error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Forecasting failed',
      },
      { status: 500 }
    );
  }
}
