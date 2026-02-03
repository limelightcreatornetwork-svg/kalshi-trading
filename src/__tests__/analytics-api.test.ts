import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the service module before importing routes
vi.mock('../services/AnalyticsService', async () => {
  const actual = await vi.importActual('../services/AnalyticsService');
  return {
    ...actual,
    // Keep actual implementations but allow mocking
  };
});

// Import route handlers after mocking
import { GET as getHistory, POST as postHistory, analyticsService, snapshotStorage, tradeStorage } from '../app/api/analytics/history/route';
import { GET as getPositions, POST as postPosition, PATCH as patchPosition } from '../app/api/analytics/positions/route';
import { GET as getStats } from '../app/api/analytics/stats/route';

// Helper to create mock NextRequest
function createRequest(url: string, options?: { method?: string; body?: unknown }) {
  const request = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options?.method || 'GET',
    ...(options?.body && { body: JSON.stringify(options.body) }),
    ...(options?.body && { headers: { 'Content-Type': 'application/json' } }),
  });
  return request;
}

describe('Analytics API Endpoints', () => {
  beforeEach(() => {
    snapshotStorage.clear();
    tradeStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // GET /api/analytics/history
  // =========================================================================
  describe('GET /api/analytics/history', () => {
    it('should return empty snapshots when no data', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/history');
      const response = await getHistory(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.snapshots).toEqual([]);
      expect(data.data.count).toBe(0);
    });

    it('should return snapshots with summary', async () => {
      // Create test snapshots
      await analyticsService.createDailySnapshot({
        portfolioValue: 10000,
        cashBalance: 5000,
        positionValue: 5000,
        realizedPnL: 100,
        unrealizedPnL: 50,
        openPositions: 3,
        closedPositions: 0,
      });

      const request = createRequest('http://localhost:3000/api/analytics/history');
      const response = await getHistory(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.snapshots.length).toBe(1);
      expect(data.data.snapshots[0].portfolioValue).toBe(10000);
      expect(data.data.snapshots[0].portfolioValueDollars).toBe('100.00');
    });

    it('should filter by date range', async () => {
      // Create snapshots for multiple days
      vi.setSystemTime(new Date('2026-01-10'));
      await analyticsService.createDailySnapshot({
        portfolioValue: 10000,
        cashBalance: 5000,
        positionValue: 5000,
        realizedPnL: 0,
        unrealizedPnL: 0,
        openPositions: 1,
        closedPositions: 0,
      });

      vi.setSystemTime(new Date('2026-01-15'));
      await analyticsService.createDailySnapshot({
        portfolioValue: 10500,
        cashBalance: 5200,
        positionValue: 5300,
        realizedPnL: 300,
        unrealizedPnL: 200,
        openPositions: 2,
        closedPositions: 1,
      });

      const request = createRequest(
        'http://localhost:3000/api/analytics/history?startDate=2026-01-14&endDate=2026-01-16'
      );
      const response = await getHistory(request);
      const data = await response.json();

      expect(data.data.snapshots.length).toBe(1);
      expect(data.data.snapshots[0].date).toBe('2026-01-15');
    });

    it('should respect limit parameter', async () => {
      // Create multiple snapshots
      for (let i = 10; i <= 15; i++) {
        vi.setSystemTime(new Date(`2026-01-${i}`));
        await analyticsService.createDailySnapshot({
          portfolioValue: 10000 + i * 100,
          cashBalance: 5000,
          positionValue: 5000 + i * 100,
          realizedPnL: 0,
          unrealizedPnL: 0,
          openPositions: 1,
          closedPositions: 0,
        });
      }

      const request = createRequest(
        'http://localhost:3000/api/analytics/history?limit=3'
      );
      const response = await getHistory(request);
      const data = await response.json();

      expect(data.data.snapshots.length).toBe(3);
    });

    it('should format dollar values correctly', async () => {
      await analyticsService.createDailySnapshot({
        portfolioValue: 12345,
        cashBalance: 6789,
        positionValue: 5556,
        realizedPnL: 234,
        unrealizedPnL: -56,
        openPositions: 2,
        closedPositions: 1,
      });

      const request = createRequest('http://localhost:3000/api/analytics/history');
      const response = await getHistory(request);
      const data = await response.json();

      const snapshot = data.data.snapshots[0];
      expect(snapshot.portfolioValueDollars).toBe('123.45');
      expect(snapshot.cashBalanceDollars).toBe('67.89');
      expect(snapshot.realizedPnLDollars).toBe('2.34');
    });
  });

  // =========================================================================
  // POST /api/analytics/history
  // =========================================================================
  describe('POST /api/analytics/history', () => {
    it('should create a daily snapshot', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/history', {
        method: 'POST',
        body: {
          portfolioValue: 10000,
          cashBalance: 5000,
          positionValue: 5000,
          realizedPnL: 100,
          unrealizedPnL: 50,
          openPositions: 3,
          closedPositions: 1,
        },
      });

      const response = await postHistory(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.date).toBe('2026-01-15');
      expect(data.data.portfolioValue).toBe(10000);
    });

    it('should return error for missing required fields', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/history', {
        method: 'POST',
        body: {
          portfolioValue: 10000,
          // Missing cashBalance and positionValue
        },
      });

      const response = await postHistory(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required field');
    });

    it('should use defaults for optional fields', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/history', {
        method: 'POST',
        body: {
          portfolioValue: 10000,
          cashBalance: 5000,
          positionValue: 5000,
          // No realizedPnL, unrealizedPnL, openPositions, closedPositions
        },
      });

      const response = await postHistory(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  // =========================================================================
  // GET /api/analytics/positions
  // =========================================================================
  describe('GET /api/analytics/positions', () => {
    it('should return empty positions when no data', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/positions');
      const response = await getPositions(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.positions).toEqual([]);
      expect(data.data.summary.totalPositions).toBe(0);
    });

    it('should return position performance', async () => {
      // Create a trade
      await analyticsService.recordTradeEntry({
        marketTicker: 'TEST-MARKET',
        marketTitle: 'Test Market',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });

      const request = createRequest('http://localhost:3000/api/analytics/positions');
      const response = await getPositions(request);
      const data = await response.json();

      expect(data.data.positions.length).toBe(1);
      expect(data.data.positions[0].marketTicker).toBe('TEST-MARKET');
      expect(data.data.positions[0].isOpen).toBe(true);
    });

    it('should separate open and closed positions', async () => {
      // Create open trade
      await analyticsService.recordTradeEntry({
        marketTicker: 'OPEN-TRADE',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });

      // Create and close a trade
      const trade = await analyticsService.recordTradeEntry({
        marketTicker: 'CLOSED-TRADE',
        side: 'no',
        entryPrice: 60,
        entryQuantity: 5,
        entryValue: 300,
      });
      await analyticsService.closeTrade(trade.id, {
        exitPrice: 70,
        exitQuantity: 5,
        exitValue: 350,
      });

      const request = createRequest('http://localhost:3000/api/analytics/positions');
      const response = await getPositions(request);
      const data = await response.json();

      expect(data.data.openPositions.length).toBe(1);
      expect(data.data.closedPositions.length).toBe(1);
      expect(data.data.summary.openCount).toBe(1);
      expect(data.data.summary.closedCount).toBe(1);
    });

    it('should exclude closed positions when includeClosed=false', async () => {
      // Create open trade
      await analyticsService.recordTradeEntry({
        marketTicker: 'OPEN-TRADE',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });

      // Create and close a trade
      const trade = await analyticsService.recordTradeEntry({
        marketTicker: 'CLOSED-TRADE',
        side: 'no',
        entryPrice: 60,
        entryQuantity: 5,
        entryValue: 300,
      });
      await analyticsService.closeTrade(trade.id, {
        exitPrice: 70,
        exitQuantity: 5,
        exitValue: 350,
      });

      const request = createRequest(
        'http://localhost:3000/api/analytics/positions?includeClosed=false'
      );
      const response = await getPositions(request);
      const data = await response.json();

      expect(data.data.positions.length).toBe(1);
      expect(data.data.openPositions.length).toBe(1);
      expect(data.data.closedPositions.length).toBe(0);
    });
  });

  // =========================================================================
  // POST /api/analytics/positions
  // =========================================================================
  describe('POST /api/analytics/positions', () => {
    it('should record a new trade', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/positions', {
        method: 'POST',
        body: {
          marketTicker: 'NEW-TRADE',
          marketTitle: 'New Trade Market',
          side: 'yes',
          entryPrice: 55,
          entryQuantity: 20,
          entryValue: 1100,
        },
      });

      const response = await postPosition(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.marketTicker).toBe('NEW-TRADE');
      expect(data.data.side).toBe('yes');
      expect(data.data.direction).toBe('long');
      expect(data.data.result).toBe('OPEN');
    });

    it('should return error for missing required fields', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/positions', {
        method: 'POST',
        body: {
          marketTicker: 'TEST',
          // Missing side, entryPrice, etc.
        },
      });

      const response = await postPosition(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should validate side field', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/positions', {
        method: 'POST',
        body: {
          marketTicker: 'TEST',
          side: 'invalid',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        },
      });

      const response = await postPosition(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Side must be "yes" or "no"');
    });
  });

  // =========================================================================
  // PATCH /api/analytics/positions
  // =========================================================================
  describe('PATCH /api/analytics/positions', () => {
    it('should update trade price', async () => {
      const trade = await analyticsService.recordTradeEntry({
        marketTicker: 'UPDATE-TEST',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });

      const request = createRequest('http://localhost:3000/api/analytics/positions', {
        method: 'PATCH',
        body: {
          tradeId: trade.id,
          action: 'updatePrice',
          currentPrice: 60,
        },
      });

      const response = await patchPosition(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.currentPrice).toBe(60);
      expect(data.data.unrealizedPnL).toBe(100); // (60-50)*10
    });

    it('should close a trade', async () => {
      const trade = await analyticsService.recordTradeEntry({
        marketTicker: 'CLOSE-TEST',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });

      const request = createRequest('http://localhost:3000/api/analytics/positions', {
        method: 'PATCH',
        body: {
          tradeId: trade.id,
          action: 'close',
          exitPrice: 70,
          exitQuantity: 10,
          exitValue: 700,
        },
      });

      const response = await patchPosition(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.result).toBe('WIN');
      expect(data.data.realizedPnL).toBe(200); // (70-50)*10
    });

    it('should return error for missing tradeId', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/positions', {
        method: 'PATCH',
        body: {
          action: 'updatePrice',
          currentPrice: 60,
        },
      });

      const response = await patchPosition(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('tradeId');
    });

    it('should return error for invalid action', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/positions', {
        method: 'PATCH',
        body: {
          tradeId: 'some-id',
          action: 'invalid',
        },
      });

      const response = await patchPosition(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid action');
    });

    it('should return 404 for non-existent trade', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/positions', {
        method: 'PATCH',
        body: {
          tradeId: 'non-existent',
          action: 'updatePrice',
          currentPrice: 60,
        },
      });

      const response = await patchPosition(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  // =========================================================================
  // GET /api/analytics/stats
  // =========================================================================
  describe('GET /api/analytics/stats', () => {
    it('should return stats for empty data', async () => {
      const request = createRequest('http://localhost:3000/api/analytics/stats');
      const response = await getStats(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.trades.total).toBe(0);
      expect(data.data.trades.winRate).toBe('0.0%');
    });

    it('should calculate stats for trades', async () => {
      // Create wins
      for (let i = 0; i < 3; i++) {
        const trade = await analyticsService.recordTradeEntry({
          marketTicker: `WIN-${i}`,
          side: 'yes',
          entryPrice: 40 + i * 5,
          entryQuantity: 10,
          entryValue: (40 + i * 5) * 10,
        });
        await analyticsService.closeTrade(trade.id, {
          exitPrice: 60 + i * 5,
          exitQuantity: 10,
          exitValue: (60 + i * 5) * 10,
        });
      }

      // Create losses
      for (let i = 0; i < 2; i++) {
        const trade = await analyticsService.recordTradeEntry({
          marketTicker: `LOSS-${i}`,
          side: 'yes',
          entryPrice: 60,
          entryQuantity: 10,
          entryValue: 600,
        });
        await analyticsService.closeTrade(trade.id, {
          exitPrice: 40,
          exitQuantity: 10,
          exitValue: 400,
        });
      }

      const request = createRequest('http://localhost:3000/api/analytics/stats');
      const response = await getStats(request);
      const data = await response.json();

      expect(data.data.trades.total).toBe(5);
      expect(data.data.trades.wins).toBe(3);
      expect(data.data.trades.losses).toBe(2);
      expect(data.data.trades.winRate).toBe('60.0%');
    });

    it('should filter by period', async () => {
      const request = createRequest(
        'http://localhost:3000/api/analytics/stats?period=7d'
      );
      const response = await getStats(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.period).toBe('7d');
    });

    it('should return error for invalid period', async () => {
      const request = createRequest(
        'http://localhost:3000/api/analytics/stats?period=invalid'
      );
      const response = await getStats(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid period');
    });

    it('should include best and worst trades', async () => {
      // Create trades with varying P&L
      const profits = [100, 200, 50, -100, -50];
      for (let i = 0; i < profits.length; i++) {
        const trade = await analyticsService.recordTradeEntry({
          marketTicker: `TRADE-${i}`,
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });
        await analyticsService.closeTrade(trade.id, {
          exitPrice: 50 + profits[i] / 10,
          exitQuantity: 10,
          exitValue: 500 + profits[i],
        });
      }

      const request = createRequest('http://localhost:3000/api/analytics/stats');
      const response = await getStats(request);
      const data = await response.json();

      expect(data.data.bestTrades.length).toBeGreaterThan(0);
      expect(data.data.worstTrades.length).toBeGreaterThan(0);
      
      // Best trade should have highest P&L
      expect(data.data.bestTrades[0].netPnL).toBe(200);
      // Worst trade should have lowest P&L  
      expect(data.data.worstTrades[0].netPnL).toBe(-100);
    });

    it('should format metrics correctly', async () => {
      const trade = await analyticsService.recordTradeEntry({
        marketTicker: 'FORMAT-TEST',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });
      await analyticsService.closeTrade(trade.id, {
        exitPrice: 75,
        exitQuantity: 10,
        exitValue: 750,
      });

      const request = createRequest('http://localhost:3000/api/analytics/stats');
      const response = await getStats(request);
      const data = await response.json();

      expect(data.data.pnl.totalDollars).toMatch(/^\d+\.\d{2}$/);
      expect(data.data.trades.winRate).toMatch(/^\d+\.\d%$/);
      expect(data.data.metrics.profitFactor).toBeDefined();
      expect(data.data.drawdown.maxPercent).toMatch(/%$/);
    });
  });
});

