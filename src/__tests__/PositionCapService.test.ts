// Position Cap Service Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PositionCapService,
  PositionCapServiceEvents,
} from '../services/PositionCapService';
import { InMemoryPositionCapStorage, createPositionCapService } from './helpers/test-factories';
import {
  CapType,
  MarketStatus,
  RISK_TIER_MULTIPLIERS,
} from '../types/position';

describe('InMemoryPositionCapStorage', () => {
  let storage: InMemoryPositionCapStorage;

  beforeEach(() => {
    storage = new InMemoryPositionCapStorage();
  });

  it('should create and retrieve markets', async () => {
    const market = {
      id: 'market-1',
      externalId: 'KALSHI-BTC-100K',
      title: 'Will BTC reach 100K?',
      status: MarketStatus.OPEN,
      maxPositionSize: 1000,
      maxNotional: 10000,
      currentPosition: 0,
      riskTier: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.createMarket(market);
    const retrieved = await storage.getMarket('market-1');

    expect(retrieved).toEqual(market);
  });

  it('should find market by external ID', async () => {
    const market = {
      id: 'market-1',
      externalId: 'KALSHI-BTC-100K',
      title: 'Will BTC reach 100K?',
      status: MarketStatus.OPEN,
      maxPositionSize: 1000,
      maxNotional: 10000,
      currentPosition: 0,
      riskTier: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.createMarket(market);
    const retrieved = await storage.getMarketByExternalId('KALSHI-BTC-100K');

    expect(retrieved?.id).toBe('market-1');
  });

  it('should store and retrieve positions', async () => {
    const position = {
      id: 'pos-1',
      marketId: 'market-1',
      side: 'yes' as const,
      quantity: 100,
      avgPrice: 0.55,
      realizedPnl: 0,
      unrealizedPnl: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.upsertPosition(position);
    const retrieved = await storage.getPosition('market-1', 'yes');

    expect(retrieved).toEqual(position);
  });

  it('should store and retrieve caps', async () => {
    const cap = {
      id: 'cap-1',
      marketId: 'market-1',
      capType: CapType.ABSOLUTE,
      softLimit: 800,
      hardLimit: 1000,
      currentValue: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.upsertCap(cap);
    const retrieved = await storage.getCaps('market-1');

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]).toEqual(cap);
  });
});

describe('PositionCapService', () => {
  let service: PositionCapService;
  let storage: InMemoryPositionCapStorage;
  let events: PositionCapServiceEvents;

  beforeEach(() => {
    storage = new InMemoryPositionCapStorage();
    events = {
      onSoftLimitWarning: vi.fn(),
      onHardLimitBlocked: vi.fn(),
      onPositionUpdate: vi.fn(),
    };
    service = new PositionCapService(storage, events);
  });

  describe('ensureMarket', () => {
    it('should create new market', async () => {
      const market = await service.ensureMarket({
        externalId: 'KALSHI-BTC-100K',
        title: 'Will BTC reach 100K?',
        category: 'Crypto',
        maxPositionSize: 500,
        maxNotional: 5000,
        riskTier: 2,
      });

      expect(market.id).toBeDefined();
      expect(market.externalId).toBe('KALSHI-BTC-100K');
      expect(market.maxPositionSize).toBe(500);
      expect(market.riskTier).toBe(2);
    });

    it('should return existing market', async () => {
      const market1 = await service.ensureMarket({
        externalId: 'KALSHI-BTC-100K',
        title: 'Will BTC reach 100K?',
      });

      const market2 = await service.ensureMarket({
        externalId: 'KALSHI-BTC-100K',
        title: 'Updated title',
      });

      expect(market1.id).toBe(market2.id);
      expect(market2.title).toBe('Will BTC reach 100K?'); // Original title preserved
    });

    it('should use default values', async () => {
      const market = await service.ensureMarket({
        externalId: 'KALSHI-NEW',
        title: 'New Market',
      });

      expect(market.maxPositionSize).toBe(1000);
      expect(market.maxNotional).toBe(10000);
      expect(market.riskTier).toBe(1);
    });
  });

  describe('updateMarket', () => {
    it('should update market configuration', async () => {
      const market = await service.ensureMarket({
        externalId: 'KALSHI-BTC-100K',
        title: 'Will BTC reach 100K?',
      });

      const updated = await service.updateMarket(market.id, {
        maxPositionSize: 2000,
        riskTier: 3,
      });

      expect(updated?.maxPositionSize).toBe(2000);
      expect(updated?.riskTier).toBe(3);
    });

    it('should return null for non-existent market', async () => {
      const result = await service.updateMarket('non-existent', {
        maxPositionSize: 2000,
      });

      expect(result).toBeNull();
    });
  });

  describe('checkCaps', () => {
    let marketId: string;

    beforeEach(async () => {
      const market = await service.ensureMarket({
        externalId: 'KALSHI-TEST',
        title: 'Test Market',
        maxPositionSize: 1000,
        maxNotional: 1000, // $1000 max notional
        riskTier: 1,
      });
      marketId = market.id;
    });

    it('should allow order within limits', async () => {
      const result = await service.checkCaps({
        marketId,
        side: 'yes',
        quantity: 100,
        price: 0.50,
      });

      expect(result.allowed).toBe(true);
      expect(result.caps.length).toBeGreaterThan(0);
    });

    it('should block order exceeding position size', async () => {
      const result = await service.checkCaps({
        marketId,
        side: 'yes',
        quantity: 1500, // Exceeds 1000 limit
        price: 0.50,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds max');
    });

    it('should block order exceeding notional limit', async () => {
      const result = await service.checkCaps({
        marketId,
        side: 'yes',
        quantity: 500,
        price: 5.00, // $2500 notional, exceeds $1000
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Notional');
    });

    it('should return not allowed for non-existent market', async () => {
      const result = await service.checkCaps({
        marketId: 'non-existent',
        side: 'yes',
        quantity: 100,
        price: 0.50,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Market not found');
    });

    it('should consider existing position', async () => {
      // First, update position to 900
      await service.updatePosition(marketId, 'yes', 900, 0.50);

      // Now try to add 200 more (would total 1100, exceeding 1000)
      const result = await service.checkCaps({
        marketId,
        side: 'yes',
        quantity: 200,
        price: 0.50,
      });

      expect(result.allowed).toBe(false);
    });

    it('should apply risk tier multiplier', async () => {
      // Update to high risk tier (0.25 multiplier)
      await service.updateMarket(marketId, { riskTier: 3 });

      // Max position is now 1000 * 0.25 = 250
      const result = await service.checkCaps({
        marketId,
        side: 'yes',
        quantity: 300, // Exceeds adjusted limit
        price: 0.50,
      });

      expect(result.allowed).toBe(false);
    });

    it('should fire soft limit warning', async () => {
      // Order that exceeds 80% soft limit
      const result = await service.checkCaps({
        marketId,
        side: 'yes',
        quantity: 850, // 85% of 1000
        price: 0.50,
      });

      expect(result.allowed).toBe(true);
      expect(result.caps.some(c => c.wouldExceedSoft)).toBe(true);
    });

    describe('configured caps', () => {
      it('should check ABSOLUTE configured cap', async () => {
        await service.setCap(CapType.ABSOLUTE, 500, 800, marketId);

        const result = await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 600,
          price: 0.50,
        });

        const absCap = result.caps.find(c => c.softLimit === 500 && c.hardLimit === 800);
        expect(absCap).toBeDefined();
        expect(absCap!.wouldExceedSoft).toBe(true);
        expect(absCap!.current).toBe(0);
      });

      it('should block when ABSOLUTE configured cap hard limit exceeded', async () => {
        await service.setCap(CapType.ABSOLUTE, 500, 800, marketId);

        const result = await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 900,
          price: 0.50,
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('absolute');
        expect(events.onHardLimitBlocked).toHaveBeenCalled();
      });

      it('should check PERCENTAGE configured cap', async () => {
        // Set portfolio value so percentage calculation works
        await storage.setPortfolioValue(10000);
        await service.setCap(CapType.PERCENTAGE, 0.05, 0.10, marketId);

        const result = await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 800,
          price: 0.50,
        });

        // notionalValue = 800 * 0.50 = 400, portfolioValue = 10000
        // newValue = 400 / 10000 = 0.04
        const pctCap = result.caps.find(c => c.type === CapType.PERCENTAGE);
        expect(pctCap).toBeDefined();
        expect(pctCap!.wouldExceedSoft).toBe(false); // 0.04 < 0.05
      });

      it('should block when PERCENTAGE cap hard limit exceeded', async () => {
        await storage.setPortfolioValue(1000);
        await service.setCap(CapType.PERCENTAGE, 0.05, 0.10, marketId);

        const result = await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 500,
          price: 0.50,
        });

        // notionalValue = 500 * 0.50 = 250, portfolioValue = 1000
        // newValue = 250 / 1000 = 0.25 > 0.10
        expect(result.allowed).toBe(false);
      });

      it('should check NOTIONAL configured cap', async () => {
        await service.setCap(CapType.NOTIONAL, 200, 400, marketId);

        const result = await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 300,
          price: 0.50,
        });

        // notionalValue = 300 * 0.50 = 150, under soft limit
        const notionalCap = result.caps.find(c => c.type === CapType.NOTIONAL && c.softLimit === 200);
        expect(notionalCap).toBeDefined();
        expect(notionalCap!.wouldExceedSoft).toBe(false);
      });

      it('should block when NOTIONAL cap hard limit exceeded', async () => {
        await service.setCap(CapType.NOTIONAL, 200, 400, marketId);

        const result = await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 500,
          price: 1.00,
        });

        // notionalValue = 500 * 1.00 = 500 > 400
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('notional');
      });

      it('should fire onSoftLimitWarning when soft limit exceeded', async () => {
        await service.setCap(CapType.ABSOLUTE, 100, 800, marketId);

        await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 200,
          price: 0.50,
        });

        expect(events.onSoftLimitWarning).toHaveBeenCalled();
      });

      it('should fire onHardLimitBlocked when hard limit exceeded', async () => {
        await service.setCap(CapType.ABSOLUTE, 100, 200, marketId);

        await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 300,
          price: 0.50,
        });

        expect(events.onHardLimitBlocked).toHaveBeenCalled();
      });

      it('should skip inactive caps', async () => {
        const cap = await service.setCap(CapType.ABSOLUTE, 10, 20, marketId);
        // Mark cap as inactive
        cap.isActive = false;
        await storage.upsertCap(cap);

        const result = await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 100,
          price: 0.50,
        });

        // Should only have market-level caps, not the inactive configured one
        const inactiveCap = result.caps.find(c => c.softLimit === 10 && c.hardLimit === 20);
        expect(inactiveCap).toBeUndefined();
      });

      it('should check global caps alongside market caps', async () => {
        // Create a global cap (no marketId)
        await service.setCap(CapType.ABSOLUTE, 400, 600);

        const result = await service.checkCaps({
          marketId,
          side: 'yes',
          quantity: 500,
          price: 0.50,
        });

        // Should have market-level caps + global cap
        expect(result.caps.length).toBeGreaterThanOrEqual(3);
        const globalCap = result.caps.find(c => c.softLimit === 400 && c.hardLimit === 600);
        expect(globalCap).toBeDefined();
        expect(globalCap!.wouldExceedSoft).toBe(true);
      });
    });
  });

  describe('updatePosition', () => {
    let marketId: string;

    beforeEach(async () => {
      const market = await service.ensureMarket({
        externalId: 'KALSHI-TEST',
        title: 'Test Market',
      });
      marketId = market.id;
    });

    it('should create new position', async () => {
      const position = await service.updatePosition(marketId, 'yes', 100, 0.55);

      expect(position.quantity).toBe(100);
      expect(position.avgPrice).toBe(0.55);
      expect(events.onPositionUpdate).toHaveBeenCalled();
    });

    it('should update existing position with FIFO average', async () => {
      await service.updatePosition(marketId, 'yes', 100, 0.50);
      const position = await service.updatePosition(marketId, 'yes', 100, 0.60);

      expect(position.quantity).toBe(200);
      // (100 * 0.50 + 100 * 0.60) / 200 = 0.55
      expect(position.avgPrice).toBe(0.55);
    });

    it('should update market current position', async () => {
      await service.updatePosition(marketId, 'yes', 100, 0.55);
      
      const market = await storage.getMarket(marketId);
      expect(market?.currentPosition).toBe(100);
    });
  });

  describe('setCap', () => {
    it('should create market-specific cap', async () => {
      const market = await service.ensureMarket({
        externalId: 'KALSHI-TEST',
        title: 'Test Market',
      });

      const cap = await service.setCap(CapType.ABSOLUTE, 800, 1000, market.id);

      expect(cap.marketId).toBe(market.id);
      expect(cap.capType).toBe(CapType.ABSOLUTE);
      expect(cap.softLimit).toBe(800);
      expect(cap.hardLimit).toBe(1000);
    });

    it('should create global cap', async () => {
      const cap = await service.setCap(CapType.PERCENTAGE, 0.05, 0.10);

      expect(cap.marketId).toBeUndefined();
      expect(cap.capType).toBe(CapType.PERCENTAGE);
    });
  });

  describe('getMaxOrderSize', () => {
    let marketId: string;

    beforeEach(async () => {
      const market = await service.ensureMarket({
        externalId: 'KALSHI-TEST',
        title: 'Test Market',
        maxPositionSize: 1000,
        maxNotional: 500, // $500 max
      });
      marketId = market.id;
    });

    it('should return max size with no existing position', async () => {
      const maxSize = await service.getMaxOrderSize(marketId, 'yes', 0.50);

      // Min of (1000 - 0 = 1000, (500 - 0) / 0.50 = 1000) = 1000
      expect(maxSize).toBe(1000);
    });

    it('should consider existing position', async () => {
      await service.updatePosition(marketId, 'yes', 600, 0.50);

      const maxSize = await service.getMaxOrderSize(marketId, 'yes', 0.50);

      // Min of (1000 - 600 = 400, (500 - 300) / 0.50 = 400) = 400
      expect(maxSize).toBe(400);
    });

    it('should return 0 for non-existent market', async () => {
      const maxSize = await service.getMaxOrderSize('non-existent', 'yes', 0.50);
      expect(maxSize).toBe(0);
    });

    it('should return 0 when at max position', async () => {
      await service.updatePosition(marketId, 'yes', 1000, 0.50);

      const maxSize = await service.getMaxOrderSize(marketId, 'yes', 0.50);
      expect(maxSize).toBe(0);
    });
  });

  describe('getPositionSummary', () => {
    let marketId: string;

    beforeEach(async () => {
      const market = await service.ensureMarket({
        externalId: 'KALSHI-TEST',
        title: 'Test Market',
        maxNotional: 1000,
      });
      marketId = market.id;
    });

    it('should return summary with positions', async () => {
      await service.updatePosition(marketId, 'yes', 100, 0.60);
      await service.updatePosition(marketId, 'no', 50, 0.40);

      const summary = await service.getPositionSummary(marketId);

      expect(summary).not.toBeNull();
      expect(summary?.yesPosition?.quantity).toBe(100);
      expect(summary?.noPosition?.quantity).toBe(50);
      expect(summary?.netExposure).toBe(50); // 100 - 50
      expect(summary?.totalNotional).toBe(80); // 100*0.60 + 50*0.40
    });

    it('should calculate utilization percentage', async () => {
      await service.updatePosition(marketId, 'yes', 100, 0.50);

      const summary = await service.getPositionSummary(marketId);

      // 50 / 1000 * 100 = 5%
      expect(summary?.utilizationPct).toBe(5);
    });

    it('should return null for non-existent market', async () => {
      const summary = await service.getPositionSummary('non-existent');
      expect(summary).toBeNull();
    });
  });
});

describe('RISK_TIER_MULTIPLIERS', () => {
  it('should have correct multipliers', () => {
    expect(RISK_TIER_MULTIPLIERS[1]).toBe(1.0);
    expect(RISK_TIER_MULTIPLIERS[2]).toBe(0.5);
    expect(RISK_TIER_MULTIPLIERS[3]).toBe(0.25);
  });
});

describe('createPositionCapService', () => {
  it('should create service with default storage', () => {
    const service = createPositionCapService();
    expect(service).toBeInstanceOf(PositionCapService);
  });
});
