/**
 * OMS Orders API
 * 
 * POST /api/oms/orders - Create and submit a new order
 * GET /api/oms/orders - List orders with optional filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { oms, OrderState, OrderStateType } from '@/lib/oms';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      marketId,
      action,
      side,
      type = 'limit',
      contracts,
      limitPrice,
      expiresAt,
      clientOrderId,
      draftOnly = false, // If true, only create draft, don't submit
    } = body;

    // Validate required fields
    if (!marketId || !action || !side || !contracts) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing required fields: marketId, action, side, contracts',
        },
        { status: 400 }
      );
    }

    // Validate action
    if (!['buy', 'sell'].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "action must be 'buy' or 'sell'" },
        { status: 400 }
      );
    }

    // Validate side
    if (!['yes', 'no'].includes(side)) {
      return NextResponse.json(
        { ok: false, error: "side must be 'yes' or 'no'" },
        { status: 400 }
      );
    }

    // Validate type
    if (!['market', 'limit'].includes(type)) {
      return NextResponse.json(
        { ok: false, error: "type must be 'market' or 'limit'" },
        { status: 400 }
      );
    }

    // Limit orders require a price
    if (type === 'limit' && !limitPrice) {
      return NextResponse.json(
        { ok: false, error: 'Limit orders require a limitPrice' },
        { status: 400 }
      );
    }

    // Create/submit order
    const result = draftOnly
      ? await oms.createOrder({
          marketId,
          action,
          side,
          type,
          contracts: parseInt(contracts),
          limitPrice: limitPrice ? parseInt(limitPrice) : undefined,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          clientOrderId,
        })
      : await oms.placeOrder({
          marketId,
          action,
          side,
          type,
          contracts: parseInt(contracts),
          limitPrice: limitPrice ? parseInt(limitPrice) : undefined,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          clientOrderId,
        });

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      order: result.order,
      idempotent: result.idempotent,
    });
  } catch (error) {
    console.error('Error creating OMS order:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to create order' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stateParam = searchParams.get('state');
    const marketId = searchParams.get('marketId');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    // Parse state filter
    let state: OrderStateType | OrderStateType[] | undefined;
    if (stateParam) {
      const states = stateParam.split(',') as OrderStateType[];
      // Validate states
      const validStates = Object.values(OrderState);
      for (const s of states) {
        if (!validStates.includes(s)) {
          return NextResponse.json(
            { ok: false, error: `Invalid state: ${s}` },
            { status: 400 }
          );
        }
      }
      state = states.length === 1 ? states[0] : states;
    }

    const result = await oms.listOrders({
      state,
      marketId: marketId || undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });

    return NextResponse.json({
      ok: true,
      orders: result.orders,
      total: result.total,
    });
  } catch (error) {
    console.error('Error listing OMS orders:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to list orders' },
      { status: 500 }
    );
  }
}
