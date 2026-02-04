// DELETE /api/orders/[orderId] - Cancel order
import { NextRequest, NextResponse } from 'next/server';
import { cancelOrder } from '@/lib/kalshi';
import { handleApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-auth';

export const DELETE = withAuth(async function DELETE(
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  try {
    const { orderId } = await context!.params;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId is required' },
        { status: 400 }
      );
    }

    await cancelOrder(orderId);

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        message: 'Order cancelled successfully',
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to cancel order');
  }
});
