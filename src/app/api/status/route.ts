import { NextResponse } from "next/server";
import { kalshiClient } from "@/lib/kalshi";

export async function GET() {
  const isConfigured = kalshiClient.isConfigured();
  
  if (!isConfigured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "Kalshi client not configured - missing API credentials",
      env: {
        hasApiKeyId: !!process.env.KALSHI_API_KEY_ID,
        hasPrivateKey: !!process.env.KALSHI_API_PRIVATE_KEY,
        environment: (process.env.KALSHI_ENV || 'demo').trim(),
      }
    });
  }

  try {
    // Test the API connection by fetching balance with detailed error
    const balance = await kalshiClient.getBalanceWithError();
    
    if (balance.error) {
      return NextResponse.json({
        ok: false,
        configured: true,
        error: balance.error,
        environment: (process.env.KALSHI_ENV || 'demo').trim(),
        timestamp: new Date().toISOString(),
      });
    }
    
    return NextResponse.json({
      ok: true,
      configured: true,
      environment: (process.env.KALSHI_ENV || 'demo').trim(),
      balance: {
        available: balance.available,
        total: balance.total,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      ok: false,
      configured: true,
      error: message,
      environment: (process.env.KALSHI_ENV || 'demo').trim(),
    }, { status: 500 });
  }
}
