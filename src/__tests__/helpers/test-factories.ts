// Test-only InMemory storage implementations and factory functions.
// These were moved out of production service files since they're only used in tests.

import {
  IdempotencyService,
  IdempotencyStorage,
  IdempotencyRecord,
  IdempotencyServiceConfig,
} from '../../services/IdempotencyService';

import {
  KillSwitchService,
  KillSwitchStorage,
  KillSwitchServiceEvents,
} from '../../services/KillSwitchService';
import {
  KillSwitch,
  KillSwitchLevel,
  KillSwitchConfig,
} from '../../types/killswitch';

import {
  PositionCapService,
  PositionCapStorage,
  PositionCapServiceEvents,
} from '../../services/PositionCapService';
import {
  Market,
  Position,
  PositionCap,
} from '../../types/position';

import {
  ThesisService,
  ThesisStorage,
  ThesisServiceEvents,
} from '../../services/ThesisService';
import {
  Thesis,
  ThesisStatus,
  DataSnapshot,
  ThesisPerformance,
} from '../../types/thesis';

import {
  DailyPnLService,
  DailyPnLServiceConfig,
  DailyPnLServiceEvents,
  PnLStorage,
  DailyPnL,
} from '../../services/DailyPnLService';

import {
  StrategyRegistry,
  StrategyRegistryConfig,
  StrategyRegistryEvents,
} from '../../services/StrategyRegistry';

import {
  PreTradeCheckService,
  PreTradeCheckConfig,
} from '../../services/PreTradeCheckService';

import {
  UnrealizedPnLService,
  UnrealizedPnLServiceConfig,
  UnrealizedPnLServiceEvents,
  MarketPriceProvider,
  MarketPrice,
} from '../../services/UnrealizedPnLService';

// ─── InMemoryIdempotencyStorage ─────────────────────────────────────────

export class InMemoryIdempotencyStorage implements IdempotencyStorage {
  private records: Map<string, IdempotencyRecord> = new Map();

  async get(key: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(key);
    if (!record) return null;
    if (record.expiresAt < new Date()) {
      this.records.delete(key);
      return null;
    }
    return record;
  }

