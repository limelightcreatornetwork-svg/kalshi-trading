// GET /api/portfolio - Get account balance and portfolio value
import { NextRequest, NextResponse } from 'next/server';
import { getBalance } from '@/lib/kalshi';
import { handleApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-auth';

export const GET = withAuth(async function GET(_request: NextRequest) {
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
    return handleApiError(error, 'Failed to fetch portfolio');
  }
});
