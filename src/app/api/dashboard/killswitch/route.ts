import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getKillSwitchService } from '@/lib/service-factories';
import { KillSwitchLevel, KillSwitchReason } from '@/types/killswitch';

const DEFAULT_CONFIG = {
  maxDailyLoss: 500,
  maxDrawdown: 10,
  maxErrorRate: 5,
  autoResetHours: 24,
};

async function getKillSwitchSnapshot() {
  const killSwitchService = getKillSwitchService();
  const active = await killSwitchService.getActive();
  const blocking = active[0];

  return {
    enabled: active.length === 0,
    status: active.length > 0 ? 'triggered' : 'active',
    triggeredAt: blocking?.triggeredAt?.toISOString() ?? null,
    reason: blocking?.reason ?? null,
    level: blocking?.level ?? KillSwitchLevel.GLOBAL,
    triggeredBy: blocking?.triggeredBy ?? null,
  };
}

export const GET = withAuth(async function GET() {
  try {
    const killSwitch = await getKillSwitchSnapshot();
    return NextResponse.json({
      success: true,
      killSwitch,
      config: DEFAULT_CONFIG,
    });
  } catch (error) {
    console.error('Kill switch GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch kill switch state' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, reason } = body ?? {};
    const killSwitchService = getKillSwitchService();

    switch (action) {
      case 'enable':
        await killSwitchService.resetLevel(KillSwitchLevel.GLOBAL, 'dashboard');
        break;
      case 'disable':
        await killSwitchService.emergencyStop('dashboard', 'Manual disable');
        break;
      case 'trigger':
        await killSwitchService.trigger({
          level: KillSwitchLevel.GLOBAL,
          reason: KillSwitchReason.MANUAL,
          description: reason || 'Manual trigger',
          triggeredBy: 'dashboard',
        });
        break;
      case 'reset':
        await killSwitchService.resetLevel(KillSwitchLevel.GLOBAL, 'dashboard');
        break;
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    const killSwitch = await getKillSwitchSnapshot();
    return NextResponse.json({ success: true, killSwitch });
  } catch (error) {
    console.error('Kill switch POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }
});
