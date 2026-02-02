import { describe, it, expect } from 'vitest';
import {
  priceToProb,
  probToPrice,
  getMidPrice,
  getSpread,
  getSpreadPercent,
  hasLiquidity,
  calculateEV,
  calculateEdge,
  kellyFraction,
  calculateKellyBetSize,
  formatMarket,
  formatPrice,
  formatProb,
} from '../lib/market-utils';
import type { Market } from '../lib/kalshi';

const createMockMarket = (overrides: Partial<Market> = {}): Market => ({
  ticker: 'TEST-MARKET',
  event_ticker: 'TEST',
  title: 'Test Market',
  yes_bid: 45,
  yes_ask: 55,
  no_bid: 45,
  no_ask: 55,
  last_price: 50,
  volume: 1000,
  volume_24h: 500,
  open_interest: 200,
  status: 'open',
  expiration_time: '2026-03-01',
  ...overrides,
});

describe('market-utils', () => {
  describe('priceToProb', () => {
    it('should convert price to probability', () => {
      expect(priceToProb(50)).toBe(0.5);
      expect(priceToProb(75)).toBe(0.75);
      expect(priceToProb(0)).toBe(0);
      expect(priceToProb(100)).toBe(1);
    });
  });

  describe('probToPrice', () => {
    it('should convert probability to price', () => {
      expect(probToPrice(0.5)).toBe(50);
      expect(probToPrice(0.75)).toBe(75);
      expect(probToPrice(0)).toBe(0);
      expect(probToPrice(1)).toBe(100);
    });

    it('should round to nearest cent', () => {
      expect(probToPrice(0.555)).toBe(56);
      expect(probToPrice(0.554)).toBe(55);
    });
  });

  describe('getMidPrice', () => {
    it('should calculate mid price', () => {
      const market = createMockMarket({ yes_bid: 40, yes_ask: 50 });
      expect(getMidPrice(market)).toBe(45);
    });

    it('should return last_price when no bid/ask', () => {
      const market = createMockMarket({ yes_bid: 0, yes_ask: 0, last_price: 60 });
      expect(getMidPrice(market)).toBe(60);
    });

    it('should return ask when no bid', () => {
      const market = createMockMarket({ yes_bid: 0, yes_ask: 50 });
      expect(getMidPrice(market)).toBe(50);
    });

    it('should return bid when no ask', () => {
      const market = createMockMarket({ yes_bid: 40, yes_ask: 0 });
      expect(getMidPrice(market)).toBe(40);
    });
  });

  describe('getSpread', () => {
    it('should calculate spread', () => {
      const market = createMockMarket({ yes_bid: 40, yes_ask: 50 });
      expect(getSpread(market)).toBe(10);
    });

    it('should return Infinity when no bid', () => {
      const market = createMockMarket({ yes_bid: 0, yes_ask: 50 });
      expect(getSpread(market)).toBe(Infinity);
    });

    it('should return Infinity when no ask', () => {
      const market = createMockMarket({ yes_bid: 40, yes_ask: 0 });
      expect(getSpread(market)).toBe(Infinity);
    });
  });

  describe('getSpreadPercent', () => {
    it('should calculate spread percentage', () => {
      const market = createMockMarket({ yes_bid: 45, yes_ask: 55 });
      // spread = 10, mid = 50, percent = 20%
      expect(getSpreadPercent(market)).toBe(20);
    });

    it('should return Infinity when no liquidity', () => {
      const market = createMockMarket({ yes_bid: 0, yes_ask: 0 });
      expect(getSpreadPercent(market)).toBe(Infinity);
    });
  });

  describe('hasLiquidity', () => {
    it('should return true when spread is acceptable', () => {
      const market = createMockMarket({ yes_bid: 45, yes_ask: 50 });
      expect(hasLiquidity(market, 10)).toBe(true);
    });

    it('should return false when spread is too wide', () => {
      const market = createMockMarket({ yes_bid: 40, yes_ask: 60 });
      expect(hasLiquidity(market, 10)).toBe(false);
    });

    it('should return false when no bid', () => {
      const market = createMockMarket({ yes_bid: 0, yes_ask: 50 });
      expect(hasLiquidity(market)).toBe(false);
    });

    it('should return false when no ask', () => {
      const market = createMockMarket({ yes_bid: 50, yes_ask: 0 });
      expect(hasLiquidity(market)).toBe(false);
    });
  });

  describe('calculateEV', () => {
    it('should calculate positive EV when estimate is higher than price', () => {
      const market = createMockMarket({ yes_ask: 50 });
      // EV = (0.6 * 100) - 50 = 10
      expect(calculateEV(market, 0.6)).toBe(10);
    });

    it('should calculate negative EV when estimate is lower than price', () => {
      const market = createMockMarket({ yes_ask: 50 });
      // EV = (0.4 * 100) - 50 = -10
      expect(calculateEV(market, 0.4)).toBe(-10);
    });

    it('should return 0 when no ask', () => {
      const market = createMockMarket({ yes_ask: 0 });
      expect(calculateEV(market, 0.5)).toBe(0);
    });
  });

  describe('calculateEdge', () => {
    it('should calculate edge percentage', () => {
      const market = createMockMarket({ yes_ask: 50 });
      // EV = 10 (from 0.6 estimate), Edge = 10/50 * 100 = 20%
      expect(calculateEdge(market, 0.6)).toBe(20);
    });

    it('should return 0 when no ask', () => {
      const market = createMockMarket({ yes_ask: 0 });
      expect(calculateEdge(market, 0.5)).toBe(0);
    });
  });

  describe('kellyFraction', () => {
    it('should calculate positive Kelly for +EV bets', () => {
      // 60% chance at 1:1 odds -> Kelly = (1*0.6 - 0.4) / 1 = 0.2
      expect(kellyFraction(0.6, 1)).toBeCloseTo(0.2, 10);
    });

    it('should return 0 for -EV bets', () => {
      // 40% chance at 1:1 odds -> Kelly = (1*0.4 - 0.6) / 1 = -0.2 -> 0
      expect(kellyFraction(0.4, 1)).toBe(0);
    });

    it('should handle edge case of 50/50', () => {
      expect(kellyFraction(0.5, 1)).toBe(0);
    });
  });

  describe('calculateKellyBetSize', () => {
    it('should calculate bet size with quarter Kelly', () => {
      const market = createMockMarket({ yes_ask: 50 });
      // odds = (100-50)/50 = 1, Kelly(0.6, 1) = 0.2
      // Bet = 10000 * 0.2 * 0.25 = 500 (may be 499 due to floor)
      const betSize = calculateKellyBetSize(market, 0.6, 10000, 0.25);
      expect(betSize).toBeGreaterThanOrEqual(490);
      expect(betSize).toBeLessThanOrEqual(500);
    });

    it('should return 0 for no ask', () => {
      const market = createMockMarket({ yes_ask: 0 });
      expect(calculateKellyBetSize(market, 0.6, 10000)).toBe(0);
    });

    it('should return 0 for ask = 100 (no edge possible)', () => {
      const market = createMockMarket({ yes_ask: 100 });
      expect(calculateKellyBetSize(market, 0.6, 10000)).toBe(0);
    });
  });

  describe('formatMarket', () => {
    it('should format market with spread', () => {
      const market = createMockMarket({ yes_bid: 45, yes_ask: 55 });
      expect(formatMarket(market)).toBe('TEST-MARKET: 50¢ (spread: 10¢)');
    });

    it('should handle no liquidity', () => {
      const market = createMockMarket({ yes_bid: 0, yes_ask: 0, last_price: 60 });
      expect(formatMarket(market)).toBe('TEST-MARKET: 60¢ (spread: N/A)');
    });
  });

  describe('formatPrice', () => {
    it('should format cents as dollars', () => {
      expect(formatPrice(100)).toBe('$1.00');
      expect(formatPrice(50)).toBe('$0.50');
      expect(formatPrice(1234)).toBe('$12.34');
    });
  });

  describe('formatProb', () => {
    it('should format probability as percentage', () => {
      expect(formatProb(0.5)).toBe('50.0%');
      expect(formatProb(0.75)).toBe('75.0%');
      expect(formatProb(0.123)).toBe('12.3%');
    });
  });
});
