import { NextResponse } from 'next/server';

// In-memory kill switch state (in production, this would be in the database)
let killSwitchState = {
  enabled: true,
  status: 'active',
  triggeredAt: null as string | null,
  reason: null as string | null,
  level: 'GLOBAL',
  triggeredBy: null as string | null,
};

// GET: Get current kill switch status
export async function GET() {
  return NextResponse.json({
    success: true,
    killSwitch: killSwitchState,
    config: {
      maxDailyLoss: 500,
      maxDrawdown: 10,
      maxErrorRate: 5,
      autoResetHours: 24,
    },
  });
}

// POST: Toggle or trigger kill switch
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, reason } = body;

    switch (action) {
      case 'enable':
        killSwitchState = {
          ...killSwitchState,
          enabled: true,
          status: 'active',
        };
        break;

      case 'disable':
        killSwitchState = {
          ...killSwitchState,
          enabled: false,
          status: 'disabled',
        };
        break;

      case 'trigger':
        killSwitchState = {
          ...killSwitchState,
          enabled: true,
          status: 'triggered',
          triggeredAt: new Date().toISOString(),
          reason: reason || 'Manual trigger',
          triggeredBy: 'user',
        };
        break;

      case 'reset':
        killSwitchState = {
          enabled: true,
          status: 'active',
          triggeredAt: null,
          reason: null,
          level: 'GLOBAL',
          triggeredBy: null,
        };
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      killSwitch: killSwitchState,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
