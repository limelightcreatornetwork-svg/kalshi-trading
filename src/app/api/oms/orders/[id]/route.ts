/**
 * OMS Order API - Single Order Operations
 * 
 * GET /api/oms/orders/[id] - Get order by ID
 * PUT /api/oms/orders/[id] - Amend order (cancel and replace)
 * DELETE /api/oms/orders/[id] - Cancel order
 * POST /api/oms/orders/[id]/submit - Submit a draft order
 */

import { NextRequest, NextResponse } from 'next/server';
import { oms } from '@/lib/oms';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Try to get by internal ID first, then by clientOrderId
    let order = await oms.getOrder(id);
    if (!order) {
      order = await oms.getOrderByClientId(id);
    }

    if (!order) {
      return NextResponse.json(
        { ok: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    // Get fills if requested
    const { searchParams } = new URL(request.url);
    const includeFills = searchParams.get('includeFills') === 'true';

    let fills;
    if (includeFills) {
      fills = await oms.getOrderFills(order.id);
    }

    return NextResponse.json({
      ok: true,
      order,
      fills,
    });
  } catch (error) {
    console.error('Error getting order:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to get order' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { contracts, limitPrice } = body;

    // Validate at least one amendment parameter
    if (contracts === undefined && limitPrice === undefined) {
      return NextResponse.json(
        { ok: false, error: 'Must provide contracts or limitPrice to amend' },
        { status: 400 }
      );
    }

    const result = await oms.amendOrder(id, {
      contracts: contracts !== undefined ? parseInt(contracts) : undefined,
      limitPrice: limitPrice !== undefined ? parseInt(limitPrice) : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      originalOrder: result.originalOrder,
      newOrder: result.newOrder,
    });
  } catch (error) {
    console.error('Error amending order:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to amend order' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason') || undefined;

    const result = await oms.cancelOrder(id, reason);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      order: result.order,
    });
  } catch (error) {
    console.error('Error canceling order:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}
