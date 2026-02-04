import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseStrategy } from '../services/strategies/BaseStrategy';
import {
  StrategyType,
  StrategyStatus,
  StrategyConfig,
  StrategyContext,
  StrategyEvent,
  StrategyEventType,
  Signal,
  SignalType,
  SignalStatus,
} from '../types/strategy';
import { ThesisStatus } from '../types/thesis';

// Concrete implementation for testing
class TestStrategy extends BaseStrategy {
  private signals: Signal[] = [];

  constructor(id?: string, name?: string) {
    super(
      id || 'test-strategy',
      StrategyType.VALUE,
      name || 'Test Strategy',
      'A test strategy for testing BaseStrategy'
    );
  }

  async generateSignals(context: StrategyContext): Promise<Signal[]> {
    return this.signals;
  }

  // Expose protected methods for testing
  public testCreateSignal(
    context: StrategyContext,
    params: {
      type: SignalType;
      direction: 'yes' | 'no';
      strength: number;
      confidence: number;
      targetPrice: number;
      reason: string;
      evidenceLinks?: string[];
    }
  ): Signal {
    return this.createSignal(context, params);
  }

  public testPassesLiquidityCheck(context: StrategyContext): boolean {
    return this.passesLiquidityCheck(context);
  }

  public testGetMidPrice(bid: number, ask: number): number {
    return this.getMidPrice(bid, ask);
  }

  public testGetSpread(bid: number, ask: number): number {
    return this.getSpread(bid, ask);
  }

  public testPriceToProb(price: number): number {
    return this.priceToProb(price);
  }

  public testProbToPrice(prob: number): number {
    return this.probToPrice(prob);
  }

  public testLog(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    this.log(level, message, data);
  }

  public testRecordError(error: Error): void {
    this.recordError(error);
  }

  public testGenerateFalsificationCriteria(signal: Signal): string {
    return this.generateFalsificationCriteria(signal);
  }

  public setSignalsToReturn(signals: Signal[]): void {
    this.signals = signals;
  }
}