// =========================================================================
// Integration Tests
// =========================================================================
describe('Analytics API Integration', () => {
  beforeEach(() => {
    snapshotStorage.clear();
    tradeStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track full trade lifecycle', async () => {
    vi.setSystemTime(new Date('2026-01-10'));

    // 1. Record initial snapshot
    let request = createRequest('http://localhost:3000/api/analytics/history', {
      method: 'POST',
      body: {
        portfolioValue: 10000,
        cashBalance: 10000,
        positionValue: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        openPositions: 0,
        closedPositions: 0,
      },
    });
    await postHistory(request);

    // 2. Open a trade
    request = createRequest('http://localhost:3000/api/analytics/positions', {
      method: 'POST',
      body: {
        marketTicker: 'BTC-100K',
        marketTitle: 'Bitcoin hits $100K',
        side: 'yes',
        entryPrice: 45,
        entryQuantity: 100,
        entryValue: 4500,
      },
    });
    const tradeResponse = await postPosition(request);
    const tradeData = await tradeResponse.json();
    const tradeId = tradeData.data.id;

    // 3. Update price (market moves up)
    vi.setSystemTime(new Date('2026-01-12'));
    request = createRequest('http://localhost:3000/api/analytics/positions', {
      method: 'PATCH',
      body: {
        tradeId,
        action: 'updatePrice',
        currentPrice: 55,
      },
    });
    await patchPosition(request);

    // 4. Check stats show unrealized gain
    request = createRequest('http://localhost:3000/api/analytics/stats');
    let statsResponse = await getStats(request);
    let statsData = await statsResponse.json();
    expect(statsData.data.trades.open).toBe(1);

    // 5. Close the trade
    vi.setSystemTime(new Date('2026-01-15'));
    request = createRequest('http://localhost:3000/api/analytics/positions', {
      method: 'PATCH',
      body: {
        tradeId,
        action: 'close',
        exitPrice: 60,
        exitQuantity: 100,
        exitValue: 6000,
        fees: 50,
      },
    });
    await patchPosition(request);

    // 6. Final stats should show closed winning trade
    request = createRequest('http://localhost:3000/api/analytics/stats');
    statsResponse = await getStats(request);
    statsData = await statsResponse.json();

    expect(statsData.data.trades.closed).toBe(1);
    expect(statsData.data.trades.wins).toBe(1);
    expect(statsData.data.pnl.realized).toBe(1450); // (60-45)*100 - 50 fees = 1450
    
    // 7. Position history should show closed position
    request = createRequest('http://localhost:3000/api/analytics/positions');
    const positionsResponse = await getPositions(request);
    const positionsData = await positionsResponse.json();

    expect(positionsData.data.closedPositions.length).toBe(1);
    expect(positionsData.data.closedPositions[0].marketTicker).toBe('BTC-100K');
  });

  it('should calculate correct summary over time', async () => {
    // Create snapshots over 5 days
    const portfolioData = [
      { date: '2026-01-10', value: 10000 },
      { date: '2026-01-11', value: 10200 },
      { date: '2026-01-12', value: 10150 },
      { date: '2026-01-13', value: 10400 },
      { date: '2026-01-14', value: 10300 },
    ];

    for (const { date, value } of portfolioData) {
      vi.setSystemTime(new Date(date));
      const request = createRequest('http://localhost:3000/api/analytics/history', {
        method: 'POST',
        body: {
          portfolioValue: value,
          cashBalance: value * 0.6,
          positionValue: value * 0.4,
          realizedPnL: 0,
          unrealizedPnL: 0,
          openPositions: 2,
          closedPositions: 0,
        },
      });
      await postHistory(request);
    }

    // Get history
    const request = createRequest(
      'http://localhost:3000/api/analytics/history?startDate=2026-01-10&endDate=2026-01-14'
    );
    const response = await getHistory(request);
    const data = await response.json();

    expect(data.data.snapshots.length).toBe(5);
    expect(data.data.summary.startValue).toBe(10000);
    expect(data.data.summary.endValue).toBe(10300);
    expect(data.data.summary.totalReturn).toBe(300);
    expect(parseFloat(data.data.summary.totalReturnPercent)).toBeCloseTo(3.0, 0);
  });
});
