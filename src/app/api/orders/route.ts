// GET /api/orders - Get orders
// POST /api/orders - Create new order
import { NextRequest, NextResponse } from 'next/server';
import { getOrders, createOrder, CreateOrderRequest, KalshiApiError } from '@/lib/kalshi';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const params = {
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      cursor: searchParams.get('cursor') || undefined,
      ticker: searchParams.get('ticker') || undefined,
      status: searchParams.get('status') || undefined,
    };
    
    const response = await getOrders(params);
    
    // Transform orders
    const orders = response.orders.map(order => ({
      orderId: order.order_id,
      clientOrderId: order.client_order_id,
      ticker: order.ticker,
      side: order.side,
      action: order.action,
      type: order.type,
      status: order.status,
      yesPrice: order.yes_price,
      yesPriceDollars: (order.yes_price / 100).toFixed(2),
      noPrice: order.no_price,
      noPriceDollars: (order.no_price / 100).toFixed(2),
      fillCount: order.fill_count,
      remainingCount: order.remaining_count,
      initialCount: order.initial_count,
      takerFees: order.taker_fees,
      makerFees: order.maker_fees,
      createdTime: order.created_time,
      lastUpdateTime: order.last_update_time,
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        orders,
        cursor: response.cursor,
        count: orders.length,
      },
    });
  } catch (error) {
    console.error('Orders GET API error:', error);
    
    if (error instanceof KalshiApiError) {
      return NextResponse.json(
        { success: false, error: error.apiMessage },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.ticker) {
      return NextResponse.json(
        { success: false, error: 'ticker is required' },
        { status: 400 }
      );
    }
    if (!body.side || !['yes', 'no'].includes(body.side)) {
      return NextResponse.json(
        { success: false, error: 'side must be "yes" or "no"' },
        { status: 400 }
      );
    }
    if (!body.action || !['buy', 'sell'].includes(body.action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "buy" or "sell"' },
        { status: 400 }
      );
    }
    if (!body.count || body.count < 1) {
      return NextResponse.json(
        { success: false, error: 'count must be at least 1' },
        { status: 400 }
      );
    }
    
    // Build order request
    const orderRequest: CreateOrderRequest = {
      ticker: body.ticker,
      side: body.side,
      action: body.action,
      count: body.count,
      type: body.type || 'limit',
    };
    
    // Add optional price (required for limit orders)
    if (body.yesPrice !== undefined) {
      orderRequest.yes_price = body.yesPrice;
    }
    if (body.noPrice !== undefined) {
      orderRequest.no_price = body.noPrice;
    }
    
    // Add other optional fields
    if (body.clientOrderId) {
      orderRequest.client_order_id = body.clientOrderId;
    }
    if (body.timeInForce) {
      orderRequest.time_in_force = body.timeInForce;
    }
    if (body.expirationTs) {
      orderRequest.expiration_ts = body.expirationTs;
    }
    if (body.postOnly !== undefined) {
      orderRequest.post_only = body.postOnly;
    }
    
    const response = await createOrder(orderRequest);
    
    const order = response.order;
    
    return NextResponse.json({
      success: true,
      data: {
        orderId: order.order_id,
        clientOrderId: order.client_order_id,
        ticker: order.ticker,
        side: order.side,
        action: order.action,
        type: order.type,
        status: order.status,
        yesPrice: order.yes_price,
        yesPriceDollars: (order.yes_price / 100).toFixed(2),
        noPrice: order.no_price,
        noPriceDollars: (order.no_price / 100).toFixed(2),
        initialCount: order.initial_count,
        createdTime: order.created_time,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Orders POST API error:', error);
    
    if (error instanceof KalshiApiError) {
      return NextResponse.json(
        { success: false, error: error.apiMessage },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