function createConfig(overrides?: Partial<StrategyConfig>): StrategyConfig {
  return {
    id: 'test-config-1',
    name: 'Test Strategy Config',
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
    params: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMarketContext(overrides?: Partial<StrategyContext>): StrategyContext {
  return {
    market: {
      id: 'test-market',
      ticker: 'TEST-MARKET',
      eventTicker: 'TEST-EVENT',
      title: 'Test Market',
      yesAsk: 50,
      yesBid: 48,
      noAsk: 52,
      noBid: 50,
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

function createSignal(overrides?: Partial<Signal>): Signal {
  return {
    id: 'test-signal',
    strategyId: 'test-strategy',
    marketId: 'test-market',
    marketTicker: 'TEST-MARKET',
    type: SignalType.ENTRY,
    direction: 'yes',
    strength: 0.8,
    confidence: 0.75,
    targetPrice: 55,
    currentPrice: 50,
    edge: 5,
    reason: 'Test signal reason',
    status: SignalStatus.PENDING,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('BaseStrategy', () => {
  let strategy: TestStrategy;
  let config: StrategyConfig;

  beforeEach(() => {
    config = createConfig();
    strategy = new TestStrategy();
  });

  describe('constructor', () => {
    it('should initialize with correct values', () => {
      const s = new TestStrategy('my-id', 'My Strategy');
      expect(s.id).toBe('my-id');
      expect(s.name).toBe('My Strategy');
      expect(s.type).toBe(StrategyType.VALUE);
    });

    it('should initialize state correctly', () => {
      const state = strategy.getState();
      expect(state.status).toBe(StrategyStatus.DISABLED);
      expect(state.errorCount).toBe(0);
      expect(state.signalsGenerated).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should set config and activate strategy', async () => {
      await strategy.initialize(config);
      const state = strategy.getState();
      expect(state.status).toBe(StrategyStatus.ACTIVE);
      expect(state.configId).toBe(config.id);
    });
  });

  describe('evaluateSignal', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should create thesis for strong signal', async () => {
      const signal = createSignal({ strength: 0.8, direction: 'yes' });
      const thesis = await strategy.evaluateSignal(signal);
      
      expect(thesis).not.toBeNull();
      expect(thesis!.marketTicker).toBe(signal.marketTicker);
      expect(thesis!.direction).toBe('yes');
      expect(thesis!.confidence).toBe(signal.confidence);
      expect(thesis!.status).toBe(ThesisStatus.ACTIVE);
    });

    it('should return null for weak signal', async () => {
      const signal = createSignal({ strength: 0.3 }); // Below 0.5 threshold
      const thesis = await strategy.evaluateSignal(signal);
      expect(thesis).toBeNull();
    });

    it('should include evidence links in thesis', async () => {
      const signal = createSignal({ 
        strength: 0.8,
        evidenceLinks: ['https://example.com/evidence1', 'https://example.com/evidence2']
      });
      const thesis = await strategy.evaluateSignal(signal);
      
      expect(thesis!.evidenceLinks).toEqual(signal.evidenceLinks);
    });

    it('should use empty array if no evidence links', async () => {
      const signal = createSignal({ strength: 0.8, evidenceLinks: undefined });
      const thesis = await strategy.evaluateSignal(signal);
      
      expect(thesis!.evidenceLinks).toEqual([]);
    });
  });

  describe('generateFalsificationCriteria', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should generate criteria for YES signal', async () => {
      const signal = createSignal({ direction: 'yes', targetPrice: 60 });
      const criteria = strategy.testGenerateFalsificationCriteria(signal);
      
      expect(criteria).toContain('YES');
      expect(criteria).toContain('54'); // 60 - 10% = 54
      expect(criteria).toContain('Invalidate if');
    });

    it('should generate criteria for NO signal', async () => {
      const signal = createSignal({ direction: 'no', targetPrice: 40 });
      const criteria = strategy.testGenerateFalsificationCriteria(signal);
      
      expect(criteria).toContain('NO');
      expect(criteria).toContain('36'); // 40 - 10% = 36
      expect(criteria).toContain('Invalidate if');
    });
  });

  describe('onEvent', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should handle ORDER_FILLED event', async () => {
      const event: StrategyEvent = {
        type: StrategyEventType.ORDER_FILLED,
        timestamp: new Date(),
        data: { orderId: 'order-1' },
      };
      
      await strategy.onEvent(event);
      
      const state = strategy.getState();
      expect(state.tradesExecuted).toBe(1);
      expect(state.lastTradeAt).toBeDefined();
    });

    it('should handle ORDER_REJECTED event', async () => {
      const event: StrategyEvent = {
        type: StrategyEventType.ORDER_REJECTED,
        timestamp: new Date(),
        data: { reason: 'insufficient funds' },
      };
      
      await strategy.onEvent(event);
      
      const state = strategy.getState();
      expect(state.tradesRejected).toBe(1);
    });

    it('should handle KILL_SWITCH_TRIGGERED event', async () => {
      const event: StrategyEvent = {
        type: StrategyEventType.KILL_SWITCH_TRIGGERED,
        timestamp: new Date(),
        data: { reason: 'manual' },
      };
      
      await strategy.onEvent(event);
      
      const state = strategy.getState();
      expect(state.status).toBe(StrategyStatus.PAUSED);
    });

    it('should handle MARKET_UPDATE event', async () => {
      const event: StrategyEvent = {
        type: StrategyEventType.MARKET_UPDATE,
        timestamp: new Date(),
        data: { ticker: 'TEST' },
      };
      
      // Should not throw
      await expect(strategy.onEvent(event)).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should set status to DISABLED', async () => {
      await strategy.shutdown();
      const state = strategy.getState();
      expect(state.status).toBe(StrategyStatus.DISABLED);
    });
  });

  describe('createSignal', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should create YES signal with correct values', () => {
      const context = createMarketContext();
      const signal = strategy.testCreateSignal(context, {
        type: SignalType.ENTRY,
        direction: 'yes',
        strength: 0.8,
        confidence: 0.75,
        targetPrice: 55,
        reason: 'Test reason',
      });

      expect(signal.direction).toBe('yes');
      expect(signal.currentPrice).toBe(50); // yesAsk
      expect(signal.edge).toBe(5); // 55 - 50
      expect(signal.marketTicker).toBe('TEST-MARKET');
      expect(signal.status).toBe(SignalStatus.PENDING);
    });

    it('should create NO signal with correct values', () => {
      const context = createMarketContext();
      const signal = strategy.testCreateSignal(context, {
        type: SignalType.ENTRY,
        direction: 'no',
        strength: 0.7,
        confidence: 0.65,
        targetPrice: 60,
        reason: 'Test NO reason',
      });

      expect(signal.direction).toBe('no');
      expect(signal.currentPrice).toBe(52); // noAsk
      expect(signal.edge).toBe(8); // 60 - 52
    });

    it('should include evidence links when provided', () => {
      const context = createMarketContext();
      const signal = strategy.testCreateSignal(context, {
        type: SignalType.ENTRY,
        direction: 'yes',
        strength: 0.8,
        confidence: 0.75,
        targetPrice: 55,
        reason: 'Test reason',
        evidenceLinks: ['https://example.com/1'],
      });

      expect(signal.evidenceLinks).toEqual(['https://example.com/1']);
    });

    it('should increment signalsGenerated counter', () => {
      const context = createMarketContext();
      const initialState = strategy.getState();
      
      strategy.testCreateSignal(context, {
        type: SignalType.ENTRY,
        direction: 'yes',
        strength: 0.8,
        confidence: 0.75,
        targetPrice: 55,
        reason: 'Test',
      });

      const newState = strategy.getState();
      expect(newState.signalsGenerated).toBe(initialState.signalsGenerated + 1);
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    describe('priceToProb', () => {
      it('should convert price to probability', () => {
        expect(strategy.testPriceToProb(50)).toBe(0.5);
        expect(strategy.testPriceToProb(75)).toBe(0.75);
        expect(strategy.testPriceToProb(0)).toBe(0);
        expect(strategy.testPriceToProb(100)).toBe(1);
      });
    });

    describe('probToPrice', () => {
      it('should convert probability to price', () => {
        expect(strategy.testProbToPrice(0.5)).toBe(50);
        expect(strategy.testProbToPrice(0.75)).toBe(75);
        expect(strategy.testProbToPrice(0)).toBe(0);
        expect(strategy.testProbToPrice(1)).toBe(100);
      });
    });

    describe('getMidPrice', () => {
      it('should calculate mid price', () => {
        expect(strategy.testGetMidPrice(48, 52)).toBe(50);
        expect(strategy.testGetMidPrice(40, 60)).toBe(50);
        expect(strategy.testGetMidPrice(0, 100)).toBe(50);
      });
    });

    describe('getSpread', () => {
      it('should calculate spread', () => {
        expect(strategy.testGetSpread(48, 52)).toBe(4);
        expect(strategy.testGetSpread(40, 60)).toBe(20);
        expect(strategy.testGetSpread(50, 50)).toBe(0);
      });
    });

    describe('passesLiquidityCheck', () => {
      it('should pass when spreads are below maxSpread', () => {
        const context = createMarketContext({
          market: {
            id: 'test',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 52,
            yesBid: 48,  // 4 cent spread
            noAsk: 52,
            noBid: 48,   // 4 cent spread
            lastPrice: 50,
            volume24h: 15000,
            openInterest: 8000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        expect(strategy.testPassesLiquidityCheck(context)).toBe(true);
      });

      it('should fail when YES spread exceeds maxSpread', () => {
        const context = createMarketContext({
          market: {
            id: 'test',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 60,
            yesBid: 45,  // 15 cent spread > maxSpread (10)
            noAsk: 52,
            noBid: 48,
            lastPrice: 50,
            volume24h: 15000,
            openInterest: 8000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        expect(strategy.testPassesLiquidityCheck(context)).toBe(false);
      });

      it('should fail when NO spread exceeds maxSpread', () => {
        const context = createMarketContext({
          market: {
            id: 'test',
            ticker: 'TEST',
            eventTicker: 'TEST-EVENT',
            title: 'Test',
            yesAsk: 52,
            yesBid: 48,
            noAsk: 65,
            noBid: 50,   // 15 cent spread > maxSpread (10)
            lastPrice: 50,
            volume24h: 15000,
            openInterest: 8000,
            status: 'active',
            expirationTime: new Date(Date.now() + 86400000).toISOString(),
          },
        });

        expect(strategy.testPassesLiquidityCheck(context)).toBe(false);
      });
    });
  });

  describe('logging', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should log info messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      strategy.testLog('info', 'Test info message', { data: 'value' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[Test Strategy]', 'Test info message', { data: 'value' });
      consoleSpy.mockRestore();
    });

    it('should log warn messages', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      strategy.testLog('warn', 'Test warning message', { warning: true });
      
      expect(consoleSpy).toHaveBeenCalledWith('[Test Strategy]', 'Test warning message', { warning: true });
      consoleSpy.mockRestore();
    });

    it('should log error messages', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      strategy.testLog('error', 'Test error message', { error: 'details' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[Test Strategy]', 'Test error message', { error: 'details' });
      consoleSpy.mockRestore();
    });

    it('should log without data when not provided', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      strategy.testLog('info', 'Message without data');
      
      expect(consoleSpy).toHaveBeenCalledWith('[Test Strategy]', 'Message without data', '');
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await strategy.initialize(config);
    });

    it('should record errors and increment counter', () => {
      const error = new Error('Test error');
      strategy.testRecordError(error);
      
      const state = strategy.getState();
      expect(state.errorCount).toBe(1);
      expect(state.lastError).toBe('Test error');
      expect(state.lastErrorAt).toBeDefined();
    });

    it('should auto-pause after 10 errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Record 10 errors
      for (let i = 0; i < 10; i++) {
        strategy.testRecordError(new Error(`Error ${i}`));
      }
      
      const state = strategy.getState();
      expect(state.status).toBe(StrategyStatus.ERROR);
      expect(state.errorCount).toBe(10);
      
      consoleSpy.mockRestore();
    });

    it('should not auto-pause before 10 errors', () => {
      // Record 9 errors
      for (let i = 0; i < 9; i++) {
        strategy.testRecordError(new Error(`Error ${i}`));
      }
      
      const state = strategy.getState();
      expect(state.status).toBe(StrategyStatus.ACTIVE);
      expect(state.errorCount).toBe(9);
    });
  });

  describe('getState', () => {
    it('should return a copy of state', async () => {
      await strategy.initialize(config);
      
      const state1 = strategy.getState();
      const state2 = strategy.getState();
      
      // Should be equal but not the same object
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });
});
