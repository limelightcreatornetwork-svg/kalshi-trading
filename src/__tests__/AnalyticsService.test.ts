import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AnalyticsService,
  InMemorySnapshotStorage,
  InMemoryTradeStorage,
  type DailySnapshot,
  type TradeHistory,
  type PortfolioDataProvider,
} from '../services/AnalyticsService';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let snapshotStorage: InMemorySnapshotStorage;
  let tradeStorage: InMemoryTradeStorage;

  beforeEach(() => {
    snapshotStorage = new InMemorySnapshotStorage();
    tradeStorage = new InMemoryTradeStorage();
    service = new AnalyticsService(snapshotStorage, tradeStorage);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Daily Snapshot Tests
  // =========================================================================
  describe('Daily Snapshots', () => {
    describe('createDailySnapshot', () => {
      it('should create a new daily snapshot', async () => {
        vi.setSystemTime(new Date('2026-01-15'));
        
        const snapshot = await service.createDailySnapshot({
          portfolioValue: 10000,
          cashBalance: 5000,
          positionValue: 5000,
          realizedPnL: 500,
          unrealizedPnL: 200,
          openPositions: 3,
          closedPositions: 1,
        });

        expect(snapshot.date).toBe('2026-01-15');
        expect(snapshot.portfolioValue).toBe(10000);
        expect(snapshot.cashBalance).toBe(5000);
        expect(snapshot.positionValue).toBe(5000);
        expect(snapshot.realizedPnL).toBe(500);
        expect(snapshot.unrealizedPnL).toBe(200);
        expect(snapshot.openPositions).toBe(3);
        expect(snapshot.closedPositions).toBe(1);
      });

      it('should calculate dailyPnL from previous snapshot', async () => {
        vi.setSystemTime(new Date('2026-01-14'));
        
        // Create first snapshot
        await service.createDailySnapshot({
          portfolioValue: 10000,
          cashBalance: 5000,
          positionValue: 5000,
          realizedPnL: 500,
          unrealizedPnL: 200,
          openPositions: 3,
          closedPositions: 0,
        });

        vi.setSystemTime(new Date('2026-01-15'));
        
        // Create second snapshot with more P&L
        const snapshot2 = await service.createDailySnapshot({
          portfolioValue: 10500,
          cashBalance: 5200,
          positionValue: 5300,
          realizedPnL: 700,  // +200 realized
          unrealizedPnL: 300, // +100 unrealized
          openPositions: 3,
          closedPositions: 1,
        });

        // Daily P&L should be (700+300) - (500+200) = 300
        expect(snapshot2.dailyPnL).toBe(300);
      });

      it('should track high water mark and drawdown', async () => {
        vi.setSystemTime(new Date('2026-01-14'));
        
        // High point
        await service.createDailySnapshot({
          portfolioValue: 10000,
          cashBalance: 5000,
          positionValue: 5000,
          realizedPnL: 0,
          unrealizedPnL: 0,
          openPositions: 3,
          closedPositions: 0,
        });

        vi.setSystemTime(new Date('2026-01-15'));
        
        // Drop to 9000
        const snapshot = await service.createDailySnapshot({
          portfolioValue: 9000,
          cashBalance: 4500,
          positionValue: 4500,
          realizedPnL: 0,
          unrealizedPnL: -1000,
          openPositions: 3,
          closedPositions: 0,
        });

        expect(snapshot.highWaterMark).toBe(10000);
        expect(snapshot.drawdownAmount).toBe(1000);
        expect(snapshot.drawdownPercent).toBe(0.1); // 10%
      });

      it('should update existing snapshot for same day', async () => {
        vi.setSystemTime(new Date('2026-01-15'));
        
        // First snapshot
        await service.createDailySnapshot({
          portfolioValue: 10000,
          cashBalance: 5000,
          positionValue: 5000,
          realizedPnL: 0,
          unrealizedPnL: 0,
          openPositions: 3,
          closedPositions: 0,
        });

        // Update same day
        const snapshot = await service.createDailySnapshot({
          portfolioValue: 10500,
          cashBalance: 5200,
          positionValue: 5300,
          realizedPnL: 300,
          unrealizedPnL: 200,
          openPositions: 4,
          closedPositions: 0,
        });

        expect(snapshot.portfolioValue).toBe(10500);
        expect(snapshot.openPositions).toBe(4);
      });
    });

    describe('getSnapshotHistory', () => {
      beforeEach(async () => {
        // Create sample snapshots for multiple days
        const dates = ['2026-01-10', '2026-01-11', '2026-01-12', '2026-01-13', '2026-01-14'];
        let value = 10000;
        
        for (const date of dates) {
          vi.setSystemTime(new Date(date));
          value += Math.random() > 0.5 ? 200 : -100;
          await service.createDailySnapshot({
            portfolioValue: value,
            cashBalance: value * 0.5,
            positionValue: value * 0.5,
            realizedPnL: 0,
            unrealizedPnL: 0,
            openPositions: 3,
            closedPositions: 0,
          });
        }
      });

      it('should return snapshots within date range', async () => {
        const result = await service.getSnapshotHistory({
          startDate: '2026-01-11',
          endDate: '2026-01-13',
        });

        expect(result.snapshots.length).toBe(3);
        expect(result.snapshots[0].date).toBe('2026-01-11');
        expect(result.snapshots[2].date).toBe('2026-01-13');
      });

      it('should calculate summary statistics', async () => {
        const result = await service.getSnapshotHistory({
          startDate: '2026-01-10',
          endDate: '2026-01-14',
        });

        expect(result.summary).toHaveProperty('startValue');
        expect(result.summary).toHaveProperty('endValue');
        expect(result.summary).toHaveProperty('totalReturn');
        expect(result.summary).toHaveProperty('totalReturnPercent');
        expect(result.summary).toHaveProperty('maxDrawdown');
        expect(result.summary).toHaveProperty('avgDailyReturn');
      });

      it('should respect limit parameter', async () => {
        const result = await service.getSnapshotHistory({
          startDate: '2026-01-10',
          endDate: '2026-01-14',
          limit: 2,
        });

        expect(result.snapshots.length).toBe(2);
      });

      it('should return empty array and zeroed summary when no data', async () => {
        snapshotStorage.clear();
        
        const result = await service.getSnapshotHistory({
          startDate: '2020-01-01',
          endDate: '2020-01-31',
        });

        expect(result.snapshots.length).toBe(0);
        expect(result.summary.totalReturn).toBe(0);
        expect(result.summary.totalReturnPercent).toBe(0);
      });
    });

    describe('captureSnapshot with provider', () => {
      it('should auto-capture snapshot from portfolio provider', async () => {
        vi.setSystemTime(new Date('2026-01-15'));
        
        const mockProvider: PortfolioDataProvider = {
          getBalance: vi.fn().mockResolvedValue({
            balance: 5000,
            portfolioValue: 10000,
          }),
          getPositions: vi.fn().mockResolvedValue([
            { ticker: 'TEST-1', position: 10, marketExposure: 2500, realizedPnl: 100 },
            { ticker: 'TEST-2', position: 5, marketExposure: 2500, realizedPnl: 200 },
          ]),
        };

        service.setPortfolioProvider(mockProvider);
        const snapshot = await service.captureSnapshot();

        expect(snapshot).not.toBeNull();
        expect(snapshot!.portfolioValue).toBe(10000);
        expect(snapshot!.cashBalance).toBe(5000);
        expect(snapshot!.openPositions).toBe(2);
        expect(mockProvider.getBalance).toHaveBeenCalled();
        expect(mockProvider.getPositions).toHaveBeenCalled();
      });

      it('should throw when no provider configured', async () => {
        await expect(service.captureSnapshot()).rejects.toThrow('Portfolio provider not configured');
      });
    });
  });

  // =========================================================================
  // Trade History Tests
  // =========================================================================
  describe('Trade History', () => {
    describe('recordTradeEntry', () => {
      it('should record a new trade entry', async () => {
        vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
        
        const trade = await service.recordTradeEntry({
          marketTicker: 'AAPL-2026-Q1',
          marketTitle: 'Apple Q1 Earnings',
          side: 'yes',
          entryPrice: 55,
          entryQuantity: 10,
          entryValue: 550,
        });

        expect(trade.marketTicker).toBe('AAPL-2026-Q1');
        expect(trade.side).toBe('yes');
        expect(trade.direction).toBe('long');
        expect(trade.entryPrice).toBe(55);
        expect(trade.entryQuantity).toBe(10);
        expect(trade.entryValue).toBe(550);
        expect(trade.result).toBe('OPEN');
        expect(trade.exitPrice).toBeNull();
      });

      it('should set direction based on side', async () => {
        const yesTrade = await service.recordTradeEntry({
          marketTicker: 'TEST-1',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 5,
          entryValue: 250,
        });

        const noTrade = await service.recordTradeEntry({
          marketTicker: 'TEST-2',
          side: 'no',
          entryPrice: 50,
          entryQuantity: 5,
          entryValue: 250,
        });

        expect(yesTrade.direction).toBe('long');
        expect(noTrade.direction).toBe('short');
      });

      it('should include strategy and thesis IDs when provided', async () => {
        const trade = await service.recordTradeEntry({
          marketTicker: 'TEST-1',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 5,
          entryValue: 250,
          strategyId: 'strategy-123',
          thesisId: 'thesis-456',
        });

        expect(trade.strategyId).toBe('strategy-123');
        expect(trade.thesisId).toBe('thesis-456');
      });
    });

    describe('updateTradePrice', () => {
      it('should update unrealized P&L for open trade', async () => {
        // Entry at 50
        const trade = await service.recordTradeEntry({
          marketTicker: 'TEST-1',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });

        // Price moves to 60
        const updated = await service.updateTradePrice(trade.id, 60);

        expect(updated).not.toBeNull();
        expect(updated!.currentPrice).toBe(60);
        expect(updated!.unrealizedPnL).toBe(100); // (60-50) * 10
      });

      it('should return null for closed trade', async () => {
        const trade = await service.recordTradeEntry({
          marketTicker: 'TEST-1',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });

        await service.closeTrade(trade.id, {
          exitPrice: 60,
          exitQuantity: 10,
          exitValue: 600,
        });

        const result = await service.updateTradePrice(trade.id, 70);
        expect(result).toBeNull();
      });

      it('should calculate correct P&L percentage', async () => {
        const trade = await service.recordTradeEntry({
          marketTicker: 'TEST-1',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });

        const updated = await service.updateTradePrice(trade.id, 75);

        // P&L = (75-50) * 10 = 250, P&L% = 250/500 * 100 = 50%
        expect(updated!.pnlPercent).toBe(50);
      });
    });

    describe('closeTrade', () => {
      it('should close a winning trade', async () => {
        vi.setSystemTime(new Date('2026-01-10'));
        
        const trade = await service.recordTradeEntry({
          marketTicker: 'TEST-WIN',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });

        vi.setSystemTime(new Date('2026-01-15'));
        
        const closed = await service.closeTrade(trade.id, {
          exitPrice: 70,
          exitQuantity: 10,
          exitValue: 700,
        });

        expect(closed).not.toBeNull();
        expect(closed!.result).toBe('WIN');
        expect(closed!.realizedPnL).toBe(200); // (70-50) * 10
        expect(closed!.holdingPeriod).toBe(5);
      });

      it('should close a losing trade', async () => {
        const trade = await service.recordTradeEntry({
          marketTicker: 'TEST-LOSS',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });

        const closed = await service.closeTrade(trade.id, {
          exitPrice: 30,
          exitQuantity: 10,
          exitValue: 300,
        });

        expect(closed!.result).toBe('LOSS');
        expect(closed!.realizedPnL).toBe(-200); // (30-50) * 10
      });

      it('should handle breakeven trades', async () => {
        const trade = await service.recordTradeEntry({
          marketTicker: 'TEST-BE',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });

        const closed = await service.closeTrade(trade.id, {
          exitPrice: 50,
          exitQuantity: 10,
          exitValue: 500,
        });

        expect(closed!.result).toBe('BREAKEVEN');
        expect(closed!.realizedPnL).toBe(0);
      });

      it('should account for fees', async () => {
        const trade = await service.recordTradeEntry({
          marketTicker: 'TEST-FEES',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });

        const closed = await service.closeTrade(trade.id, {
          exitPrice: 60,
          exitQuantity: 10,
          exitValue: 600,
          fees: 20,
        });

        expect(closed!.realizedPnL).toBe(100); // (60-50) * 10
        expect(closed!.fees).toBe(20);
        expect(closed!.netPnL).toBe(80); // 100 - 20
      });

      it('should return null for non-existent trade', async () => {
        const result = await service.closeTrade('non-existent-id', {
          exitPrice: 60,
          exitQuantity: 10,
          exitValue: 600,
        });

        expect(result).toBeNull();
      });
    });

    describe('getPositionPerformance', () => {
      beforeEach(async () => {
        // Create mix of open and closed trades
        vi.setSystemTime(new Date('2026-01-10'));
        
        const trade1 = await service.recordTradeEntry({
          marketTicker: 'OPEN-1',
          side: 'yes',
          entryPrice: 50,
          entryQuantity: 10,
          entryValue: 500,
        });
        await service.updateTradePrice(trade1.id, 55);

        const trade2 = await service.recordTradeEntry({
          marketTicker: 'CLOSED-1',
          side: 'no',
          entryPrice: 60,
          entryQuantity: 5,
          entryValue: 300,
        });
        await service.closeTrade(trade2.id, {
          exitPrice: 70,
          exitQuantity: 5,
          exitValue: 350,
        });
      });

      it('should return all positions including closed', async () => {
        const positions = await service.getPositionPerformance(true);
        
        expect(positions.length).toBe(2);
        expect(positions.some(p => p.isOpen)).toBe(true);
        expect(positions.some(p => !p.isOpen)).toBe(true);
      });

      it('should return only open positions when includeClosed is false', async () => {
        const positions = await service.getPositionPerformance(false);
        
        expect(positions.length).toBe(1);
        expect(positions[0].isOpen).toBe(true);
        expect(positions[0].marketTicker).toBe('OPEN-1');
      });

      it('should include calculated metrics', async () => {
        const positions = await service.getPositionPerformance(true);
        
        for (const position of positions) {
          expect(position).toHaveProperty('entryPrice');
          expect(position).toHaveProperty('currentPrice');
          expect(position).toHaveProperty('pnl');
          expect(position).toHaveProperty('pnlPercent');
          expect(position).toHaveProperty('holdingDays');
        }
      });
    });
  });

  // =========================================================================
  // Win/Loss Statistics Tests
  // =========================================================================
  describe('Win/Loss Statistics', () => {
    async function setupTrades() {
      const trades = [
        { ticker: 'WIN-1', entry: 40, exit: 60, qty: 10, win: true },
        { ticker: 'WIN-2', entry: 45, exit: 70, qty: 5, win: true },
        { ticker: 'WIN-3', entry: 50, exit: 55, qty: 20, win: true },
        { ticker: 'LOSS-1', entry: 60, exit: 40, qty: 10, win: false },
        { ticker: 'LOSS-2', entry: 55, exit: 45, qty: 8, win: false },
        { ticker: 'OPEN-1', entry: 50, exit: null, qty: 10, win: null },
      ];

      for (let i = 0; i < trades.length; i++) {
        const t = trades[i];
        vi.setSystemTime(new Date(`2026-01-${10 + i}`));
        
        const trade = await service.recordTradeEntry({
          marketTicker: t.ticker,
          side: 'yes',
          entryPrice: t.entry,
          entryQuantity: t.qty,
          entryValue: t.entry * t.qty,
        });

        if (t.exit !== null) {
          vi.setSystemTime(new Date(`2026-01-${15 + i}`));
          await service.closeTrade(trade.id, {
            exitPrice: t.exit,
            exitQuantity: t.qty,
            exitValue: t.exit * t.qty,
          });
        } else {
          await service.updateTradePrice(trade.id, 55);
        }
      }
    }

    beforeEach(async () => {
      await setupTrades();
    });

    describe('calculateStats', () => {
      it('should calculate basic trade counts', async () => {
        const stats = await service.calculateStats({ period: 'all' });

        expect(stats.totalTrades).toBe(6);
        expect(stats.openTrades).toBe(1);
        expect(stats.closedTrades).toBe(5);
        expect(stats.winCount).toBe(3);
        expect(stats.lossCount).toBe(2);
      });

      it('should calculate win rate correctly', async () => {
        const stats = await service.calculateStats({ period: 'all' });

        // 3 wins out of 5 closed = 60%
        expect(stats.winRate).toBe(0.6);
      });

      it('should calculate average win and loss', async () => {
        const stats = await service.calculateStats({ period: 'all' });

        // Wins: (60-40)*10=200, (70-45)*5=125, (55-50)*20=100 -> avg = 141.67
        // Losses: (40-60)*10=-200, (45-55)*8=-80 -> avg loss = 140
        expect(stats.avgWin).toBeGreaterThan(0);
        expect(stats.avgLoss).toBeGreaterThan(0);
      });

      it('should calculate largest win and loss', async () => {
        const stats = await service.calculateStats({ period: 'all' });

        expect(stats.largestWin).toBe(200); // (60-40)*10
        expect(stats.largestLoss).toBe(-200); // (40-60)*10
      });

      it('should calculate profit factor', async () => {
        const stats = await service.calculateStats({ period: 'all' });

        // Total wins = 200+125+100 = 425
        // Total losses = 200+80 = 280
        // Profit factor = 425/280 = 1.52
        expect(stats.profitFactor).toBeCloseTo(1.52, 1);
      });

      it('should calculate expectancy', async () => {
        const stats = await service.calculateStats({ period: 'all' });

        // Expectancy = (winRate * avgWin) - (lossRate * avgLoss)
        const expectedExpectancy = (stats.winRate * stats.avgWin) - ((1 - stats.winRate) * stats.avgLoss);
        expect(stats.expectancy).toBeCloseTo(expectedExpectancy, 2);
      });

      it('should filter by time period', async () => {
        // Add a trade from long ago
        vi.setSystemTime(new Date('2025-01-01'));
        const oldTrade = await service.recordTradeEntry({
          marketTicker: 'OLD-TRADE',
          side: 'yes',
          entryPrice: 30,
          entryQuantity: 5,
          entryValue: 150,
        });
        await service.closeTrade(oldTrade.id, {
          exitPrice: 50,
          exitQuantity: 5,
          exitValue: 250,
        });

        vi.setSystemTime(new Date('2026-01-20'));
        
        const allStats = await service.calculateStats({ period: 'all' });
        const recentStats = await service.calculateStats({ period: '30d' });

        expect(allStats.totalTrades).toBeGreaterThan(recentStats.totalTrades);
      });
    });

    describe('getBestAndWorstTrades', () => {
      it('should return best trades sorted by P&L', async () => {
        const { best } = await service.getBestAndWorstTrades(3);

        expect(best.length).toBe(3);
        expect(best[0].netPnL).toBeGreaterThanOrEqual(best[1].netPnL);
        expect(best[1].netPnL).toBeGreaterThanOrEqual(best[2].netPnL);
      });

      it('should return worst trades sorted by P&L', async () => {
        const { worst } = await service.getBestAndWorstTrades(2);

        expect(worst.length).toBe(2);
        expect(worst[0].netPnL).toBeLessThanOrEqual(worst[1].netPnL);
      });

      it('should respect limit parameter', async () => {
        const { best, worst } = await service.getBestAndWorstTrades(1);

        expect(best.length).toBe(1);
        expect(worst.length).toBe(1);
      });
    });
  });

  // =========================================================================
  // Sharpe Ratio Tests
  // =========================================================================
  describe('Sharpe Ratio Calculation', () => {
    it('should return 0 when insufficient data', async () => {
      const stats = await service.calculateStats({ period: 'all' });
      expect(stats.sharpeRatio).toBe(0);
    });

    it('should calculate Sharpe ratio from daily returns', async () => {
      // Create snapshots with varying returns
      const dates = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 10100 }, // +1%
        { date: '2026-01-03', value: 10050 }, // -0.5%
        { date: '2026-01-04', value: 10200 }, // +1.5%
        { date: '2026-01-05', value: 10150 }, // -0.5%
        { date: '2026-01-06', value: 10300 }, // +1.5%
      ];

      for (const { date, value } of dates) {
        vi.setSystemTime(new Date(date));
        await service.createDailySnapshot({
          portfolioValue: value,
          cashBalance: value * 0.5,
          positionValue: value * 0.5,
          realizedPnL: 0,
          unrealizedPnL: 0,
          openPositions: 1,
          closedPositions: 0,
        });
      }

      const stats = await service.calculateStats({ period: 'all' });
      
      // With positive average return and some volatility, Sharpe should be positive
      expect(stats.sharpeRatio).toBeGreaterThan(0);
    });

    it('should return 0 when no volatility (stddev = 0)', async () => {
      // All same values
      const dates = ['2026-01-01', '2026-01-02', '2026-01-03'];
      
      for (const date of dates) {
        vi.setSystemTime(new Date(date));
        await service.createDailySnapshot({
          portfolioValue: 10000,
          cashBalance: 5000,
          positionValue: 5000,
          realizedPnL: 0,
          unrealizedPnL: 0,
          openPositions: 1,
          closedPositions: 0,
        });
      }

      const stats = await service.calculateStats({ period: 'all' });
      expect(stats.sharpeRatio).toBe(0);
    });
  });

  // =========================================================================
  // Sortino Ratio Tests
  // =========================================================================
  describe('Sortino Ratio Calculation', () => {
    it('should return Infinity when no negative returns', async () => {
      // Only positive returns
      const dates = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 10100 },
        { date: '2026-01-03', value: 10200 },
        { date: '2026-01-04', value: 10300 },
      ];

      for (const { date, value } of dates) {
        vi.setSystemTime(new Date(date));
        await service.createDailySnapshot({
          portfolioValue: value,
          cashBalance: value * 0.5,
          positionValue: value * 0.5,
          realizedPnL: 0,
          unrealizedPnL: 0,
          openPositions: 1,
          closedPositions: 0,
        });
      }

      const stats = await service.calculateStats({ period: 'all' });
      expect(stats.sortinoRatio).toBe(Infinity);
    });

    it('should be higher than Sharpe when losses are infrequent', async () => {
      // Mostly positive with one small loss
      const dates = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 10200 }, // +2%
        { date: '2026-01-03', value: 10150 }, // -0.5%
        { date: '2026-01-04', value: 10400 }, // +2.5%
        { date: '2026-01-05', value: 10600 }, // +1.9%
      ];

      for (const { date, value } of dates) {
        vi.setSystemTime(new Date(date));
        await service.createDailySnapshot({
          portfolioValue: value,
          cashBalance: value * 0.5,
          positionValue: value * 0.5,
          realizedPnL: 0,
          unrealizedPnL: 0,
          openPositions: 1,
          closedPositions: 0,
        });
      }

      const stats = await service.calculateStats({ period: 'all' });
      
      // Sortino should be >= Sharpe (only penalizes downside)
      if (stats.sortinoRatio !== Infinity) {
        expect(stats.sortinoRatio).toBeGreaterThanOrEqual(stats.sharpeRatio);
      }
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge Cases', () => {
    it('should handle empty trade storage gracefully', async () => {
      const stats = await service.calculateStats({ period: 'all' });
      
      expect(stats.totalTrades).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.profitFactor).toBe(0);
      expect(stats.avgPnL).toBe(0);
    });

    it('should handle only open trades', async () => {
      await service.recordTradeEntry({
        marketTicker: 'OPEN-ONLY',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });

      const stats = await service.calculateStats({ period: 'all' });
      
      expect(stats.totalTrades).toBe(1);
      expect(stats.openTrades).toBe(1);
      expect(stats.closedTrades).toBe(0);
      expect(stats.winRate).toBe(0);
    });

    it('should handle only losses', async () => {
      const trade = await service.recordTradeEntry({
        marketTicker: 'LOSS-ONLY',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });

      await service.closeTrade(trade.id, {
        exitPrice: 30,
        exitQuantity: 10,
        exitValue: 300,
      });

      const stats = await service.calculateStats({ period: 'all' });
      
      expect(stats.winRate).toBe(0);
      expect(stats.profitFactor).toBe(0);
    });

    it('should handle only wins', async () => {
      const trade = await service.recordTradeEntry({
        marketTicker: 'WIN-ONLY',
        side: 'yes',
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
      });

      await service.closeTrade(trade.id, {
        exitPrice: 70,
        exitQuantity: 10,
        exitValue: 700,
      });

      const stats = await service.calculateStats({ period: 'all' });
      
      expect(stats.winRate).toBe(1);
      expect(stats.profitFactor).toBe(Infinity);
    });

    it('should handle zero entry value (division by zero protection)', async () => {
      const trade = await service.recordTradeEntry({
        marketTicker: 'ZERO-VALUE',
        side: 'yes',
        entryPrice: 0,
        entryQuantity: 10,
        entryValue: 0,
      });

      const updated = await service.updateTradePrice(trade.id, 10);
      
      expect(updated).not.toBeNull();
      expect(updated!.pnlPercent).toBe(0);
    });
  });
});

