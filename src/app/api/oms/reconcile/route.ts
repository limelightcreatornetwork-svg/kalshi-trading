/**
 * OMS Reconciliation API
 * 
 * POST /api/oms/reconcile - Run reconciliation against Kalshi
 */

import { NextResponse } from 'next/server';
import { oms } from '@/lib/oms';

export async function POST() {
  try {
    const result = await oms.reconcile();

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error('Error running reconciliation:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to run reconciliation' },
      { status: 500 }
    );
  }
}
