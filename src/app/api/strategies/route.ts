/**
 * /api/strategies - Strategy Management CRUD
 *
 * GET    - List all strategies (optional ?type=VALUE&enabled=true)
 * POST   - Create a new strategy
 * PATCH  - Update an existing strategy
 * DELETE - Delete a strategy
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { createLogger } from '@/lib/logger';
import { getStrategyManagementService } from '@/lib/service-factories';
import { StrategyType } from '@/types/strategy';

const log = createLogger('StrategiesAPI');

function formatStrategy(s: { config: import('@/types/strategy').StrategyConfig; state: import('@/types/strategy').StrategyState }) {
  return {
    id: s.config.id,
    name: s.config.name,
    type: s.config.type,
    enabled: s.config.enabled,
    autoExecute: s.config.autoExecute,
    status: s.state.status,
    // Execution settings
    maxOrdersPerHour: s.config.maxOrdersPerHour,
    maxPositionSize: s.config.maxPositionSize,
    maxNotionalPerTrade: s.config.maxNotionalPerTrade,
    // Risk settings
    minEdge: s.config.minEdge,
    minConfidence: s.config.minConfidence,
    maxSpread: s.config.maxSpread,
    minLiquidity: s.config.minLiquidity,
    // Filters
    allowedCategories: s.config.allowedCategories,
    blockedCategories: s.config.blockedCategories,
    blockedMarkets: s.config.blockedMarkets,
    // Params
    params: s.config.params,
    // State
    state: {
      lastRunAt: s.state.lastRunAt?.toISOString() ?? null,
      lastSignalAt: s.state.lastSignalAt?.toISOString() ?? null,
      lastTradeAt: s.state.lastTradeAt?.toISOString() ?? null,
      errorCount: s.state.errorCount,
      lastError: s.state.lastError ?? null,
      signalsGenerated: s.state.signalsGenerated,
      tradesExecuted: s.state.tradesExecuted,
      tradesRejected: s.state.tradesRejected,
      pnlToday: s.state.pnlToday,
      pnlTodayDollars: (s.state.pnlToday / 100).toFixed(2),
    },
    createdAt: s.config.createdAt.toISOString(),
    updatedAt: s.config.updatedAt.toISOString(),
  };
}

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const service = getStrategyManagementService();
    const searchParams = request.nextUrl.searchParams;

    const typeParam = searchParams.get('type') as StrategyType | null;
    const enabledParam = searchParams.get('enabled');

    const filter: { type?: StrategyType; enabled?: boolean } = {};
    if (typeParam && Object.values(StrategyType).includes(typeParam)) {
      filter.type = typeParam;
    }
    if (enabledParam === 'true') filter.enabled = true;
    if (enabledParam === 'false') filter.enabled = false;

    const strategies = await service.listStrategies(filter);
    const summary = await service.getSummary();

    return NextResponse.json({
      success: true,
      data: {
        strategies: strategies.map(formatStrategy),
        count: strategies.length,
        summary,
      },
    });
  } catch (error) {
    log.error('Failed to list strategies', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to list strategies';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const service = getStrategyManagementService();
    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: name' },
        { status: 400 }
      );
    }
    if (!body.type) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: type' },
        { status: 400 }
      );
    }
    if (!Object.values(StrategyType).includes(body.type)) {
      return NextResponse.json(
        { success: false, error: `Invalid type. Must be one of: ${Object.values(StrategyType).join(', ')}` },
        { status: 400 }
      );
    }

    const result = await service.createStrategy({
      name: body.name,
      type: body.type,
      enabled: body.enabled,
      autoExecute: body.autoExecute,
      maxOrdersPerHour: body.maxOrdersPerHour,
      maxPositionSize: body.maxPositionSize,
      maxNotionalPerTrade: body.maxNotionalPerTrade,
      minEdge: body.minEdge,
      minConfidence: body.minConfidence,
      maxSpread: body.maxSpread,
      minLiquidity: body.minLiquidity,
      allowedCategories: body.allowedCategories,
      blockedCategories: body.blockedCategories,
      blockedMarkets: body.blockedMarkets,
      params: body.params,
    });

    log.info('Strategy created', { id: result.config.id, name: result.config.name, type: result.config.type });

    return NextResponse.json({
      success: true,
      data: formatStrategy(result),
    });
  } catch (error) {
    log.error('Failed to create strategy', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to create strategy';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const PATCH = withAuth(async function PATCH(request: NextRequest) {
  try {
    const service = getStrategyManagementService();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    const existing = await service.getStrategy(body.id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Strategy not found' },
        { status: 404 }
      );
    }

    const result = await service.updateStrategy(body.id, {
      name: body.name,
      enabled: body.enabled,
      autoExecute: body.autoExecute,
      maxOrdersPerHour: body.maxOrdersPerHour,
      maxPositionSize: body.maxPositionSize,
      maxNotionalPerTrade: body.maxNotionalPerTrade,
      minEdge: body.minEdge,
      minConfidence: body.minConfidence,
      maxSpread: body.maxSpread,
      minLiquidity: body.minLiquidity,
      allowedCategories: body.allowedCategories,
      blockedCategories: body.blockedCategories,
      blockedMarkets: body.blockedMarkets,
      params: body.params,
    });

    log.info('Strategy updated', { id: body.id });

    return NextResponse.json({
      success: true,
      data: formatStrategy(result),
    });
  } catch (error) {
    log.error('Failed to update strategy', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to update strategy';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const DELETE = withAuth(async function DELETE(request: NextRequest) {
  try {
    const service = getStrategyManagementService();
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing required query parameter: id' },
        { status: 400 }
      );
    }

    const existing = await service.getStrategy(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Strategy not found' },
        { status: 404 }
      );
    }

    await service.deleteStrategy(id);

    log.info('Strategy deleted', { id });

    return NextResponse.json({
      success: true,
      data: { id, deleted: true },
    });
  } catch (error) {
    log.error('Failed to delete strategy', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to delete strategy';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
