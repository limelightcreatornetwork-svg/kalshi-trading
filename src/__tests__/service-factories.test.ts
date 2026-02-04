// Service Factories Tests
// Tests for singleton factory functions, SimplePositionCapStorage, KalshiMarketPriceProvider

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Position } from '../types/position';

// ─── Mock Prisma storage modules ──────────────────────────────────────

vi.mock('../services/storage/prismaKillSwitchStorage', () => {
  class MockPrismaKillSwitchStorage {
    getActive = vi.fn().mockResolvedValue([]);
    getByLevel = vi.fn().mockResolvedValue([]);
    getById = vi.fn().mockResolvedValue(null);
    create = vi.fn().mockResolvedValue(undefined);
    update = vi.fn().mockResolvedValue(undefined);
    getConfig = vi.fn().mockResolvedValue(null);
    setConfig = vi.fn().mockResolvedValue(undefined);
  }
  return { PrismaKillSwitchStorage: MockPrismaKillSwitchStorage };
});

vi.mock('../services/storage/prismaDailyPnLStorage', () => {
  class MockPrismaDailyPnLStorage {
    getByDate = vi.fn().mockResolvedValue(null);
    create = vi.fn().mockResolvedValue(undefined);
    update = vi.fn().mockResolvedValue(undefined);
    getRange = vi.fn().mockResolvedValue([]);
  }
  return { PrismaDailyPnLStorage: MockPrismaDailyPnLStorage };
});

vi.mock('../services/storage/prismaSecretsStorage', () => {
  class MockPrismaSecretsStorage {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue(undefined);
    delete = vi.fn().mockResolvedValue(undefined);
    list = vi.fn().mockResolvedValue([]);
  }
  return { PrismaSecretsStorage: MockPrismaSecretsStorage };
});

vi.mock('../services/storage/prismaAnalyticsStorage', () => {
  class MockPrismaSnapshotStorage {
    getByDate = vi.fn().mockResolvedValue(null);
    getRange = vi.fn().mockResolvedValue([]);
    create = vi.fn().mockResolvedValue(undefined);
    update = vi.fn().mockResolvedValue(undefined);
    getLatest = vi.fn().mockResolvedValue(null);
  }
  class MockPrismaTradeStorage {
    getAll = vi.fn().mockResolvedValue([]);
    getByResult = vi.fn().mockResolvedValue([]);
    getByDateRange = vi.fn().mockResolvedValue([]);
    getById = vi.fn().mockResolvedValue(null);
    create = vi.fn().mockResolvedValue(undefined);
    update = vi.fn().mockResolvedValue(undefined);
    getOpenTrades = vi.fn().mockResolvedValue([]);
    getClosedTrades = vi.fn().mockResolvedValue([]);
  }
  return {
    PrismaSnapshotStorage: MockPrismaSnapshotStorage,
    PrismaTradeStorage: MockPrismaTradeStorage,
  };
});

vi.mock('../lib/kalshi', () => ({
  getMarkets: vi.fn().mockResolvedValue({
    markets: [
      {
        ticker: 'TICKER-A',
        yes_bid: 45,
        yes_ask: 48,
        no_bid: 50,
        no_ask: 53,
        last_price: 46,
      },
      {
        ticker: 'TICKER-B',
        yes_bid: 60,
        yes_ask: 63,
        no_bid: 35,
        no_ask: 38,
        last_price: 62,
      },
    ],
  }),
}));