// =========================================================================
// Storage Tests
// =========================================================================
describe('InMemorySnapshotStorage', () => {
  let storage: InMemorySnapshotStorage;

  beforeEach(() => {
    storage = new InMemorySnapshotStorage();
  });

  it('should store and retrieve snapshots by date', async () => {
    const snapshot: DailySnapshot = {
      id: 'test-1',
      date: '2026-01-15',
      portfolioValue: 10000,
      cashBalance: 5000,
      positionValue: 5000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      dailyPnL: 0,
      openPositions: 0,
      closedPositions: 0,
      highWaterMark: 10000,
      drawdownAmount: 0,
      drawdownPercent: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.create(snapshot);
    const retrieved = await storage.getByDate('2026-01-15');

    expect(retrieved).toEqual(snapshot);
  });

  it('should return null for non-existent date', async () => {
    const result = await storage.getByDate('2026-12-31');
    expect(result).toBeNull();
  });

  it('should get latest snapshot', async () => {
    const dates = ['2026-01-10', '2026-01-15', '2026-01-12'];
    
    for (const date of dates) {
      await storage.create({
        id: `test-${date}`,
        date,
        portfolioValue: 10000,
        cashBalance: 5000,
        positionValue: 5000,
        realizedPnL: 0,
        unrealizedPnL: 0,
        dailyPnL: 0,
        openPositions: 0,
        closedPositions: 0,
        highWaterMark: 10000,
        drawdownAmount: 0,
        drawdownPercent: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const latest = await storage.getLatest();
    expect(latest?.date).toBe('2026-01-15');
  });

  it('should clear all data', async () => {
    await storage.create({
      id: 'test-1',
      date: '2026-01-15',
      portfolioValue: 10000,
      cashBalance: 5000,
      positionValue: 5000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      dailyPnL: 0,
      openPositions: 0,
      closedPositions: 0,
      highWaterMark: 10000,
      drawdownAmount: 0,
      drawdownPercent: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    storage.clear();
    
    const result = await storage.getByDate('2026-01-15');
    expect(result).toBeNull();
  });
});

describe('InMemoryTradeStorage', () => {
  let storage: InMemoryTradeStorage;

  beforeEach(() => {
    storage = new InMemoryTradeStorage();
  });

  const createTrade = (id: string, result: TradeHistory['result']): TradeHistory => ({
    id,
    marketTicker: 'TEST',
    marketTitle: null,
    side: 'yes',
    direction: 'long',
    entryPrice: 50,
    entryQuantity: 10,
    entryValue: 500,
    entryDate: new Date(),
    exitPrice: result === 'OPEN' ? null : 60,
    exitQuantity: result === 'OPEN' ? null : 10,
    exitValue: result === 'OPEN' ? null : 600,
    exitDate: result === 'OPEN' ? null : new Date(),
    currentPrice: 55,
    currentQuantity: 10,
    realizedPnL: result === 'OPEN' ? 0 : 100,
    unrealizedPnL: result === 'OPEN' ? 50 : 0,
    fees: 0,
    netPnL: result === 'OPEN' ? 50 : 100,
    pnlPercent: 10,
    result,
    holdingPeriod: result === 'OPEN' ? null : 5,
    strategyId: null,
    thesisId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('should filter trades by result', async () => {
    await storage.create(createTrade('win-1', 'WIN'));
    await storage.create(createTrade('loss-1', 'LOSS'));
    await storage.create(createTrade('open-1', 'OPEN'));

    const wins = await storage.getByResult('WIN');
    expect(wins.length).toBe(1);
    expect(wins[0].id).toBe('win-1');
  });

  it('should get open and closed trades separately', async () => {
    await storage.create(createTrade('win-1', 'WIN'));
    await storage.create(createTrade('open-1', 'OPEN'));
    await storage.create(createTrade('open-2', 'OPEN'));

    const open = await storage.getOpenTrades();
    const closed = await storage.getClosedTrades();

    expect(open.length).toBe(2);
    expect(closed.length).toBe(1);
  });

  it('should update trade', async () => {
    await storage.create(createTrade('test-1', 'OPEN'));
    
    await storage.update('test-1', { currentPrice: 100 });
    
    const updated = await storage.getById('test-1');
    expect(updated?.currentPrice).toBe(100);
  });
});
