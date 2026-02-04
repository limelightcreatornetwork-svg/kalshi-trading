import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArbitrageService } from '../services/ArbitrageService';
import type { Market } from '../lib/kalshi';

// Hoisted mock storage and instance
const { mockOpportunities, mockScans, mockAlertConfig, mockPrismaInstance } = vi.hoisted(() => {
  const mockOpportunities: Map<string, any> = new Map();
  const mockScans: any[] = [];
  const mockAlertConfig = { isActive: true, alertEnabled: true, minProfitCents: 1, minProfitPercent: 1 };
  
  const mockPrismaInstance = {
    arbitrageOpportunity: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const [, opp] of mockOpportunities) {
          if (where.marketTicker === opp.marketTicker && where.status === opp.status) {
            return opp;
          }
        }
        return null;
      }),
      findMany: vi.fn(async ({ where, orderBy, take }: any) => {
        let results = Array.from(mockOpportunities.values());
        if (where?.status) {
          results = results.filter(o => o.status === where.status);
        }
        if (where?.type) {
          results = results.filter(o => o.type === where.type);
        }
        if (where?.alertSent === false) {
          results = results.filter(o => !o.alertSent);
        }
        if (where?.profitCents?.gte) {
          results = results.filter(o => Number(o.profitCents) >= where.profitCents.gte);
        }
        if (where?.profitPercent?.gte) {
          results = results.filter(o => Number(o.profitPercent) >= where.profitPercent.gte);
        }
        if (orderBy?.profitCents === 'desc') {
          results.sort((a, b) => Number(b.profitCents) - Number(a.profitCents));
        }
        if (orderBy?.detectedAt === 'desc') {
          results.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
        }
        if (take) {
          results = results.slice(0, take);
        }
        return results;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const opp = mockOpportunities.get(where.id);
        if (!opp) return null;
        // Add default date fields if missing
        return {
          ...opp,
          detectedAt: opp.detectedAt || new Date(),
          lastSeenAt: opp.lastSeenAt || new Date(),
        };
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `opp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const created = {
          id,
          ...data,
          detectedAt: new Date(),
          lastSeenAt: new Date(),
          alertSent: false,
        };
        mockOpportunities.set(id, created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const opp = mockOpportunities.get(where.id);
        if (!opp) return null;
        const updated = { ...opp, ...data };
        mockOpportunities.set(where.id, updated);
        return updated;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [id, opp] of mockOpportunities) {
          let match = true;
          if (where.status && opp.status !== where.status) match = false;
          if (where.lastSeenAt?.lt && new Date(opp.lastSeenAt) >= where.lastSeenAt.lt) match = false;
          if (where.id?.notIn && where.id.notIn.includes(id)) match = false;
          if (where.id?.in && !where.id.in.includes(id)) match = false;
          if (match) {
            mockOpportunities.set(id, { ...opp, ...data });
            count++;
          }
        }
        return { count };
      }),
      aggregate: vi.fn(async ({ where }: any) => {
        let results = Array.from(mockOpportunities.values());
        if (where?.status) {
          results = results.filter(o => o.status === where.status);
        }
        const profitSum = results.reduce((sum, o) => sum + Number(o.profitCents || 0), 0);
        const actualProfitSum = results.reduce((sum, o) => sum + Number(o.actualProfit || 0), 0);
        return {
          _count: results.length,
          _avg: { profitCents: results.length > 0 ? profitSum / results.length : null },
          _sum: { profitCents: profitSum, actualProfit: actualProfitSum },
        };
      }),
    },
    arbitrageScan: {
      create: vi.fn(async ({ data }: any) => {
        const scan = { id: `scan-${Date.now()}`, ...data };
        mockScans.push(scan);
        return scan;
      }),
      aggregate: vi.fn(async () => {
        const oppFound = mockScans.reduce((sum, s) => sum + (s.opportunitiesFound || 0), 0);
        const profitPotential = mockScans.reduce((sum, s) => sum + (s.totalProfitPotential || 0), 0);
        return {
          _count: mockScans.length,
          _sum: { opportunitiesFound: oppFound, totalProfitPotential: profitPotential },
        };
      }),
    },
    arbitrageAlertConfig: {
      findFirst: vi.fn(async () => mockAlertConfig),
    },
  };
  
  return { mockOpportunities, mockScans, mockAlertConfig, mockPrismaInstance };
});

vi.mock('../lib/prisma', () => ({
  default: mockPrismaInstance,
  prisma: mockPrismaInstance,
  requirePrisma: () => mockPrismaInstance,
  isPrismaAvailable: () => true,
}))

// Mock the Kalshi API
vi.mock('../lib/kalshi', () => ({
  getMarkets: vi.fn(),
  createOrder: vi.fn(),
}));

import { getMarkets, createOrder } from '../lib/kalshi';

describe('ArbitrageService - Database Methods', () => {
  let service: ArbitrageService;

  beforeEach(() => {
    service = new ArbitrageService();
    mockOpportunities.clear();
    mockScans.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // scanForOpportunities
  // =========================================================================
  describe('scanForOpportunities', () => {
    it('should scan markets and find arbitrage opportunities', async () => {
      const mockMarkets: Market[] = [
        {
          ticker: 'ARB-MARKET-1',
          event_ticker: 'EVENT1',
          market_type: 'binary',
          title: 'Arbitrage Market 1',
          subtitle: '',
          yes_sub_title: 'Yes',
          no_sub_title: 'No',
          status: 'open',
          yes_bid: 45,
          yes_ask: 46,
          no_bid: 45,
          no_ask: 48,
          last_price: 50,
          volume: 1000,
          volume_24h: 500,
          open_interest: 200,
          close_time: '2026-03-01',
          expiration_time: '2026-03-01',
        },
        {
          ticker: 'NORMAL-MARKET',
          event_ticker: 'EVENT2',
          market_type: 'binary',
          title: 'Normal Market',
          subtitle: '',
          yes_sub_title: 'Yes',
          no_sub_title: 'No',
          status: 'open',
          yes_bid: 50,
          yes_ask: 52,
          no_bid: 48,
          no_ask: 50,
          last_price: 50,
          volume: 1000,
          volume_24h: 500,
          open_interest: 200,
          close_time: '2026-03-01',
          expiration_time: '2026-03-01',
        },
      ];

      vi.mocked(getMarkets).mockResolvedValueOnce({ markets: mockMarkets, cursor: undefined });

      const result = await service.scanForOpportunities();

      expect(result.marketsScanned).toBe(2);
      expect(result.opportunitiesFound).toBe(1);
      expect(result.opportunities[0].marketTicker).toBe('ARB-MARKET-1');
      expect(result.scanId).toBeDefined();
    });

    it('should paginate through all markets', async () => {
      const market1: Market = {
        ticker: 'MARKET-1',
        event_ticker: 'EVENT1',
        market_type: 'binary',
        title: 'Market 1',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 45,
        yes_ask: 47,
        no_bid: 45,
        no_ask: 47,
        last_price: 50,
        volume: 1000,
        volume_24h: 500,
        open_interest: 200,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      const market2: Market = {
        ticker: 'MARKET-2',
        event_ticker: 'EVENT2',
        market_type: 'binary',
        title: 'Market 2',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 44,
        yes_ask: 46,
        no_bid: 44,
        no_ask: 46,
        last_price: 50,
        volume: 1000,
        volume_24h: 500,
        open_interest: 200,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      vi.mocked(getMarkets)
        .mockResolvedValueOnce({ markets: [market1], cursor: 'cursor-1' })
        .mockResolvedValueOnce({ markets: [market2], cursor: undefined });

      const result = await service.scanForOpportunities();

      expect(getMarkets).toHaveBeenCalledTimes(2);
      expect(result.marketsScanned).toBe(2);
      expect(result.opportunitiesFound).toBe(2);
    });

    it('should calculate total profit potential correctly', async () => {
      const markets: Market[] = [
        {
          ticker: 'ARB-1',
          event_ticker: 'EVENT1',
          market_type: 'binary',
          title: 'Arb 1',
          subtitle: '',
          yes_sub_title: 'Yes',
          no_sub_title: 'No',
          status: 'open',
          yes_bid: 44,
          yes_ask: 45,
          no_bid: 44,
          no_ask: 45,
          last_price: 50,
          volume: 1000,
          volume_24h: 500,
          open_interest: 200,
          close_time: '2026-03-01',
          expiration_time: '2026-03-01',
        },
        {
          ticker: 'ARB-2',
          event_ticker: 'EVENT2',
          market_type: 'binary',
          title: 'Arb 2',
          subtitle: '',
          yes_sub_title: 'Yes',
          no_sub_title: 'No',
          status: 'open',
          yes_bid: 46,
          yes_ask: 47,
          no_bid: 46,
          no_ask: 47,
          last_price: 50,
          volume: 1000,
          volume_24h: 500,
          open_interest: 200,
          close_time: '2026-03-01',
          expiration_time: '2026-03-01',
        },
      ];

      vi.mocked(getMarkets).mockResolvedValueOnce({ markets, cursor: undefined });

      const result = await service.scanForOpportunities();

      // ARB-1: 100 - 90 = 10 cents profit
      // ARB-2: 100 - 94 = 6 cents profit
      expect(result.totalProfitPotential).toBe(16);
    });

    it('should record scan in database', async () => {
      vi.mocked(getMarkets).mockResolvedValueOnce({ markets: [], cursor: undefined });

      await service.scanForOpportunities();

      expect(mockScans.length).toBe(1);
      expect(mockScans[0].marketsScanned).toBe(0);
      expect(mockScans[0].completedAt).toBeDefined();
    });

    it('should sort opportunities by profit descending', async () => {
      const markets: Market[] = [
        {
          ticker: 'LOW-PROFIT',
          event_ticker: 'EVENT1',
          market_type: 'binary',
          title: 'Low Profit',
          subtitle: '',
          yes_sub_title: 'Yes',
          no_sub_title: 'No',
          status: 'open',
          yes_bid: 48,
          yes_ask: 49,
          no_bid: 48,
          no_ask: 49,
          last_price: 50,
          volume: 1000,
          volume_24h: 500,
          open_interest: 200,
          close_time: '2026-03-01',
          expiration_time: '2026-03-01',
        },
        {
          ticker: 'HIGH-PROFIT',
          event_ticker: 'EVENT2',
          market_type: 'binary',
          title: 'High Profit',
          subtitle: '',
          yes_sub_title: 'Yes',
          no_sub_title: 'No',
          status: 'open',
          yes_bid: 40,
          yes_ask: 42,
          no_bid: 40,
          no_ask: 42,
          last_price: 50,
          volume: 1000,
          volume_24h: 500,
          open_interest: 200,
          close_time: '2026-03-01',
          expiration_time: '2026-03-01',
        },
      ];

      vi.mocked(getMarkets).mockResolvedValueOnce({ markets, cursor: undefined });

      const result = await service.scanForOpportunities();

      expect(result.opportunities[0].marketTicker).toBe('HIGH-PROFIT');
      expect(result.opportunities[1].marketTicker).toBe('LOW-PROFIT');
    });
  });

  // =========================================================================
  // getActiveOpportunities
  // =========================================================================
  describe('getActiveOpportunities', () => {
    it('should return empty array when no active opportunities', async () => {
      const result = await service.getActiveOpportunities();
      expect(result).toEqual([]);
    });

    it('should return only ACTIVE opportunities', async () => {
      // Add some mock opportunities
      mockOpportunities.set('opp-1', {
        id: 'opp-1',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'ACTIVE-MKT',
        marketTitle: 'Active Market',
        yesBid: 45,
        yesAsk: 46,
        noBid: 45,
        noAsk: 48,
        totalCost: 94,
        guaranteedPayout: 100,
        profitCents: 6,
        profitPercent: 6.38,
        alertSent: false,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });
      mockOpportunities.set('opp-2', {
        id: 'opp-2',
        type: 'SINGLE_MARKET',
        status: 'EXPIRED',
        marketTicker: 'EXPIRED-MKT',
        marketTitle: 'Expired Market',
        yesBid: 45,
        yesAsk: 46,
        noBid: 45,
        noAsk: 48,
        totalCost: 94,
        guaranteedPayout: 100,
        profitCents: 6,
        profitPercent: 6.38,
        alertSent: false,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });

      const result = await service.getActiveOpportunities();

      expect(result.length).toBe(1);
      expect(result[0].marketTicker).toBe('ACTIVE-MKT');
    });

    it('should sort by profitCents descending', async () => {
      mockOpportunities.set('opp-1', {
        id: 'opp-1',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'LOW',
        marketTitle: 'Low Profit',
        profitCents: 2,
        profitPercent: 2.1,
        yesBid: 0,
        yesAsk: 49,
        noBid: 0,
        noAsk: 49,
        totalCost: 98,
        guaranteedPayout: 100,
        alertSent: false,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });
      mockOpportunities.set('opp-2', {
        id: 'opp-2',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'HIGH',
        marketTitle: 'High Profit',
        profitCents: 10,
        profitPercent: 11.1,
        yesBid: 0,
        yesAsk: 45,
        noBid: 0,
        noAsk: 45,
        totalCost: 90,
        guaranteedPayout: 100,
        alertSent: false,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });

      const result = await service.getActiveOpportunities();

      expect(result[0].marketTicker).toBe('HIGH');
      expect(result[1].marketTicker).toBe('LOW');
    });
  });

  // =========================================================================
  // getOpportunityHistory
  // =========================================================================
  describe('getOpportunityHistory', () => {
    beforeEach(() => {
      // Add test data
      mockOpportunities.set('opp-1', {
        id: 'opp-1',
        type: 'SINGLE_MARKET',
        status: 'EXECUTED',
        marketTicker: 'EXEC-MKT',
        profitCents: 5,
        profitPercent: 5.5,
        yesBid: 0,
        yesAsk: 47,
        noBid: 0,
        noAsk: 48,
        totalCost: 95,
        guaranteedPayout: 100,
        alertSent: false,
        detectedAt: new Date('2026-01-15'),
        lastSeenAt: new Date(),
      });
      mockOpportunities.set('opp-2', {
        id: 'opp-2',
        type: 'CROSS_MARKET',
        status: 'EXPIRED',
        marketTicker: 'EXPIRED-MKT',
        profitCents: 3,
        profitPercent: 3.2,
        yesBid: 0,
        yesAsk: 48,
        noBid: 0,
        noAsk: 49,
        totalCost: 97,
        guaranteedPayout: 100,
        alertSent: false,
        detectedAt: new Date('2026-01-14'),
        lastSeenAt: new Date(),
      });
      mockOpportunities.set('opp-3', {
        id: 'opp-3',
        type: 'SINGLE_MARKET',
        status: 'MISSED',
        marketTicker: 'MISSED-MKT',
        profitCents: 8,
        profitPercent: 8.7,
        yesBid: 0,
        yesAsk: 46,
        noBid: 0,
        noAsk: 46,
        totalCost: 92,
        guaranteedPayout: 100,
        alertSent: false,
        detectedAt: new Date('2026-01-13'),
        lastSeenAt: new Date(),
      });
    });

    it('should return all history when no filters', async () => {
      const result = await service.getOpportunityHistory();
      expect(result.length).toBe(3);
    });

    it('should filter by type', async () => {
      const result = await service.getOpportunityHistory({ type: 'SINGLE_MARKET' });
      expect(result.length).toBe(2);
      expect(result.every(o => o.type === 'SINGLE_MARKET')).toBe(true);
    });

    it('should filter by status', async () => {
      const result = await service.getOpportunityHistory({ status: 'EXECUTED' });
      expect(result.length).toBe(1);
      expect(result[0].status).toBe('EXECUTED');
    });

    it('should filter by minimum profit', async () => {
      const result = await service.getOpportunityHistory({ minProfitCents: 5 });
      expect(result.length).toBe(2);
      expect(result.every(o => o.profitCents >= 5)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const result = await service.getOpportunityHistory({ limit: 2 });
      expect(result.length).toBe(2);
    });

    it('should combine filters', async () => {
      const result = await service.getOpportunityHistory({
        type: 'SINGLE_MARKET',
        minProfitCents: 5,
      });
      expect(result.length).toBe(2);
    });
  });

  // =========================================================================
  // executeOpportunity
  // =========================================================================
  describe('executeOpportunity', () => {
    it('should return error when opportunity not found', async () => {
      const result = await service.executeOpportunity({
        opportunityId: 'non-existent',
        contracts: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Opportunity not found');
    });

    it('should return error when opportunity is not ACTIVE', async () => {
      mockOpportunities.set('expired-opp', {
        id: 'expired-opp',
        type: 'SINGLE_MARKET',
        status: 'EXPIRED',
        marketTicker: 'TEST-MKT',
        yesAsk: 46,
        noAsk: 48,
        profitCents: 6,
      });

      const result = await service.executeOpportunity({
        opportunityId: 'expired-opp',
        contracts: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Opportunity is EXPIRED');
    });

    it('should execute opportunity successfully', async () => {
      mockOpportunities.set('active-opp', {
        id: 'active-opp',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'EXEC-MKT',
        yesAsk: 46,
        noAsk: 48,
        profitCents: 6,
        profitPercent: 6.38,
      });

      vi.mocked(createOrder)
        .mockResolvedValueOnce({ order: { order_id: 'yes-order-123' } } as any)
        .mockResolvedValueOnce({ order: { order_id: 'no-order-456' } } as any);

      const result = await service.executeOpportunity({
        opportunityId: 'active-opp',
        contracts: 10,
      });

      expect(result.success).toBe(true);
      expect(result.yesOrderId).toBe('yes-order-123');
      expect(result.noOrderId).toBe('no-order-456');
      expect(result.yesPrice).toBe(46);
      expect(result.noPrice).toBe(48);
      expect(result.totalCost).toBe(940); // (46 + 48) * 10
      expect(result.expectedProfit).toBe(60); // 6 * 10
    });

    it('should update opportunity status to EXECUTED on success', async () => {
      mockOpportunities.set('active-opp', {
        id: 'active-opp',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'EXEC-MKT',
        yesAsk: 46,
        noAsk: 48,
        profitCents: 6,
        profitPercent: 6.38,
      });

      vi.mocked(createOrder)
        .mockResolvedValueOnce({ order: { order_id: 'yes-order' } } as any)
        .mockResolvedValueOnce({ order: { order_id: 'no-order' } } as any);

      await service.executeOpportunity({
        opportunityId: 'active-opp',
        contracts: 5,
      });

      const updated = mockOpportunities.get('active-opp');
      expect(updated.status).toBe('EXECUTED');
      expect(updated.executedContracts).toBe(5);
      expect(updated.actualProfit).toBe(30); // 6 * 5
    });

    it('should mark as MISSED on execution failure', async () => {
      mockOpportunities.set('active-opp', {
        id: 'active-opp',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'EXEC-MKT',
        yesAsk: 46,
        noAsk: 48,
        profitCents: 6,
      });

      vi.mocked(createOrder).mockRejectedValueOnce(new Error('Order failed'));

      const result = await service.executeOpportunity({
        opportunityId: 'active-opp',
        contracts: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Order failed');

      const updated = mockOpportunities.get('active-opp');
      expect(updated.status).toBe('MISSED');
    });
  });

  // =========================================================================
  // getScanStats
  // =========================================================================
  describe('getScanStats', () => {
    it('should return zero stats when no data', async () => {
      const stats = await service.getScanStats();

      expect(stats.totalScans).toBe(0);
      expect(stats.totalOpportunities).toBe(0);
      expect(stats.avgProfitCents).toBe(0);
      expect(stats.executedCount).toBe(0);
      expect(stats.totalActualProfit).toBe(0);
    });

    it('should aggregate stats correctly', async () => {
      // Add scan data
      mockScans.push({ opportunitiesFound: 5, totalProfitPotential: 100 });
      mockScans.push({ opportunitiesFound: 3, totalProfitPotential: 50 });

      // Add opportunities
      mockOpportunities.set('opp-1', {
        id: 'opp-1',
        status: 'EXECUTED',
        profitCents: 10,
        actualProfit: 50,
      });
      mockOpportunities.set('opp-2', {
        id: 'opp-2',
        status: 'EXECUTED',
        profitCents: 8,
        actualProfit: 40,
      });
      mockOpportunities.set('opp-3', {
        id: 'opp-3',
        status: 'EXPIRED',
        profitCents: 5,
        actualProfit: 0,
      });

      const stats = await service.getScanStats();

      expect(stats.totalScans).toBe(2);
      expect(stats.totalOpportunities).toBe(3);
      expect(stats.avgProfitCents).toBeCloseTo(7.67, 1);
      expect(stats.totalProfitPotential).toBe(23);
      expect(stats.executedCount).toBe(2);
      expect(stats.totalActualProfit).toBe(90);
    });
  });

  // =========================================================================
  // checkAlerts
  // =========================================================================
  describe('checkAlerts', () => {
    it('should return empty array when alerts disabled', async () => {
      // Override mock to return disabled config
      const { requirePrisma } = await import('../lib/prisma');
      vi.mocked(requirePrisma().arbitrageAlertConfig.findFirst).mockResolvedValueOnce({
        isActive: false,
        alertEnabled: false,
      });

      const alerts = await service.checkAlerts();
      expect(alerts).toEqual([]);
    });

    it('should return opportunities meeting alert criteria', async () => {
      // Add opportunities
      mockOpportunities.set('alert-opp', {
        id: 'alert-opp',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'ALERT-MKT',
        profitCents: 5,
        profitPercent: 5.5,
        alertSent: false,
        yesBid: 0,
        yesAsk: 47,
        noBid: 0,
        noAsk: 48,
        totalCost: 95,
        guaranteedPayout: 100,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });
      mockOpportunities.set('low-profit-opp', {
        id: 'low-profit-opp',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'LOW-MKT',
        profitCents: 0.3,
        profitPercent: 0.3,
        alertSent: false,
        yesBid: 0,
        yesAsk: 49.85,
        noBid: 0,
        noAsk: 49.85,
        totalCost: 99.7,
        guaranteedPayout: 100,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });

      const alerts = await service.checkAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].marketTicker).toBe('ALERT-MKT');
    });

    it('should not return already-alerted opportunities', async () => {
      mockOpportunities.set('already-alerted', {
        id: 'already-alerted',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'ALERTED-MKT',
        profitCents: 10,
        profitPercent: 11,
        alertSent: true,
        alertSentAt: new Date(),
        yesBid: 0,
        yesAsk: 45,
        noBid: 0,
        noAsk: 45,
        totalCost: 90,
        guaranteedPayout: 100,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });

      const alerts = await service.checkAlerts();
      expect(alerts.length).toBe(0);
    });

    it('should mark alerts as sent', async () => {
      mockOpportunities.set('new-alert', {
        id: 'new-alert',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'NEW-ALERT-MKT',
        profitCents: 5,
        profitPercent: 5.5,
        alertSent: false,
        yesBid: 0,
        yesAsk: 47,
        noBid: 0,
        noAsk: 48,
        totalCost: 95,
        guaranteedPayout: 100,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });

      await service.checkAlerts();

      const updated = mockOpportunities.get('new-alert');
      expect(updated.alertSent).toBe(true);
      expect(updated.alertSentAt).toBeDefined();
    });
  });

  // =========================================================================
  // mapDbToOpportunity (tested through public methods)
  // =========================================================================
  describe('mapDbToOpportunity', () => {
    it('should correctly map all fields including optional ones', async () => {
      mockOpportunities.set('full-opp', {
        id: 'full-opp',
        type: 'CROSS_MARKET',
        status: 'EXECUTED',
        marketTicker: 'MKT-1',
        marketTitle: 'Market 1',
        relatedMarketTicker: 'MKT-2',
        relatedMarketTitle: 'Market 2',
        yesBid: 44,
        yesAsk: 45,
        noBid: 44,
        noAsk: 45,
        totalCost: 90,
        guaranteedPayout: 100,
        profitCents: 10,
        profitPercent: 11.11,
        maxContracts: 100,
        estimatedMaxProfit: 1000,
        executedAt: new Date('2026-01-15T10:00:00Z'),
        executedContracts: 50,
        actualProfit: 500,
        alertSent: true,
        alertSentAt: new Date('2026-01-15T09:55:00Z'),
        detectedAt: new Date('2026-01-15T09:50:00Z'),
        lastSeenAt: new Date('2026-01-15T10:00:00Z'),
        expiredAt: null,
      });

      const result = await service.getActiveOpportunities();
      // Won't find it since it's EXECUTED, so use history
      const history = await service.getOpportunityHistory({ status: 'EXECUTED' });

      expect(history.length).toBe(1);
      const opp = history[0];

      expect(opp.id).toBe('full-opp');
      expect(opp.type).toBe('CROSS_MARKET');
      expect(opp.relatedMarketTicker).toBe('MKT-2');
      expect(opp.maxContracts).toBe(100);
      expect(opp.executedContracts).toBe(50);
      expect(opp.actualProfit).toBe(500);
      expect(opp.alertSent).toBe(true);
    });

    it('should handle undefined optional fields', async () => {
      mockOpportunities.set('minimal-opp', {
        id: 'minimal-opp',
        type: 'SINGLE_MARKET',
        status: 'ACTIVE',
        marketTicker: 'MIN-MKT',
        marketTitle: 'Minimal',
        yesBid: 45,
        yesAsk: 46,
        noBid: 45,
        noAsk: 48,
        totalCost: 94,
        guaranteedPayout: 100,
        profitCents: 6,
        profitPercent: 6.38,
        alertSent: false,
        detectedAt: new Date(),
        lastSeenAt: new Date(),
      });

      const result = await service.getActiveOpportunities();

      expect(result.length).toBe(1);
      expect(result[0].relatedMarketTicker).toBeUndefined();
      expect(result[0].maxContracts).toBeUndefined();
      expect(result[0].executedAt).toBeUndefined();
      expect(result[0].expiredAt).toBeUndefined();
    });
  });
});