// ─── Helper ──────────────────────────────────────────────────────────

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: crypto.randomUUID(),
    marketId: 'TICKER-A',
    side: 'yes',
    quantity: 10,
    avgPrice: 50,
    realizedPnl: 0,
    unrealizedPnl: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Service Factories', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─── getKillSwitchService ────────────────────────────────────────

  describe('getKillSwitchService', () => {
    it('should return a KillSwitchService instance', async () => {
      const { getKillSwitchService } = await import('../lib/service-factories');
      const service = getKillSwitchService();
      expect(service).toBeDefined();
      expect(typeof service.check).toBe('function');
    });

    it('should return the same singleton instance', async () => {
      const { getKillSwitchService } = await import('../lib/service-factories');
      const service1 = getKillSwitchService();
      const service2 = getKillSwitchService();
      expect(service1).toBe(service2);
    });
  });

  // ─── getDailyPnLService ─────────────────────────────────────────

  describe('getDailyPnLService', () => {
    it('should return a DailyPnLService instance', async () => {
      const { getDailyPnLService } = await import('../lib/service-factories');
      const service = getDailyPnLService();
      expect(service).toBeDefined();
      expect(typeof service.recordUpdate).toBe('function');
    });

    it('should return the same singleton instance', async () => {
      const { getDailyPnLService } = await import('../lib/service-factories');
      const service1 = getDailyPnLService();
      const service2 = getDailyPnLService();
      expect(service1).toBe(service2);
    });
  });

  // ─── getSecretsService ──────────────────────────────────────────

  describe('getSecretsService', () => {
    it('should throw when SECRETS_ENCRYPTION_KEY is not set', async () => {
      delete process.env.SECRETS_ENCRYPTION_KEY;
      const { getSecretsService } = await import('../lib/service-factories');
      expect(() => getSecretsService()).toThrow('SECRETS_ENCRYPTION_KEY not configured');
    });

    it('should return a SecretsService when encryption key is set', async () => {
      process.env.SECRETS_ENCRYPTION_KEY = 'a'.repeat(64);
      const { getSecretsService } = await import('../lib/service-factories');
      const service = getSecretsService();
      expect(service).toBeDefined();
      expect(typeof service.createCredential).toBe('function');
    });

    it('should return singleton when called twice', async () => {
      process.env.SECRETS_ENCRYPTION_KEY = 'a'.repeat(64);
      const { getSecretsService } = await import('../lib/service-factories');
      const service1 = getSecretsService();
      const service2 = getSecretsService();
      expect(service1).toBe(service2);
    });
  });

  // ─── getAnalyticsService ────────────────────────────────────────

  describe('getAnalyticsService', () => {
    it('should return an AnalyticsService with Prisma storage when DATABASE_URL is set', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      const { getAnalyticsService } = await import('../lib/service-factories');
      const service = getAnalyticsService();
      expect(service).toBeDefined();
      expect(typeof service.createDailySnapshot).toBe('function');
    });

    it('should return an AnalyticsService with in-memory storage when no DATABASE_URL', async () => {
      delete process.env.DATABASE_URL;
      const { getAnalyticsService } = await import('../lib/service-factories');
      const service = getAnalyticsService();
      expect(service).toBeDefined();
      expect(typeof service.createDailySnapshot).toBe('function');
    });

    it('should return singleton', async () => {
      delete process.env.DATABASE_URL;
      const { getAnalyticsService } = await import('../lib/service-factories');
      const service1 = getAnalyticsService();
      const service2 = getAnalyticsService();
      expect(service1).toBe(service2);
    });
  });

  // ─── getUnrealizedPnLService ────────────────────────────────────

  describe('getUnrealizedPnLService', () => {
    it('should return an UnrealizedPnLService instance', async () => {
      const { getUnrealizedPnLService } = await import('../lib/service-factories');
      const service = getUnrealizedPnLService();
      expect(service).toBeDefined();
      expect(typeof service.calculatePositionPnL).toBe('function');
      expect(typeof service.refreshAll).toBe('function');
    });

    it('should return singleton', async () => {
      const { getUnrealizedPnLService } = await import('../lib/service-factories');
      const service1 = getUnrealizedPnLService();
      const service2 = getUnrealizedPnLService();
      expect(service1).toBe(service2);
    });
  });

  // ─── createUnrealizedPnLServiceWithPositions ────────────────────

  describe('createUnrealizedPnLServiceWithPositions', () => {
    it('should create a new service with loaded positions', async () => {
      const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');
      const positions = [
        makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 10 }),
        makePosition({ marketId: 'TICKER-B', side: 'no', quantity: 5 }),
      ];
      const service = createUnrealizedPnLServiceWithPositions(positions);
      expect(service).toBeDefined();
      expect(typeof service.calculatePositionPnL).toBe('function');
    });

    it('should create a new instance each time (not singleton)', async () => {
      const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');
      const positions = [makePosition()];
      const service1 = createUnrealizedPnLServiceWithPositions(positions);
      const service2 = createUnrealizedPnLServiceWithPositions(positions);
      expect(service1).not.toBe(service2);
    });

    it('should work with empty positions array', async () => {
      const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');
      const service = createUnrealizedPnLServiceWithPositions([]);
      expect(service).toBeDefined();
    });

    it('should enable refreshAll with loaded positions', async () => {
      const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');
      const positions = [
        makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 10, avgPrice: 40 }),
        makePosition({ marketId: 'TICKER-B', side: 'no', quantity: 5, avgPrice: 30 }),
      ];
      const service = createUnrealizedPnLServiceWithPositions(positions);
      const summary = await service.refreshAll();

      expect(summary).toBeDefined();
      expect(summary.positions.length).toBe(2);
      expect(summary.lastUpdated).toBeInstanceOf(Date);
    });

    it('should return empty summary when no positions loaded', async () => {
      const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');
      const service = createUnrealizedPnLServiceWithPositions([]);
      const summary = await service.refreshAll();

      expect(summary.positions).toHaveLength(0);
      expect(summary.totalUnrealizedPnl).toBe(0);
    });
  });
});

