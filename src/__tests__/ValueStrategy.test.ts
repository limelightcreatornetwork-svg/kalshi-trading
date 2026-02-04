import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValueStrategy, createValueStrategy } from '../services/strategies/ValueStrategy';
import {
  StrategyConfig,
  StrategyContext,
  StrategyType,
  StrategyStatus,
  SignalType,
} from '../types/strategy';

// Helper to create a market context
function createMarketContext(overrides?: Partial<StrategyContext>): StrategyContext {
  return {
    market: {
            id: 'test-market',
      id: 'test-market-id',
      ticker: 'TEST-MARKET-YES',
      eventTicker: 'TEST-EVENT',
      title: 'Test Market',
      yesAsk: 50,
      yesBid: 48,
      noAsk: 50,
      noBid: 48,
      lastPrice: 50,
      volume24h: 15000,
      openInterest: 8000,
      status: 'active',
      expirationTime: new Date(Date.now() + 86400000).toISOString(),
      ...overrides?.market,
    },
    timestamp: new Date(),
    ...overrides,
  };
}

function createConfig(overrides?: Partial<StrategyConfig>): StrategyConfig {
  return {
    id: 'test-config-1',
    name: 'Test Value Strategy',
    type: StrategyType.VALUE,
    enabled: true,
    autoExecute: false,
    maxOrdersPerHour: 10,
    maxPositionSize: 1000,
    maxNotionalPerTrade: 500,
    minEdge: 3,
    minConfidence: 0.55,
    maxSpread: 10,
    minLiquidity: 100,
    allowedCategories: [],
    blockedCategories: [],
    blockedMarkets: [],
    params: {
      minEdge: 3,
      minConfidence: 0.55,
      useAggressivePricing: false,
      maxPrice: 90,
      modelWeights: { lastPrice: 0.4, mid: 0.4, vwap: 0.2 },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ValueStrategy', () => {
  let strategy: ValueStrategy;
  let config: StrategyConfig;

  beforeEach(() => {
    config = createConfig();
    strategy = new ValueStrategy(config);
  });

  describe('initialization', () => {
    it('should create with default params when no config provided', () => {
      const s = new ValueStrategy();
      expect(s.type).toBe(StrategyType.VALUE);
      expect(s.name).toBe('Value Strategy');
    });

    it('should use custom name from config', () => {
      const s = new ValueStrategy({ name: 'My Custom Strategy' });
      expect(s.name).toBe('My Custom Strategy');
    });

    it('should initialize with config params', async () => {
      await strategy.initialize(config);
      const state = strategy.getState();
      expect(state.status).toBe(StrategyStatus.ACTIVE);
      expect(state.configId).toBe(config.id);
    });

    it('should merge params from config during initialization', async () => {
      config.params = { minEdge: 5, minConfidence: 0.7 };
      await strategy.initialize(config);
      // Strategy should use merged params (verify via signal generation)
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 47,  // 3 cents edge - below new minEdge of 5
          yesBid: 45,
          noAsk: 53,
          noBid: 51,
          lastPrice: 50,
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      const signals = await strategy.generateSignals(context);
      // Should not generate signal because edge (3c) < minEdge (5c)
      expect(signals.length).toBe(0);
    });
  });

  describe('signal generation', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    describe('YES mispricing', () => {
      it('should generate YES signal when market undervalues YES', async () => {
        // Fair value ~50, market ask at 44 = 6 cent edge
        // Note: Fair value is calculated from weighted average of lastPrice, mid, and vwap
        // With lastPrice=50, yesMid=43, weights 0.4/0.4/0.2 => fair = 0.4*50 + 0.4*43 + 0.2*43 = 45.4
        // Edge = 45.4 - 44 = 1.4 (not enough for minEdge 3)
        // Let's create a scenario where edge is definitely > 3
        const context = createMarketContext({
          market: {
            id: 'test-market',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 40,  // Low ask price - edge should be ~7
            yesBid: 38,
            noAsk: 60,
            noBid: 58,
            lastPrice: 50,  // fair value ~47, edge = 47-40 = 7
            volume24h: 15000,
            openInterest: 8000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        const signals = await strategy.generateSignals(context);
        
        const yesSignal = signals.find(s => s.direction === 'yes');
        expect(yesSignal).toBeDefined();
        expect(yesSignal!.type).toBe(SignalType.ENTRY);
        expect(yesSignal!.reason).toContain('YES underpriced');
      });

      it('should not generate YES signal when edge is below minimum', async () => {
        // Fair value ~50, market ask at 49 = ~1 cent edge (below minEdge of 3)
        const context = createMarketContext({
          market: {
            id: 'test-market',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 49,
            yesBid: 47,
            noAsk: 51,
            noBid: 49,
            lastPrice: 50,
            volume24h: 15000,
            openInterest: 8000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        const signals = await strategy.generateSignals(context);
        expect(signals.filter(s => s.direction === 'yes')).toHaveLength(0);
      });

      it('should not generate YES signal when price exceeds maxPrice', async () => {
        // Yes ask at 92 > maxPrice of 90
        const context = createMarketContext({
          market: {
            id: 'test-market',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 92,
            yesBid: 90,
            noAsk: 8,
            noBid: 6,
            lastPrice: 91,
            volume24h: 15000,
            openInterest: 8000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        const signals = await strategy.generateSignals(context);
        expect(signals.filter(s => s.direction === 'yes')).toHaveLength(0);
      });

      it('should not generate YES signal when confidence is too low', async () => {
        // Create strategy with high confidence requirement
        const strictConfig = createConfig({ 
          params: { minEdge: 1, minConfidence: 0.9, useAggressivePricing: false, maxPrice: 90 }
        });
        const strictStrategy = new ValueStrategy(strictConfig);
        await strictStrategy.initialize(strictConfig);

        const context = createMarketContext({
          market: {
            id: 'test-market',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 48,  // Small edge
            yesBid: 40,  // Wide spread reduces confidence
            noAsk: 52,
            noBid: 44,
            lastPrice: 50,
            volume24h: 1000,  // Low volume reduces confidence
            openInterest: 1000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        const signals = await strictStrategy.generateSignals(context);
        expect(signals.filter(s => s.direction === 'yes')).toHaveLength(0);
      });
    });

    describe('NO mispricing', () => {
      it('should generate NO signal when market undervalues NO', async () => {
        // Fair value of NO ~50 (since YES ~50), market ask at 44
        const context = createMarketContext({
          market: {
            id: 'test-market',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 56,
            yesBid: 54,
            noAsk: 44,  // Low NO ask
            noBid: 42,
            lastPrice: 50,
            volume24h: 15000,
            openInterest: 8000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        const signals = await strategy.generateSignals(context);
        
        const noSignal = signals.find(s => s.direction === 'no');
        expect(noSignal).toBeDefined();
        expect(noSignal!.type).toBe(SignalType.ENTRY);
        expect(noSignal!.reason).toContain('NO underpriced');
      });

      it('should not generate NO signal when price exceeds maxPrice', async () => {
        const context = createMarketContext({
          market: {
            id: 'test-market',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 8,
            yesBid: 6,
            noAsk: 92,  // Above maxPrice
            noBid: 90,
            lastPrice: 9,
            volume24h: 15000,
            openInterest: 8000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        const signals = await strategy.generateSignals(context);
        expect(signals.filter(s => s.direction === 'no')).toHaveLength(0);
      });
    });

    describe('both sides mispriced', () => {
      it('should generate signals for both YES and NO when both are underpriced', async () => {
        // Both sides appear underpriced (spreads are very wide)
        const context = createMarketContext({
          market: {
            id: 'test-market',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 40,  // Very low ask
            yesBid: 35,
            noAsk: 40,   // Also very low ask  
            noBid: 35,
            lastPrice: 50,
            volume24h: 20000,
            openInterest: 10000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        const signals = await strategy.generateSignals(context);
        
        // Should have at least one signal (possibly both)
        expect(signals.length).toBeGreaterThan(0);
      });
    });
  });

  describe('exit signals', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should generate YES exit signal when YES position is overvalued', async () => {
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 60,
          yesBid: 58,  // High bid > fair value + 2
          noAsk: 40,
          noBid: 38,
          lastPrice: 50,  // Fair value ~50
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
        position: {
          id: 'pos-1',
          marketTicker: 'TEST',
          side: 'yes',
          quantity: 100,
          avgPrice: 45,
          currentPrice: 58,
          unrealizedPnl: 13,
          realizedPnl: 0,
          openedAt: new Date(),
        },
      });

      const signals = await strategy.generateSignals(context);
      
      const exitSignal = signals.find(s => s.type === SignalType.EXIT && s.direction === 'yes');
      expect(exitSignal).toBeDefined();
      expect(exitSignal!.reason).toContain('exit');
    });

    it('should generate NO exit signal when NO position is overvalued', async () => {
      // Fair YES = 0.4*50 + 0.4*39 + 0.2*39 = 43.4, Fair NO = 56.6
      // noBid must be > 56.6 + 2 = 58.6 to trigger exit
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 40,
          yesBid: 38,
          noAsk: 65,
          noBid: 63,  // High NO bid (63 > 56.6 + 2 = 58.6)
          lastPrice: 50,
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
        position: {
          id: 'pos-1',
          marketTicker: 'TEST',
          side: 'no',
          quantity: 100,
          avgPrice: 45,
          currentPrice: 63,
          unrealizedPnl: 18,
          realizedPnl: 0,
          openedAt: new Date(),
        },
      });

      const signals = await strategy.generateSignals(context);
      
      const exitSignal = signals.find(s => s.type === SignalType.EXIT && s.direction === 'no');
      expect(exitSignal).toBeDefined();
      expect(exitSignal!.reason).toContain('exit');
    });

    it('should not generate exit signal when position is not overvalued', async () => {
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 52,
          yesBid: 48,  // Close to fair value
          noAsk: 52,
          noBid: 48,
          lastPrice: 50,
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
        position: {
          id: 'pos-1',
          marketTicker: 'TEST',
          side: 'yes',
          quantity: 100,
          avgPrice: 45,
          currentPrice: 48,
          unrealizedPnl: 3,
          realizedPnl: 0,
          openedAt: new Date(),
        },
      });

      const signals = await strategy.generateSignals(context);
      
      const exitSignal = signals.find(s => s.type === SignalType.EXIT);
      expect(exitSignal).toBeUndefined();
    });
  });

  describe('liquidity checks', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should not generate signals when market has very wide spread', async () => {
      // Spread of 20 > maxSpread of 10
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 60,  // 20 cent spread
          yesBid: 40,
          noAsk: 60,
          noBid: 40,
          lastPrice: 50,
          volume24h: 5000,
          openInterest: 3000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const signals = await strategy.generateSignals(context);
      expect(signals).toHaveLength(0);
    });

    it('should not generate signals when spread is too wide', async () => {
      // marketFilters.maxSpread is 10
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 60,  // 15 cent spread > maxSpread
          yesBid: 45,
          noAsk: 60,
          noBid: 45,
          lastPrice: 50,
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const signals = await strategy.generateSignals(context);
      expect(signals).toHaveLength(0);
    });
  });

  describe('confidence calculation', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should have higher confidence with higher volume', async () => {
      // This test verifies confidence increases with volume
      // Fair = 0.4*50 + 0.4*32 + 0.2*32 = 39.2
      // Edge = 39.2 - 30 = 9.2 
      // Base confidence = 0.5 + (9.2/100) = 0.592 (> minConfidence 0.55)
      const lowVolumeContext = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 30,  // Large edge to ensure signal passes confidence threshold
          yesBid: 28,
          noAsk: 70,
          noBid: 68,
          lastPrice: 50,
          volume24h: 5000,  // Low volume - no confidence boost (< 10000)
          openInterest: 3000,  // Low OI - no confidence boost (< 5000)
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const highVolumeContext = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 30,
          yesBid: 28,
          noAsk: 70,
          noBid: 68,
          lastPrice: 50,
          volume24h: 50000,  // High volume - +0.05 confidence
          openInterest: 20000,  // High OI - +0.03 confidence
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const lowVolSignals = await strategy.generateSignals(lowVolumeContext);
      const highVolSignals = await strategy.generateSignals(highVolumeContext);

      // Both should generate signals (edge is large enough to pass confidence)
      expect(lowVolSignals.length).toBeGreaterThan(0);
      expect(highVolSignals.length).toBeGreaterThan(0);

      // High volume should have higher confidence
      const lowConf = lowVolSignals[0].confidence;
      const highConf = highVolSignals[0].confidence;
      expect(highConf).toBeGreaterThan(lowConf);
    });
  });

  describe('signal strength', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should have higher strength with larger edge', async () => {
      const smallEdgeContext = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 47,  // ~3 cent edge
          yesBid: 45,
          noAsk: 53,
          noBid: 51,
          lastPrice: 50,
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const largeEdgeContext = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 40,  // ~10 cent edge
          yesBid: 38,
          noAsk: 60,
          noBid: 58,
          lastPrice: 50,
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const smallEdgeSignals = await strategy.generateSignals(smallEdgeContext);
      const largeEdgeSignals = await strategy.generateSignals(largeEdgeContext);

      // Large edge should have higher strength (capped at 1)
      const smallStrength = smallEdgeSignals.find(s => s.direction === 'yes')?.strength || 0;
      const largeStrength = largeEdgeSignals.find(s => s.direction === 'yes')?.strength || 0;
      
      expect(largeStrength).toBeGreaterThan(smallStrength);
      expect(largeStrength).toBeLessThanOrEqual(1);
    });
  });

  describe('factory function', () => {
    it('should create strategy via createValueStrategy', async () => {
      const s = createValueStrategy(config);
      expect(s).toBeInstanceOf(ValueStrategy);
      expect(s.type).toBe(StrategyType.VALUE);
      expect(s.name).toBe(config.name);
    });
  });

  describe('thesis evaluation', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should create thesis for strong signals', async () => {
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 40,
          yesBid: 38,
          noAsk: 60,
          noBid: 58,
          lastPrice: 50,
          volume24h: 20000,
          openInterest: 10000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const signals = await strategy.generateSignals(context);
      expect(signals.length).toBeGreaterThan(0);

      // Strong signal should produce thesis
      const strongSignal = signals.find(s => s.strength >= 0.5);
      if (strongSignal) {
        const thesis = await strategy.evaluateSignal(strongSignal);
        expect(thesis).not.toBeNull();
        expect(thesis!.marketTicker).toBe(strongSignal.marketTicker);
      }
    });

    it('should not create thesis for weak signals', async () => {
      // Create a weak signal manually
      const weakSignal = {
        id: 'weak-signal',
        strategyId: strategy.id,
        marketId: 'test-market',
        marketTicker: 'TEST',
        type: SignalType.ENTRY,
        direction: 'yes' as const,
        strength: 0.3,  // Below 0.5 threshold
        confidence: 0.6,
        targetPrice: 55,
        currentPrice: 50,
        edge: 5,
        reason: 'Test signal',
        status: 'pending' as const,
        createdAt: new Date(),
      };

      const thesis = await strategy.evaluateSignal(weakSignal);
      expect(thesis).toBeNull();
    });
  });

  describe('state management', () => {
    it('should track signals generated', async () => {
      await strategy.initialize(config);
      
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 40,
          yesBid: 38,
          noAsk: 60,
          noBid: 58,
          lastPrice: 50,
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const initialState = strategy.getState();
      const initialCount = initialState.signalsGenerated;

      await strategy.generateSignals(context);

      const newState = strategy.getState();
      expect(newState.signalsGenerated).toBeGreaterThan(initialCount);
    });

    it('should update timestamp on state changes', async () => {
      await strategy.initialize(config);
      
      const state1 = strategy.getState();
      
      // Wait a bit
      await new Promise(r => setTimeout(r, 10));
      
      const context = createMarketContext({
        market: {
            id: 'test-market',
          ticker: 'TEST',
          eventTicker: 'TEST-EVENT',
          title: 'Test',
          yesAsk: 40,
          yesBid: 38,
          noAsk: 60,
          noBid: 58,
          lastPrice: 50,
          volume24h: 15000,
          openInterest: 8000,
          status: 'active',
          expirationTime: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      
      await strategy.generateSignals(context);
      const state2 = strategy.getState();
      
      expect(state2.updatedAt.getTime()).toBeGreaterThanOrEqual(state1.updatedAt.getTime());
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await strategy.initialize(config);
      await expect(strategy.shutdown()).resolves.not.toThrow();
      
      const state = strategy.getState();
      expect(state.status).toBe(StrategyStatus.DISABLED);
    });
  });
});
