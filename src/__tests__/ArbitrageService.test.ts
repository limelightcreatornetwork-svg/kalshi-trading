import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArbitrageService } from '../services/ArbitrageService';
import type { Market } from '../lib/kalshi';

// Mock the prisma client
vi.mock('../lib/prisma', () => ({
  prisma: {
    arbitrageOpportunity: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    arbitrageScan: {
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    arbitrageAlertConfig: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock the Kalshi API
vi.mock('../lib/kalshi', () => ({
  getMarkets: vi.fn(),
  createOrder: vi.fn(),
}));

describe('ArbitrageService', () => {
  let service: ArbitrageService;

  beforeEach(() => {
    service = new ArbitrageService();
    vi.clearAllMocks();
  });

  describe('analyzeMarket', () => {
    it('should detect arbitrage when YES + NO asks < 100', () => {
      const market: Market = {
        ticker: 'TEST-MARKET',
        event_ticker: 'TEST',
        market_type: 'binary',
        title: 'Test Market',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 46,
        yes_ask: 48,
        no_bid: 46,
        no_ask: 48,
        last_price: 50,
        volume: 1000,
        volume_24h: 500,
        open_interest: 200,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      const result = service.analyzeMarket(market);

      expect(result.hasArbitrage).toBe(true);
      expect(result.buyBothCost).toBe(96); // 48 + 48
      expect(result.profitCents).toBe(4); // 100 - 96
      expect(result.profitPercent).toBeCloseTo(4.17, 1); // 4/96 * 100
    });

    it('should NOT detect arbitrage when YES + NO asks > 100', () => {
      const market: Market = {
        ticker: 'TEST-MARKET',
        event_ticker: 'TEST',
        market_type: 'binary',
        title: 'Test Market',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 50,
        yes_ask: 52,
        no_bid: 50,
        no_ask: 52,
        last_price: 50,
        volume: 1000,
        volume_24h: 500,
        open_interest: 200,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      const result = service.analyzeMarket(market);

      expect(result.hasArbitrage).toBe(false);
      expect(result.buyBothCost).toBe(104); // 52 + 52
      expect(result.profitCents).toBe(0); // No profit, no arbitrage
    });

    it('should NOT detect arbitrage when YES + NO asks = 100 exactly', () => {
      const market: Market = {
        ticker: 'TEST-MARKET',
        event_ticker: 'TEST',
        market_type: 'binary',
        title: 'Test Market',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 49,
        yes_ask: 50,
        no_bid: 49,
        no_ask: 50,
        last_price: 50,
        volume: 1000,
        volume_24h: 500,
        open_interest: 200,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      const result = service.analyzeMarket(market);

      expect(result.hasArbitrage).toBe(false);
      expect(result.buyBothCost).toBe(100);
      expect(result.profitCents).toBe(0);
    });

    it('should NOT detect arbitrage when asks are 0 (no liquidity)', () => {
      const market: Market = {
        ticker: 'TEST-MARKET',
        event_ticker: 'TEST',
        market_type: 'binary',
        title: 'Test Market',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 45,
        yes_ask: 0, // No ask available
        no_bid: 45,
        no_ask: 48,
        last_price: 50,
        volume: 1000,
        volume_24h: 500,
        open_interest: 200,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      const result = service.analyzeMarket(market);

      // Even though 0 + 48 = 48 < 100, we can't execute without both sides
      expect(result.hasArbitrage).toBe(false);
    });

    it('should require minimum profit threshold', () => {
      const market: Market = {
        ticker: 'TEST-MARKET',
        event_ticker: 'TEST',
        market_type: 'binary',
        title: 'Test Market',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 49,
        yes_ask: 49.8, // Very small profit
        no_bid: 49,
        no_ask: 49.8,
        last_price: 50,
        volume: 1000,
        volume_24h: 500,
        open_interest: 200,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      const result = service.analyzeMarket(market);

      // 99.6 cost, 0.4 profit - below 0.5 threshold
      expect(result.buyBothCost).toBeCloseTo(99.6, 1);
      expect(result.hasArbitrage).toBe(false);
    });

    it('should calculate correct ROI percentage', () => {
      const market: Market = {
        ticker: 'TEST-MARKET',
        event_ticker: 'TEST',
        market_type: 'binary',
        title: 'Test Market',
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
      };

      const result = service.analyzeMarket(market);

      expect(result.hasArbitrage).toBe(true);
      expect(result.buyBothCost).toBe(90);
      expect(result.profitCents).toBe(10);
      // ROI = (10 / 90) * 100 = 11.11%
      expect(result.profitPercent).toBeCloseTo(11.11, 1);
    });
  });

  describe('edge cases', () => {
    it('should handle very low prices', () => {
      const market: Market = {
        ticker: 'TEST-MARKET',
        event_ticker: 'TEST',
        market_type: 'binary',
        title: 'Test Market - Very Low',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 2,
        yes_ask: 3,
        no_bid: 95,
        no_ask: 96,
        last_price: 3,
        volume: 100,
        volume_24h: 50,
        open_interest: 20,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      const result = service.analyzeMarket(market);

      expect(result.buyBothCost).toBe(99); // 3 + 96
      expect(result.hasArbitrage).toBe(true);
      expect(result.profitCents).toBe(1);
    });

    it('should handle very high prices', () => {
      const market: Market = {
        ticker: 'TEST-MARKET',
        event_ticker: 'TEST',
        market_type: 'binary',
        title: 'Test Market - Very High',
        subtitle: '',
        yes_sub_title: 'Yes',
        no_sub_title: 'No',
        status: 'open',
        yes_bid: 95,
        yes_ask: 96,
        no_bid: 2,
        no_ask: 3,
        last_price: 97,
        volume: 100,
        volume_24h: 50,
        open_interest: 20,
        close_time: '2026-03-01',
        expiration_time: '2026-03-01',
      };

      const result = service.analyzeMarket(market);

      expect(result.buyBothCost).toBe(99); // 96 + 3
      expect(result.hasArbitrage).toBe(true);
      expect(result.profitCents).toBe(1);
    });
  });
});
