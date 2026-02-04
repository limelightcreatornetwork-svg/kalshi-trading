import { KillSwitchService } from '@/services/KillSwitchService';
import { DailyPnLService } from '@/services/DailyPnLService';
import { SecretsService } from '@/services/SecretsService';
import { AnalyticsService, InMemorySnapshotStorage, InMemoryTradeStorage } from '@/services/AnalyticsService';
import { UnrealizedPnLService, MarketPriceProvider, MarketPrice } from '@/services/UnrealizedPnLService';
import { PositionCapStorage } from '@/services/PositionCapService';
import { Market, Position, PositionCap } from '@/types/position';
import { getMarkets } from '@/lib/kalshi';
import { PrismaKillSwitchStorage } from '@/services/storage/prismaKillSwitchStorage';
import { PrismaDailyPnLStorage } from '@/services/storage/prismaDailyPnLStorage';
import { PrismaSecretsStorage } from '@/services/storage/prismaSecretsStorage';
import { PrismaSnapshotStorage, PrismaTradeStorage } from '@/services/storage/prismaAnalyticsStorage';
import {
  StrategyManagementService,
  InMemoryStrategyConfigStorage,
  InMemoryStrategyStateStorage,
} from '@/services/StrategyManagementService';

let killSwitchService: KillSwitchService | null = null;
let dailyPnLService: DailyPnLService | null = null;
let secretsService: SecretsService | null = null;
let analyticsService: AnalyticsService | null = null;
let unrealizedPnLService: UnrealizedPnLService | null = null;
let strategyManagementService: StrategyManagementService | null = null;

export function getKillSwitchService(): KillSwitchService {
  if (!killSwitchService) {
    killSwitchService = new KillSwitchService(new PrismaKillSwitchStorage());
  }
  return killSwitchService;
}

export function getDailyPnLService(): DailyPnLService {
  if (!dailyPnLService) {
    dailyPnLService = new DailyPnLService(new PrismaDailyPnLStorage());
  }
  return dailyPnLService;
}

export function getSecretsService(): SecretsService {
  if (!secretsService) {
    const encryptionKey = process.env.SECRETS_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('SECRETS_ENCRYPTION_KEY not configured');
    }
    secretsService = new SecretsService(new PrismaSecretsStorage(), encryptionKey);
  }
  return secretsService;
}

export function getAnalyticsService(): AnalyticsService {
  if (!analyticsService) {
    if (process.env.DATABASE_URL) {
      analyticsService = new AnalyticsService(
        new PrismaSnapshotStorage(),
        new PrismaTradeStorage()
      );
    } else {
      analyticsService = new AnalyticsService(
        new InMemorySnapshotStorage(),
        new InMemoryTradeStorage()
      );
    }
  }
  return analyticsService;
}

// ─── KalshiMarketPriceProvider ──────────────────────────────────────

class KalshiMarketPriceProvider implements MarketPriceProvider {
  async getMarketPrices(tickers: string[]): Promise<Map<string, MarketPrice>> {
    const result = new Map<string, MarketPrice>();
    if (tickers.length === 0) return result;

    const { markets } = await getMarkets({ tickers: tickers.join(',') });
    for (const m of markets) {
      result.set(m.ticker, {
        ticker: m.ticker,
        yesBid: m.yes_bid,
        yesAsk: m.yes_ask,
        noBid: m.no_bid,
        noAsk: m.no_ask,
        lastPrice: m.last_price,
      });
    }
    return result;
  }
}

// ─── InMemoryPositionCapStorage (lightweight, for dashboard use) ────

class SimplePositionCapStorage implements PositionCapStorage {
  private positions: Map<string, Position> = new Map();

  async getMarket(): Promise<Market | null> { return null; }
  async getMarketByExternalId(): Promise<Market | null> { return null; }
  async createMarket(): Promise<void> {}
  async updateMarket(): Promise<void> {}
  async getPosition(marketId: string, side: string): Promise<Position | null> {
    return this.positions.get(`${marketId}:${side}`) ?? null;
  }
  async getAllPositions(): Promise<Position[]> {
    return Array.from(this.positions.values());
  }
  async upsertPosition(position: Position): Promise<void> {
    this.positions.set(`${position.marketId}:${position.side}`, position);
  }
  async getCaps(): Promise<PositionCap[]> { return []; }
  async upsertCap(): Promise<void> {}
  async getGlobalCaps(): Promise<PositionCap[]> { return []; }
  async getTotalPortfolioValue(): Promise<number> { return 0; }

  loadPositions(positions: Position[]): void {
    this.positions.clear();
    for (const p of positions) {
      this.positions.set(`${p.marketId}:${p.side}`, p);
    }
  }
}

export function getUnrealizedPnLService(): UnrealizedPnLService {
  if (!unrealizedPnLService) {
    unrealizedPnLService = new UnrealizedPnLService(
      new SimplePositionCapStorage(),
      new KalshiMarketPriceProvider()
    );
  }
  return unrealizedPnLService;
}

export function createUnrealizedPnLServiceWithPositions(
  positions: Position[]
): UnrealizedPnLService {
  const storage = new SimplePositionCapStorage();
  storage.loadPositions(positions);
  return new UnrealizedPnLService(storage, new KalshiMarketPriceProvider());
}

// ─── StrategyManagementService ──────────────────────────────────────

export function getStrategyManagementService(): StrategyManagementService {
  if (!strategyManagementService) {
    // Always use in-memory for now; can swap to Prisma-backed storage later
    strategyManagementService = new StrategyManagementService(
      new InMemoryStrategyConfigStorage(),
      new InMemoryStrategyStateStorage()
    );
  }
  return strategyManagementService;
}
