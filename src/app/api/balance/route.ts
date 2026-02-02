// GET /api/balance - Get account balance
import { NextResponse } from 'next/server';
import { getBalance, KalshiApiError } from '@/lib/kalshi';

export async function GET() {
  try {
    const balance = await getBalance();
    
    return NextResponse.json({
      success: true,
      data: {
        balance: balance.balance,
        balanceDollars: (balance.balance / 100).toFixed(2),
        portfolioValue: balance.portfolio_value,
        portfolioValueDollars: (balance.portfolio_value / 100).toFixed(2),
        updatedAt: new Date(balance.updated_ts).toISOString(),
      },
    });
  } catch (error) {
    console.error('Balance API error:', error);
    
    if (error instanceof KalshiApiError) {
      return NextResponse.json(
        { success: false, error: error.apiMessage },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}
