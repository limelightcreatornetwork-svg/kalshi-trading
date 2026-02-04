import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Position } from '../types/position';
import {
  UnrealizedPnLService,
  MarketPrice,
  UnrealizedPnLSummary,
} from '../services/UnrealizedPnLService';
import {
  createUnrealizedPnLService,
  InMemoryPositionCapStorage,
  InMemoryMarketPriceProvider,
} from './helpers/test-factories';

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

describe('UnrealizedPnLService', () => {
  let service: UnrealizedPnLService;
  let storage: InMemoryPositionCapStorage;
  let priceProvider: InMemoryMarketPriceProvider;

  beforeEach(() => {
    ({ service, storage, priceProvider } = createUnrealizedPnLService());
  });

  // ─── Pure P&L calculation ──────────────────────────────────────────

  describe('calculatePositionPnL', () => {
    it('calculates profit on YES position when price goes up', () => {
      const position = makePosition({ side: 'yes', quantity: 10, avgPrice: 40 });
      const pnl = service.calculatePositionPnL(position, 'TICKER-A', 60);

      expect(pnl.unrealizedPnl).toBe(200); // (60 - 40) * 10
      expect(pnl.unrealizedPnlPct).toBe(50); // 200 / (40*10) * 100
      expect(pnl.side).toBe('yes');
      expect(pnl.avgEntryPrice).toBe(40);
      expect(pnl.currentPrice).toBe(60);
    });

    it('calculates loss on YES position when price goes down', () => {
      const position = makePosition({ side: 'yes', quantity: 5, avgPrice: 70 });
      const pnl = service.calculatePositionPnL(position, 'TICKER-A', 50);

      expect(pnl.unrealizedPnl).toBe(-100); // (50 - 70) * 5
      expect(pnl.unrealizedPnlPct).toBeCloseTo(-28.57, 1); // -100 / 350 * 100
    });

    it('calculates profit on NO position when price goes down', () => {
      const position = makePosition({ side: 'no', quantity: 10, avgPrice: 60 });
      const pnl = service.calculatePositionPnL(position, 'TICKER-A', 40);

      expect(pnl.unrealizedPnl).toBe(200); // (60 - 40) * 10
      expect(pnl.unrealizedPnlPct).toBeCloseTo(33.33, 1);
    });

    it('calculates loss on NO position when price goes up', () => {
      const position = makePosition({ side: 'no', quantity: 8, avgPrice: 30 });
      const pnl = service.calculatePositionPnL(position, 'TICKER-A', 50);

      expect(pnl.unrealizedPnl).toBe(-160); // (30 - 50) * 8
    });

    it('returns zero P&L when price equals entry', () => {
      const position = makePosition({ side: 'yes', quantity: 10, avgPrice: 50 });
      const pnl = service.calculatePositionPnL(position, 'TICKER-A', 50);

      expect(pnl.unrealizedPnl).toBe(0);
      expect(pnl.unrealizedPnlPct).toBe(0);
    });

    it('returns zero pct when cost basis is zero', () => {
      const position = makePosition({ side: 'yes', quantity: 10, avgPrice: 0 });
      const pnl = service.calculatePositionPnL(position, 'TICKER-A', 50);

      expect(pnl.unrealizedPnl).toBe(500);
      expect(pnl.unrealizedPnlPct).toBe(0); // costBasis = 0 → pct = 0
    });

    it('handles zero quantity', () => {
      const position = makePosition({ side: 'yes', quantity: 0, avgPrice: 50 });
      const pnl = service.calculatePositionPnL(position, 'TICKER-A', 60);

      expect(pnl.unrealizedPnl).toBe(0);
      expect(pnl.quantity).toBe(0);
    });

    it('populates all fields correctly', () => {
      const position = makePosition({
        marketId: 'MKT-1',
        side: 'yes',
        quantity: 20,
        avgPrice: 45,
      });
      const pnl = service.calculatePositionPnL(position, 'TICKER-X', 55);

      expect(pnl.marketId).toBe('MKT-1');
      expect(pnl.ticker).toBe('TICKER-X');
      expect(pnl.side).toBe('yes');
      expect(pnl.quantity).toBe(20);
      expect(pnl.avgEntryPrice).toBe(45);
      expect(pnl.currentPrice).toBe(55);
      expect(pnl.unrealizedPnl).toBe(200);
    });
  });

  // ─── getCurrentPrice ───────────────────────────────────────────────

  describe('getCurrentPrice', () => {
    const marketPrice: MarketPrice = {
      ticker: 'T',
      yesBid: 40,
      yesAsk: 50,
      noBid: 50,
      noAsk: 60,
      lastPrice: 44,
    };

    it('returns mid price for YES by default', () => {
      const price = service.getCurrentPrice(marketPrice, 'yes');
      expect(price).toBe(45); // (40 + 50) / 2
    });

    it('returns mid price for NO by default', () => {
      const price = service.getCurrentPrice(marketPrice, 'no');
      expect(price).toBe(55); // (50 + 60) / 2
    });

    it('returns bid price for YES when configured', () => {
      const { service: bidService } = createUnrealizedPnLService({ priceSource: 'bid' });
      const price = bidService.getCurrentPrice(marketPrice, 'yes');
      expect(price).toBe(40);
    });

    it('returns bid price for NO when configured', () => {
      const { service: bidService } = createUnrealizedPnLService({ priceSource: 'bid' });
      const price = bidService.getCurrentPrice(marketPrice, 'no');
      expect(price).toBe(50);
    });

    it('returns last price regardless of side when configured', () => {
      const { service: lastService } = createUnrealizedPnLService({ priceSource: 'last' });
      expect(lastService.getCurrentPrice(marketPrice, 'yes')).toBe(44);
      expect(lastService.getCurrentPrice(marketPrice, 'no')).toBe(44);
    });
  });

  // ─── refreshAll ────────────────────────────────────────────────────

  describe('refreshAll', () => {
    it('returns empty summary for empty portfolio', async () => {
      const summary = await service.refreshAll();

      expect(summary.positions).toHaveLength(0);
      expect(summary.totalUnrealizedPnl).toBe(0);
      expect(summary.lastUpdated).toBeInstanceOf(Date);
    });

    it('calculates P&L for a single YES position', async () => {
      const pos = makePosition({ marketId: 'TICKER-A', side: 'yes', quantity: 10, avgPrice: 40 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('TICKER-A', 55, 65);

      const summary = await service.refreshAll();

      expect(summary.positions).toHaveLength(1);
      const p = summary.positions[0];
      expect(p.currentPrice).toBe(60); // mid = (55+65)/2
      expect(p.unrealizedPnl).toBe(200); // (60-40)*10
      expect(summary.totalUnrealizedPnl).toBe(200);
    });

    it('calculates P&L for a single NO position', async () => {
      const pos = makePosition({ marketId: 'TICKER-B', side: 'no', quantity: 5, avgPrice: 60 });
      await storage.upsertPosition(pos);
      // yesBid=40, yesAsk=50 → noBid=50, noAsk=60 → noMid=55
      priceProvider.setPriceSimple('TICKER-B', 40, 50);

      const summary = await service.refreshAll();

      expect(summary.positions).toHaveLength(1);
      const p = summary.positions[0];
      expect(p.currentPrice).toBe(55); // noMid = (50+60)/2
      expect(p.unrealizedPnl).toBe(25); // (60-55)*5
    });

    it('aggregates multiple positions', async () => {
      const pos1 = makePosition({ marketId: 'A', side: 'yes', quantity: 10, avgPrice: 40 });
      const pos2 = makePosition({ marketId: 'B', side: 'yes', quantity: 5, avgPrice: 70 });
      await storage.upsertPosition(pos1);
      await storage.upsertPosition(pos2);
      priceProvider.setPriceSimple('A', 58, 62); // mid=60, pnl=(60-40)*10=200
      priceProvider.setPriceSimple('B', 48, 52); // mid=50, pnl=(50-70)*5=-100

      const summary = await service.refreshAll();

      expect(summary.positions).toHaveLength(2);
      expect(summary.totalUnrealizedPnl).toBe(100); // 200 + (-100)
    });

    it('skips positions with zero quantity', async () => {
      const pos = makePosition({ marketId: 'ZERO', side: 'yes', quantity: 0, avgPrice: 50 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('ZERO', 50, 60);

      const summary = await service.refreshAll();

      expect(summary.positions).toHaveLength(0);
      expect(summary.totalUnrealizedPnl).toBe(0);
    });

    it('skips positions with no market price available', async () => {
      const pos = makePosition({ marketId: 'MISSING', side: 'yes', quantity: 10, avgPrice: 50 });
      await storage.upsertPosition(pos);
      // No price set for 'MISSING'

      const summary = await service.refreshAll();

      expect(summary.positions).toHaveLength(0);
      expect(summary.totalUnrealizedPnl).toBe(0);
    });

    it('updates position.unrealizedPnl in storage', async () => {
      const pos = makePosition({ marketId: 'UPD', side: 'yes', quantity: 10, avgPrice: 40 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('UPD', 58, 62); // mid=60

      await service.refreshAll();

      const stored = await storage.getPosition('UPD', 'yes');
      expect(stored!.unrealizedPnl).toBe(200);
    });

    it('caches summary as lastSummary', async () => {
      expect(service.getLastSummary()).toBeNull();

      const pos = makePosition({ marketId: 'CACHE', side: 'yes', quantity: 10, avgPrice: 50 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('CACHE', 55, 65);

      const summary = await service.refreshAll();

      expect(service.getLastSummary()).toBe(summary);
      expect(service.getPositionPnLs()).toEqual(summary.positions);
    });
  });

  // ─── refreshPosition ──────────────────────────────────────────────

  describe('refreshPosition', () => {
    it('refreshes a single position', async () => {
      const pos = makePosition({ marketId: 'SINGLE', side: 'yes', quantity: 10, avgPrice: 40 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('SINGLE', 58, 62);

      const pnl = await service.refreshPosition('SINGLE', 'yes');

      expect(pnl).not.toBeNull();
      expect(pnl!.unrealizedPnl).toBe(200);
    });

    it('returns null for missing position', async () => {
      const pnl = await service.refreshPosition('NONEXISTENT', 'yes');
      expect(pnl).toBeNull();
    });

    it('returns null for zero quantity position', async () => {
      const pos = makePosition({ marketId: 'ZERO', side: 'yes', quantity: 0, avgPrice: 50 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('ZERO', 50, 60);

      const pnl = await service.refreshPosition('ZERO', 'yes');
      expect(pnl).toBeNull();
    });

    it('returns null when price is unavailable', async () => {
      const pos = makePosition({ marketId: 'NOPRICE', side: 'yes', quantity: 10, avgPrice: 50 });
      await storage.upsertPosition(pos);

      const pnl = await service.refreshPosition('NOPRICE', 'yes');
      expect(pnl).toBeNull();
    });

    it('updates storage for single position', async () => {
      const pos = makePosition({ marketId: 'UPD2', side: 'no', quantity: 5, avgPrice: 60 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('UPD2', 40, 50); // noMid=55

      await service.refreshPosition('UPD2', 'no');

      const stored = await storage.getPosition('UPD2', 'no');
      expect(stored!.unrealizedPnl).toBe(25); // (60-55)*5
    });
  });

  // ─── Price source config ──────────────────────────────────────────

  describe('price source configuration', () => {
    it('uses bid prices when configured', async () => {
      const { service: bidService, storage: bidStorage, priceProvider: bidPP } =
        createUnrealizedPnLService({ priceSource: 'bid' });

      const pos = makePosition({ marketId: 'BID', side: 'yes', quantity: 10, avgPrice: 40 });
      await bidStorage.upsertPosition(pos);
      bidPP.setPriceSimple('BID', 55, 65); // yesBid=55

      const summary = await bidService.refreshAll();

      expect(summary.positions[0].currentPrice).toBe(55);
      expect(summary.positions[0].unrealizedPnl).toBe(150); // (55-40)*10
    });

    it('uses last price when configured', async () => {
      const { service: lastService, storage: lastStorage, priceProvider: lastPP } =
        createUnrealizedPnLService({ priceSource: 'last' });

      const pos = makePosition({ marketId: 'LAST', side: 'yes', quantity: 10, avgPrice: 40 });
      await lastStorage.upsertPosition(pos);
      lastPP.setPriceSimple('LAST', 55, 65, 58); // lastPrice=58

      const summary = await lastService.refreshAll();

      expect(summary.positions[0].currentPrice).toBe(58);
      expect(summary.positions[0].unrealizedPnl).toBe(180); // (58-40)*10
    });

    it('defaults to mid price', async () => {
      const pos = makePosition({ marketId: 'MID', side: 'yes', quantity: 10, avgPrice: 40 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('MID', 55, 65); // mid=60

      const summary = await service.refreshAll();

      expect(summary.positions[0].currentPrice).toBe(60);
    });
  });

  // ─── Event emission ───────────────────────────────────────────────

  describe('event emission', () => {
    it('emits onPnLRefreshed after refreshAll', async () => {
      const onPnLRefreshed = vi.fn();
      const { service: evtService, storage: evtStorage, priceProvider: evtPP } =
        createUnrealizedPnLService({}, { onPnLRefreshed });

      const pos = makePosition({ marketId: 'EVT', side: 'yes', quantity: 10, avgPrice: 50 });
      await evtStorage.upsertPosition(pos);
      evtPP.setPriceSimple('EVT', 55, 65);

      await evtService.refreshAll();

      expect(onPnLRefreshed).toHaveBeenCalledTimes(1);
      const summary: UnrealizedPnLSummary = onPnLRefreshed.mock.calls[0][0];
      expect(summary.positions).toHaveLength(1);
      expect(summary.totalUnrealizedPnl).toBe(100); // (60-50)*10
    });

    it('emits onPnLRefreshed for empty portfolio', async () => {
      const onPnLRefreshed = vi.fn();
      const { service: evtService } = createUnrealizedPnLService({}, { onPnLRefreshed });

      await evtService.refreshAll();

      expect(onPnLRefreshed).toHaveBeenCalledTimes(1);
      expect(onPnLRefreshed.mock.calls[0][0].totalUnrealizedPnl).toBe(0);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles multiple positions in same market (yes and no)', async () => {
      const yesPos = makePosition({ marketId: 'DUAL', side: 'yes', quantity: 10, avgPrice: 40 });
      const noPos = makePosition({ marketId: 'DUAL', side: 'no', quantity: 5, avgPrice: 60 });
      await storage.upsertPosition(yesPos);
      await storage.upsertPosition(noPos);
      priceProvider.setPriceSimple('DUAL', 55, 65); // yesMid=60, noMid=(35+45)/2=40
      // Actually: noBid = 100-65=35, noAsk = 100-55=45, noMid=40

      const summary = await service.refreshAll();

      expect(summary.positions).toHaveLength(2);
      const yesPnl = summary.positions.find((p) => p.side === 'yes')!;
      const noPnl = summary.positions.find((p) => p.side === 'no')!;
      expect(yesPnl.unrealizedPnl).toBe(200); // (60-40)*10
      expect(noPnl.unrealizedPnl).toBe(100); // (60-40)*5
      expect(summary.totalUnrealizedPnl).toBe(300);
    });

    it('getPositionPnLs returns empty before any refresh', () => {
      expect(service.getPositionPnLs()).toEqual([]);
    });

    it('getLastSummary returns null before any refresh', () => {
      expect(service.getLastSummary()).toBeNull();
    });

    it('handles large position values without overflow', async () => {
      const pos = makePosition({ marketId: 'BIG', side: 'yes', quantity: 100000, avgPrice: 50 });
      await storage.upsertPosition(pos);
      priceProvider.setPriceSimple('BIG', 98, 100); // mid=99

      const summary = await service.refreshAll();

      expect(summary.positions[0].unrealizedPnl).toBe(4900000); // (99-50)*100000
    });
  });
});
