// GET /api/arbitrage/alerts - Check for new alerts
// POST /api/arbitrage/alerts - Configure alert settings

import { NextRequest, NextResponse } from 'next/server';

// Dynamically import to avoid Prisma initialization at build time
async function getArbitrageService() {
  const { arbitrageService } = await import('@/services/ArbitrageService');
  return arbitrageService;
}

async function getPrisma() {
  const { requirePrisma } = await import('@/lib/prisma');
  return requirePrisma();
}

export async function GET() {
  try {
    const arbitrageService = await getArbitrageService();
    const alerts = await arbitrageService.checkAlerts();
    
    return NextResponse.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
      },
    });
  } catch (error) {
    console.error('Arbitrage alerts error:', error);
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to check alerts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const prisma = await getPrisma();
    const body = await request.json();
    
    const { minProfitCents, minProfitPercent, alertEnabled, webhookUrl } = body;
    
    // Upsert alert config (we only keep one active config)
    const existing = await prisma.arbitrageAlertConfig.findFirst({
      where: { isActive: true },
    });
    
    const config = existing
      ? await prisma.arbitrageAlertConfig.update({
          where: { id: existing.id },
          data: {
            ...(minProfitCents !== undefined && { minProfitCents }),
            ...(minProfitPercent !== undefined && { minProfitPercent }),
            ...(alertEnabled !== undefined && { alertEnabled }),
            ...(webhookUrl !== undefined && { webhookUrl }),
          },
        })
      : await prisma.arbitrageAlertConfig.create({
          data: {
            minProfitCents: minProfitCents ?? 1,
            minProfitPercent: minProfitPercent ?? 0.5,
            alertEnabled: alertEnabled ?? true,
            webhookUrl,
          },
        });
    
    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        minProfitCents: Number(config.minProfitCents),
        minProfitPercent: Number(config.minProfitPercent),
        alertEnabled: config.alertEnabled,
        webhookUrl: config.webhookUrl,
      },
    });
  } catch (error) {
    console.error('Arbitrage alerts config error:', error);
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to configure alerts' },
      { status: 500 }
    );
  }
}
