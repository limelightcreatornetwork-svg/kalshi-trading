import { requirePrisma } from '@/lib/prisma';
import {
  DailySnapshot,
  SnapshotStorage,
  TradeHistory,
  TradeStorage,
} from '@/services/AnalyticsService';

function dateToKey(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function mapSnapshot(record: any): DailySnapshot {
  const date = record.date instanceof Date
    ? record.date.toISOString().split('T')[0]
    : record.date;

  return {
    id: record.id,
    date,
    portfolioValue: Number(record.portfolioValue ?? 0),
    cashBalance: Number(record.cashBalance ?? 0),
    positionValue: Number(record.positionValue ?? 0),
    realizedPnL: Number(record.realizedPnL ?? 0),
    unrealizedPnL: Number(record.unrealizedPnL ?? 0),
    dailyPnL: Number(record.dailyPnL ?? 0),
    openPositions: record.openPositions ?? 0,
    closedPositions: record.closedPositions ?? 0,
    highWaterMark: Number(record.highWaterMark ?? 0),
    drawdownAmount: Number(record.drawdownAmount ?? 0),
    drawdownPercent: Number(record.drawdownPercent ?? 0),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapTrade(record: any): TradeHistory {
  return {
    id: record.id,
    marketTicker: record.marketTicker,
    marketTitle: record.marketTitle ?? null,
    side: record.side,
    direction: record.direction,
    entryPrice: Number(record.entryPrice ?? 0),
    entryQuantity: record.entryQuantity ?? 0,
    entryValue: Number(record.entryValue ?? 0),
    entryDate: record.entryDate,
    exitPrice: record.exitPrice !== null ? Number(record.exitPrice) : null,
    exitQuantity: record.exitQuantity ?? null,
    exitValue: record.exitValue !== null ? Number(record.exitValue) : null,
    exitDate: record.exitDate ?? null,
    currentPrice: record.currentPrice !== null ? Number(record.currentPrice) : null,
    currentQuantity: record.currentQuantity ?? null,
    realizedPnL: Number(record.realizedPnL ?? 0),
    unrealizedPnL: Number(record.unrealizedPnL ?? 0),
    fees: Number(record.fees ?? 0),
    netPnL: Number(record.netPnL ?? 0),
    pnlPercent: Number(record.pnlPercent ?? 0),
    result: record.result,
    holdingPeriod: record.holdingPeriod ?? null,
    strategyId: record.strategyId ?? null,
    thesisId: record.thesisId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaSnapshotStorage implements SnapshotStorage {
  async getByDate(date: string): Promise<DailySnapshot | null> {
    const record = await requirePrisma().dailySnapshot.findUnique({
      where: { date: dateToKey(date) },
    });
    return record ? mapSnapshot(record) : null;
  }

  async getRange(startDate: string, endDate: string, limit?: number): Promise<DailySnapshot[]> {
    const records = await requirePrisma().dailySnapshot.findMany({
      where: {
        date: {
          gte: dateToKey(startDate),
          lte: dateToKey(endDate),
        },
      },
      orderBy: { date: 'asc' },
      take: limit,
    });
    return records.map(mapSnapshot);
  }

  async create(snapshot: DailySnapshot): Promise<void> {
    await requirePrisma().dailySnapshot.create({
      data: {
        id: snapshot.id,
        date: dateToKey(snapshot.date),
        portfolioValue: snapshot.portfolioValue,
        cashBalance: snapshot.cashBalance,
        positionValue: snapshot.positionValue,
        realizedPnL: snapshot.realizedPnL,
        unrealizedPnL: snapshot.unrealizedPnL,
        dailyPnL: snapshot.dailyPnL,
        openPositions: snapshot.openPositions,
        closedPositions: snapshot.closedPositions,
        highWaterMark: snapshot.highWaterMark,
        drawdownAmount: snapshot.drawdownAmount,
        drawdownPercent: snapshot.drawdownPercent,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    });
  }

  async update(date: string, updates: Partial<DailySnapshot>): Promise<void> {
    await requirePrisma().dailySnapshot.update({
      where: { date: dateToKey(date) },
      data: {
        portfolioValue: updates.portfolioValue,
        cashBalance: updates.cashBalance,
        positionValue: updates.positionValue,
        realizedPnL: updates.realizedPnL,
        unrealizedPnL: updates.unrealizedPnL,
        dailyPnL: updates.dailyPnL,
        openPositions: updates.openPositions,
        closedPositions: updates.closedPositions,
        highWaterMark: updates.highWaterMark,
        drawdownAmount: updates.drawdownAmount,
        drawdownPercent: updates.drawdownPercent,
        updatedAt: updates.updatedAt ?? new Date(),
      },
    });
  }

  async getLatest(): Promise<DailySnapshot | null> {
    const record = await requirePrisma().dailySnapshot.findFirst({
      orderBy: { date: 'desc' },
    });
    return record ? mapSnapshot(record) : null;
  }
}

export class PrismaTradeStorage implements TradeStorage {
  async getAll(): Promise<TradeHistory[]> {
    const records = await requirePrisma().tradeHistory.findMany({
      orderBy: { entryDate: 'desc' },
    });
    return records.map(mapTrade);
  }

  async getByResult(result: TradeHistory['result']): Promise<TradeHistory[]> {
    const records = await requirePrisma().tradeHistory.findMany({
      where: { result },
      orderBy: { entryDate: 'desc' },
    });
    return records.map(mapTrade);
  }

  async getByDateRange(startDate: Date, endDate: Date): Promise<TradeHistory[]> {
    const records = await requirePrisma().tradeHistory.findMany({
      where: {
        entryDate: { lte: endDate },
        OR: [
          { exitDate: { gte: startDate } },
          { exitDate: null, entryDate: { gte: startDate } },
        ],
      },
      orderBy: { entryDate: 'desc' },
    });
    return records.map(mapTrade);
  }

  async getById(id: string): Promise<TradeHistory | null> {
    const record = await requirePrisma().tradeHistory.findUnique({ where: { id } });
    return record ? mapTrade(record) : null;
  }

  async create(trade: TradeHistory): Promise<void> {
    await requirePrisma().tradeHistory.create({
      data: {
        id: trade.id,
        marketTicker: trade.marketTicker,
        marketTitle: trade.marketTitle ?? null,
        side: trade.side,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        entryQuantity: trade.entryQuantity,
        entryValue: trade.entryValue,
        entryDate: trade.entryDate,
        exitPrice: trade.exitPrice ?? null,
        exitQuantity: trade.exitQuantity ?? null,
        exitValue: trade.exitValue ?? null,
        exitDate: trade.exitDate ?? null,
        currentPrice: trade.currentPrice ?? null,
        currentQuantity: trade.currentQuantity ?? null,
        realizedPnL: trade.realizedPnL,
        unrealizedPnL: trade.unrealizedPnL,
        fees: trade.fees,
        netPnL: trade.netPnL,
        pnlPercent: trade.pnlPercent,
        result: trade.result,
        holdingPeriod: trade.holdingPeriod ?? null,
        strategyId: trade.strategyId ?? null,
        thesisId: trade.thesisId ?? null,
        createdAt: trade.createdAt,
        updatedAt: trade.updatedAt,
      },
    });
  }

  async update(id: string, updates: Partial<TradeHistory>): Promise<void> {
    await requirePrisma().tradeHistory.update({
      where: { id },
      data: {
        marketTicker: updates.marketTicker,
        marketTitle: updates.marketTitle ?? undefined,
        side: updates.side,
        direction: updates.direction,
        entryPrice: updates.entryPrice,
        entryQuantity: updates.entryQuantity,
        entryValue: updates.entryValue,
        entryDate: updates.entryDate,
        exitPrice: updates.exitPrice ?? undefined,
        exitQuantity: updates.exitQuantity ?? undefined,
        exitValue: updates.exitValue ?? undefined,
        exitDate: updates.exitDate ?? undefined,
        currentPrice: updates.currentPrice ?? undefined,
        currentQuantity: updates.currentQuantity ?? undefined,
        realizedPnL: updates.realizedPnL,
        unrealizedPnL: updates.unrealizedPnL,
        fees: updates.fees,
        netPnL: updates.netPnL,
        pnlPercent: updates.pnlPercent,
        result: updates.result,
        holdingPeriod: updates.holdingPeriod ?? undefined,
        strategyId: updates.strategyId ?? undefined,
        thesisId: updates.thesisId ?? undefined,
        updatedAt: updates.updatedAt ?? new Date(),
      },
    });
  }

  async getOpenTrades(): Promise<TradeHistory[]> {
    const records = await requirePrisma().tradeHistory.findMany({
      where: { result: 'OPEN' },
      orderBy: { entryDate: 'desc' },
    });
    return records.map(mapTrade);
  }

  async getClosedTrades(): Promise<TradeHistory[]> {
    const records = await requirePrisma().tradeHistory.findMany({
      where: { result: { not: 'OPEN' } },
      orderBy: { entryDate: 'desc' },
    });
    return records.map(mapTrade);
  }
}
