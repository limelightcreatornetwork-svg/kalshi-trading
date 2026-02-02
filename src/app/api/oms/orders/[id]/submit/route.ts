/**
 * OMS Order Submit API
 * 
 * POST /api/oms/orders/[id]/submit - Submit a draft order to Kalshi
 */

import { NextRequest, NextResponse } from 'next/server';
import { oms } from '@/lib/oms';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const result = await oms.submitOrder(id);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error, order: result.order },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      order: result.order,
    });
  } catch (error) {
    console.error('Error submitting order:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to submit order' },
      { status: 500 }
    );
  }
}