  async set(record: IdempotencyRecord): Promise<void> {
    this.records.set(record.key, record);
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let deleted = 0;
    for (const [key, record] of this.records) {
      if (record.expiresAt < now) {
        this.records.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  clear(): void {
    this.records.clear();
  }

  size(): number {
    return this.records.size;
  }
}

// ─── InMemoryKillSwitchStorage ──────────────────────────────────────────

export class InMemoryKillSwitchStorage implements KillSwitchStorage {
  private switches: Map<string, KillSwitch> = new Map();
  private configs: Map<string, KillSwitchConfig> = new Map();

  async getActive(): Promise<KillSwitch[]> {
    const now = new Date();
    return Array.from(this.switches.values()).filter(s => {
      if (!s.isActive) return false;
      if (s.autoResetAt && s.autoResetAt <= now) return false;
      return true;
    });
  }

  async getByLevel(level: KillSwitchLevel): Promise<KillSwitch[]> {
    return Array.from(this.switches.values()).filter(s =>
      s.level === level && s.isActive
    );
  }

  async getById(id: string): Promise<KillSwitch | null> {
    return this.switches.get(id) ?? null;
  }

  async create(killSwitch: KillSwitch): Promise<void> {
    this.switches.set(killSwitch.id, killSwitch);
  }

  async update(id: string, updates: Partial<KillSwitch>): Promise<void> {
    const existing = this.switches.get(id);
    if (existing) {
      this.switches.set(id, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async getConfig(level: KillSwitchLevel, targetId?: string): Promise<KillSwitchConfig | null> {
    const key = `${level}:${targetId ?? 'global'}`;
    return this.configs.get(key) ?? null;
  }

  async setConfig(config: KillSwitchConfig): Promise<void> {
    const key = `${config.level}:${config.targetId ?? 'global'}`;
    this.configs.set(key, config);
  }

  clear(): void {
    this.switches.clear();
    this.configs.clear();
  }
}

// ─── InMemoryPositionCapStorage ─────────────────────────────────────────

export class InMemoryPositionCapStorage implements PositionCapStorage {
  private markets: Map<string, Market> = new Map();
  private positions: Map<string, Position> = new Map();
  private caps: Map<string, PositionCap> = new Map();
  private portfolioValue: number = 100000;

  async getMarket(id: string): Promise<Market | null> {
    return this.markets.get(id) ?? null;
  }

  async getMarketByExternalId(externalId: string): Promise<Market | null> {
    for (const market of this.markets.values()) {
      if (market.externalId === externalId) {
        return market;
      }
    }
    return null;
  }

  async createMarket(market: Market): Promise<void> {
    this.markets.set(market.id, market);
  }

  async updateMarket(id: string, updates: Partial<Market>): Promise<void> {
    const existing = this.markets.get(id);
    if (existing) {
      this.markets.set(id, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async getPosition(marketId: string, side: string): Promise<Position | null> {
    return this.positions.get(`${marketId}:${side}`) ?? null;
  }

  async getAllPositions(): Promise<Position[]> {
    return Array.from(this.positions.values());
  }

  async upsertPosition(position: Position): Promise<void> {
    this.positions.set(`${position.marketId}:${position.side}`, position);
  }

  async getCaps(marketId?: string): Promise<PositionCap[]> {
    return Array.from(this.caps.values()).filter(c =>
      marketId ? c.marketId === marketId : !c.marketId
    );
  }

  async upsertCap(cap: PositionCap): Promise<void> {
    const key = `${cap.marketId ?? 'global'}:${cap.capType}`;
    this.caps.set(key, cap);
  }

  async getGlobalCaps(): Promise<PositionCap[]> {
    return Array.from(this.caps.values()).filter(c => !c.marketId);
  }

  async getTotalPortfolioValue(): Promise<number> {
    return this.portfolioValue;
  }

  setPortfolioValue(value: number): void {
    this.portfolioValue = value;
  }

  clear(): void {
    this.markets.clear();
    this.positions.clear();
    this.caps.clear();
  }
}

// ─── InMemoryThesisStorage ──────────────────────────────────────────────

export class InMemoryThesisStorage implements ThesisStorage {
  private theses: Map<string, Thesis> = new Map();
  private snapshots: Map<string, DataSnapshot> = new Map();
  private performance: ThesisPerformance[] = [];

  async getById(id: string): Promise<Thesis | null> {
    return this.theses.get(id) ?? null;
  }

  async getByMarket(marketId: string): Promise<Thesis[]> {
    return Array.from(this.theses.values()).filter(t => t.marketId === marketId);
  }

  async getActive(): Promise<Thesis[]> {
    const now = new Date();
    return Array.from(this.theses.values()).filter(t => {
      if (t.status !== ThesisStatus.ACTIVE) return false;
      if (t.expiresAt && t.expiresAt < now) return false;
      return true;
    });
  }

  async getActiveForMarket(marketId: string): Promise<Thesis | null> {
    const active = await this.getActive();
    return active.find(t => t.marketId === marketId) ?? null;
  }

  async create(thesis: Thesis): Promise<void> {
    this.theses.set(thesis.id, thesis);
  }

  async update(id: string, updates: Partial<Thesis>): Promise<void> {
    const existing = this.theses.get(id);
    if (existing) {
      this.theses.set(id, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async createSnapshot(snapshot: DataSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);
  }

  async getSnapshot(id: string): Promise<DataSnapshot | null> {
    return this.snapshots.get(id) ?? null;
  }

  async recordPerformance(perf: ThesisPerformance): Promise<void> {
    this.performance.push(perf);
  }

  async getPerformanceByModel(modelId: string): Promise<ThesisPerformance[]> {
    return this.performance.filter(p => p.modelId === modelId);
  }

  clear(): void {
    this.theses.clear();
    this.snapshots.clear();
    this.performance = [];
  }
}

// ─── InMemoryPnLStorage ─────────────────────────────────────────────────

export class InMemoryPnLStorage implements PnLStorage {
  private records: Map<string, DailyPnL> = new Map();

  async getByDate(date: string): Promise<DailyPnL | null> {
    return this.records.get(date) ?? null;
  }

  async create(pnl: DailyPnL): Promise<void> {
    this.records.set(pnl.date, pnl);
  }

  async update(date: string, updates: Partial<DailyPnL>): Promise<void> {
    const existing = this.records.get(date);
    if (existing) {
      this.records.set(date, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async getRange(startDate: string, endDate: string): Promise<DailyPnL[]> {
    return Array.from(this.records.values())
      .filter(r => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  clear(): void {
    this.records.clear();
  }
}

// ─── Factory functions ──────────────────────────────────────────────────

export function createIdempotencyService(
  config: Partial<IdempotencyServiceConfig> = {}
): IdempotencyService {
  return new IdempotencyService(new InMemoryIdempotencyStorage(), config);
}

export function createKillSwitchService(
  events: KillSwitchServiceEvents = {}
): KillSwitchService {
  return new KillSwitchService(new InMemoryKillSwitchStorage(), events);
}

export function createPositionCapService(
  events: PositionCapServiceEvents = {}
): PositionCapService {
  return new PositionCapService(new InMemoryPositionCapStorage(), events);
}

export function createThesisService(
  events: ThesisServiceEvents = {}
): ThesisService {
  return new ThesisService(new InMemoryThesisStorage(), events);
}

export function createDailyPnLService(
  config: Partial<DailyPnLServiceConfig> = {},
  events: DailyPnLServiceEvents = {}
): DailyPnLService {
  return new DailyPnLService(new InMemoryPnLStorage(), config, events);
}

export function createStrategyRegistry(
  config: Partial<StrategyRegistryConfig> = {},
  events: StrategyRegistryEvents = {}
): StrategyRegistry {
  return new StrategyRegistry(config, events);
}

export function createPreTradeCheckService(
  config: Partial<PreTradeCheckConfig> = {}
): PreTradeCheckService {
  return new PreTradeCheckService(config);
}

// ─── InMemoryMarketPriceProvider ────────────────────────────────────────

export class InMemoryMarketPriceProvider implements MarketPriceProvider {
  private prices: Map<string, MarketPrice> = new Map();

  setPrice(ticker: string, price: MarketPrice): void {
    this.prices.set(ticker, price);
  }

  setPriceSimple(
    ticker: string,
    yesBid: number,
    yesAsk: number,
    lastPrice?: number
  ): void {
    this.prices.set(ticker, {
      ticker,
      yesBid,
      yesAsk,
      noBid: 100 - yesAsk,
      noAsk: 100 - yesBid,
      lastPrice: lastPrice ?? (yesBid + yesAsk) / 2,
    });
  }

  async getMarketPrices(tickers: string[]): Promise<Map<string, MarketPrice>> {
    const result = new Map<string, MarketPrice>();
    for (const ticker of tickers) {
      const price = this.prices.get(ticker);
      if (price) result.set(ticker, price);
    }
    return result;
  }

  clear(): void {
    this.prices.clear();
  }
}

// ─── UnrealizedPnLService factory ───────────────────────────────────────

export function createUnrealizedPnLService(
  config: Partial<UnrealizedPnLServiceConfig> = {},
  events: UnrealizedPnLServiceEvents = {}
): {
  service: UnrealizedPnLService;
  storage: InMemoryPositionCapStorage;
  priceProvider: InMemoryMarketPriceProvider;
} {
  const storage = new InMemoryPositionCapStorage();
  const priceProvider = new InMemoryMarketPriceProvider();
  const service = new UnrealizedPnLService(storage, priceProvider, config, events);
  return { service, storage, priceProvider };
}
