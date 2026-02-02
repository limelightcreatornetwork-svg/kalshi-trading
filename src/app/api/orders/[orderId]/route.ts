// DELETE /api/orders/[orderId] - Cancel order
import { NextRequest, NextResponse } from 'next/server';
import { cancelOrder, KalshiApiError } from '@/lib/kalshi';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    
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
    console.error('Orders DELETE API error:', error);
    
    if (error instanceof KalshiApiError) {
      return NextResponse.json(
        { success: false, error: error.apiMessage },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}
