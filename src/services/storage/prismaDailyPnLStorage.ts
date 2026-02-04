import { requirePrisma } from '@/lib/prisma';
import { DailyPnL, PnLStorage } from '@/services/DailyPnLService';
import type { DailyPnL as PrismaDailyPnLRow } from '@prisma/client';

function dateToKey(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function mapDailyPnL(record: PrismaDailyPnLRow): DailyPnL {
  const date = record.date instanceof Date
    ? record.date.toISOString().split('T')[0]
    : record.date;

  return {
    id: record.id,
    date,
    realizedPnl: Number(record.realizedPnl ?? 0),
    unrealizedPnl: Number(record.unrealizedPnl ?? 0),
    fees: Number(record.fees ?? 0),
    grossPnl: Number(record.grossPnl ?? 0),
    netPnl: Number(record.netPnl ?? 0),
    tradesCount: record.tradesCount ?? 0,
    winCount: record.winCount ?? 0,
    lossCount: record.lossCount ?? 0,
    positionsOpened: record.positionsOpened ?? 0,
    positionsClosed: record.positionsClosed ?? 0,
    peakPnl: Number(record.peakPnl ?? 0),
    drawdown: Number(record.drawdown ?? 0),
    drawdownPct: Number(record.drawdownPct ?? 0),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaDailyPnLStorage implements PnLStorage {
  async getByDate(date: string): Promise<DailyPnL | null> {
    const record = await requirePrisma().dailyPnL.findUnique({
      where: { date: dateToKey(date) },
    });
    return record ? mapDailyPnL(record) : null;
  }

  async create(pnl: DailyPnL): Promise<void> {
    await requirePrisma().dailyPnL.create({
      data: {
        id: pnl.id,
        date: dateToKey(pnl.date),
        realizedPnl: pnl.realizedPnl,
        unrealizedPnl: pnl.unrealizedPnl,
        fees: pnl.fees,
        grossPnl: pnl.grossPnl,
        netPnl: pnl.netPnl,
        tradesCount: pnl.tradesCount,
        winCount: pnl.winCount,
        lossCount: pnl.lossCount,
        positionsOpened: pnl.positionsOpened,
        positionsClosed: pnl.positionsClosed,
        peakPnl: pnl.peakPnl,
        drawdown: pnl.drawdown,
        drawdownPct: pnl.drawdownPct,
        createdAt: pnl.createdAt,
        updatedAt: pnl.updatedAt,
      },
    });
  }

  async update(date: string, updates: Partial<DailyPnL>): Promise<void> {
    await requirePrisma().dailyPnL.update({
      where: { date: dateToKey(date) },
      data: {
        realizedPnl: updates.realizedPnl,
        unrealizedPnl: updates.unrealizedPnl,
        fees: updates.fees,
        grossPnl: updates.grossPnl,
        netPnl: updates.netPnl,
        tradesCount: updates.tradesCount,
        winCount: updates.winCount,
        lossCount: updates.lossCount,
        positionsOpened: updates.positionsOpened,
        positionsClosed: updates.positionsClosed,
        peakPnl: updates.peakPnl,
        drawdown: updates.drawdown,
        drawdownPct: updates.drawdownPct,
        updatedAt: updates.updatedAt ?? new Date(),
      },
    });
  }

  async getRange(startDate: string, endDate: string): Promise<DailyPnL[]> {
    const records = await requirePrisma().dailyPnL.findMany({
      where: {
        date: {
          gte: dateToKey(startDate),
          lte: dateToKey(endDate),
        },
      },
      orderBy: { date: 'asc' },
    });
    return records.map(mapDailyPnL);
  }
}