// ─── KalshiMarketPriceProvider (via factory) ───────────────────────

describe('KalshiMarketPriceProvider (via factory)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should fetch market prices through getMarkets', async () => {
    const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');
    const { getMarkets } = await import('../lib/kalshi');

    const positions = [
      makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 10, avgPrice: 40 }),
    ];

    const service = createUnrealizedPnLServiceWithPositions(positions);
    const summary = await service.refreshAll();

    expect(getMarkets).toHaveBeenCalled();
    expect(summary).toBeDefined();
    expect(summary.positions.length).toBe(1);
  });

  it('should handle empty tickers list', async () => {
    const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');

    const service = createUnrealizedPnLServiceWithPositions([]);
    const summary = await service.refreshAll();

    expect(summary).toBeDefined();
    expect(summary.totalUnrealizedPnl).toBe(0);
  });

  it('should map market data to MarketPrice format correctly', async () => {
    const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');

    const positions = [
      makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 10, avgPrice: 40 }),
      makePosition({ marketId: 'TICKER-B', side: 'no', quantity: 5, avgPrice: 30 }),
    ];

    const service = createUnrealizedPnLServiceWithPositions(positions);
    const summary = await service.refreshAll();

    // Should have P&L entries for both positions
    expect(summary.positions.length).toBe(2);

    const tickerA = summary.positions.find(p => p.ticker === 'TICKER-A');
    const tickerB = summary.positions.find(p => p.ticker === 'TICKER-B');

    expect(tickerA).toBeDefined();
    expect(tickerB).toBeDefined();

    // TICKER-A: yes, mid = (45+48)/2 = 46.5, entry 40, qty 10 → pnl = (46.5-40)*10 = 65
    expect(tickerA!.unrealizedPnl).toBeCloseTo(65, 0);

    // TICKER-B: no side, mid = (35+38)/2 = 36.5, entry 30, qty 5 → pnl = (30-36.5)*5 = -32.5
    expect(tickerB!.unrealizedPnl).toBeCloseTo(-32.5, 0);
  });

  it('should skip positions with quantity <= 0', async () => {
    const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');

    const positions = [
      makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 0, avgPrice: 40 }),
    ];

    const service = createUnrealizedPnLServiceWithPositions(positions);
    const summary = await service.refreshAll();

    expect(summary.positions.length).toBe(0);
    expect(summary.totalUnrealizedPnl).toBe(0);
  });
});

// ─── SimplePositionCapStorage (tested through factory) ─────────────

describe('SimplePositionCapStorage (via factory)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should store and retrieve positions by key', async () => {
    const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');

    const positions = [
      makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 10, avgPrice: 40 }),
      makePosition({ marketId: 'TICKER-A', side: 'no', quantity: 5, avgPrice: 60 }),
      makePosition({ marketId: 'TICKER-B', side: 'yes', quantity: 3, avgPrice: 50 }),
    ];

    const service = createUnrealizedPnLServiceWithPositions(positions);
    const summary = await service.refreshAll();

    // All 3 positions should be in the summary
    expect(summary.positions.length).toBe(3);
  });

  it('should calculate correct total unrealized PnL', async () => {
    const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');

    const positions = [
      makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 10, avgPrice: 40 }),
    ];

    const service = createUnrealizedPnLServiceWithPositions(positions);
    const summary = await service.refreshAll();

    // Total should equal sum of all position PnLs
    const expectedTotal = summary.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    expect(summary.totalUnrealizedPnl).toBeCloseTo(expectedTotal, 2);
  });

  it('should support refreshPosition for individual position', async () => {
    const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');

    const positions = [
      makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 10, avgPrice: 40 }),
    ];

    const service = createUnrealizedPnLServiceWithPositions(positions);
    const pnl = await service.refreshPosition('TICKER-A', 'yes');

    expect(pnl).toBeDefined();
    expect(pnl!.ticker).toBe('TICKER-A');
    expect(pnl!.side).toBe('yes');
  });

  it('should return null for non-existent position in refreshPosition', async () => {
    const { createUnrealizedPnLServiceWithPositions } = await import('../lib/service-factories');

    const service = createUnrealizedPnLServiceWithPositions([]);
    const pnl = await service.refreshPosition('NONEXISTENT', 'yes');

    expect(pnl).toBeNull();
  });
});
