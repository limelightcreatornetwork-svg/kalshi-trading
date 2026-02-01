import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ticker, action, side, type, count, limitPrice } = body;

    // Validate required fields
    if (!ticker || !action || !side || !count) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: ticker, action, side, count" },
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
    const orderType = type || 'market';
    if (!['market', 'limit'].includes(orderType)) {
      return NextResponse.json(
        { ok: false, error: "type must be 'market' or 'limit'" },
        { status: 400 }
      );
    }

    // Limit orders require a price
    if (orderType === 'limit' && !limitPrice) {
      return NextResponse.json(
        { ok: false, error: "Limit orders require a limitPrice" },
        { status: 400 }
      );
    }

    const result = await kalshiClient.createOrder({
      ticker,
      action,
      side,
      type: orderType,
      count: parseInt(count),
      limit_price: limitPrice ? parseInt(limitPrice) : undefined,
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
      mock: result.mock,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create order" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("id");

  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "Missing order id" },
      { status: 400 }
    );
  }

  try {
    const result = await kalshiClient.cancelOrder(orderId);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      mock: result.mock,
    });
  } catch (error) {
    console.error("Error canceling order:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to cancel order" },
      { status: 500 }
    );
  }
}
