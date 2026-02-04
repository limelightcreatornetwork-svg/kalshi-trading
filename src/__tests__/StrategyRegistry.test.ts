import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StrategyRegistry,
  StrategyRegistryConfig,
  StrategyRegistryEvents,
} from '../services/StrategyRegistry';
import {
  Strategy,
  StrategyType,
  StrategyStatus,
  StrategyConfig,
  StrategyState,
  StrategyRegistration,
  StrategyContext,
  StrategyEvent,
  StrategyEventType,
  Signal,
  SignalType,
  SignalStatus,
} from '../types/strategy';
import { Thesis, ThesisStatus } from '../types/thesis';
import { KillSwitchService } from '../services/KillSwitchService';
import { createStrategyRegistry, InMemoryKillSwitchStorage } from './helpers/test-factories';
import { KillSwitchLevel, KillSwitchReason } from '../types/killswitch';

// Create a mock strategy implementation
function createMockStrategy(overrides?: Partial<Strategy>): Strategy {
  const state: StrategyState = {
    id: 'mock-strategy-1',
    configId: 'mock-config-1',
    status: StrategyStatus.ACTIVE,
    errorCount: 0,
    signalsGenerated: 0,
    tradesExecuted: 0,
    tradesRejected: 0,
    pnlToday: 0,
    updatedAt: new Date(),
  };

  return {
    id: 'mock-strategy-1',
    type: StrategyType.VALUE,
    name: 'Mock Strategy',
    description: 'A mock strategy for testing',
    initialize: vi.fn().mockResolvedValue(undefined),
    generateSignals: vi.fn().mockResolvedValue([]),
    evaluateSignal: vi.fn().mockResolvedValue(null),
    onEvent: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue(state),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockSignal(overrides?: Partial<Signal>): Signal {
  return {
    id: `signal-${Date.now()}`,
    strategyId: 'mock-strategy-1',
    marketId: 'market-123',
    marketTicker: 'TEST-MARKET',
    type: SignalType.ENTRY,
    direction: 'yes',
    strength: 0.8,
    confidence: 0.75,
    targetPrice: 55,
    currentPrice: 50,
    edge: 5,
    reason: 'Test signal',
    status: SignalStatus.PENDING,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockThesis(): Thesis {
  return {
    id: `thesis-${Date.now()}`,
    status: ThesisStatus.ACTIVE,
    marketTicker: 'TEST-MARKET',
    marketTitle: 'Test Market',
    side: 'yes',
    targetProbability: 0.6,
    currentProbability: 0.5,
    confidence: 0.75,
    rationale: 'Test rationale',
    keyAssumptions: ['Assumption 1'],
    invalidationCriteria: ['If price drops below 40'],
    evaluation: {
      isValid: true,
      confidenceAdjustment: 0,
      notes: 'Valid thesis',
    },
    maxPositionSize: 100,
    suggestedEntry: 50,
    suggestedExit: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  };
}

function createMockConfig(overrides?: Partial<StrategyConfig>): StrategyConfig {
  return {
    id: 'config-1',
    name: 'Test Config',
    type: StrategyType.VALUE,
    enabled: true,
    autoExecute: false,
    maxOrdersPerHour: 10,
    maxPositionSize: 100,
    maxNotionalPerTrade: 1000,
    minEdge: 3,
    minConfidence: 0.6,
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

function createMockContext(overrides?: Partial<StrategyContext>): StrategyContext {
  return {
    market: {
      id: 'market-123',
      ticker: 'TEST-MARKET',
      title: 'Test Market',
      category: 'politics',
      yesBid: 48,
      yesAsk: 50,
      noBid: 48,
      noAsk: 50,
      lastPrice: 49,
      volume24h: 10000,
      openInterest: 5000,
    },
    limits: {
      maxPositionSize: 100,
      maxNotional: 1000,
      remainingBudget: 5000,
    },
    timestamp: new Date(),
    ...overrides,
  };
}

describe('StrategyRegistry', () => {
  let registry: StrategyRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    registry = new StrategyRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Constructor & Configuration
  // =========================================================================
  describe('constructor', () => {
    it('should create registry with default config', () => {
      const registry = new StrategyRegistry();
      const status = registry.getStatus();

      expect(status.activeStrategies).toBe(0);
      expect(status.pendingSignals).toBe(0);
    });

    it('should accept custom config', () => {
      const customConfig: Partial<StrategyRegistryConfig> = {
        maxActiveStrategies: 5,
        signalExpiryMs: 30000,
      };

      const registry = new StrategyRegistry(customConfig);
      expect(registry).toBeDefined();
    });

    it('should accept event handlers', () => {
      const events: StrategyRegistryEvents = {
        onSignalGenerated: vi.fn(),
        onSignalApproved: vi.fn(),
        onSignalRejected: vi.fn(),
        onStrategyError: vi.fn(),
        onStrategyStatusChange: vi.fn(),
      };

      const registry = new StrategyRegistry({}, events);
      expect(registry).toBeDefined();
    });
  });

  // =========================================================================
  // createStrategyRegistry factory
  // =========================================================================
  describe('createStrategyRegistry', () => {
    it('should create a new registry instance', () => {
      const registry = createStrategyRegistry();
      expect(registry).toBeInstanceOf(StrategyRegistry);
    });

    it('should accept config and events', () => {
      const events = { onSignalGenerated: vi.fn() };
      const registry = createStrategyRegistry({ maxActiveStrategies: 20 }, events);
      expect(registry).toBeInstanceOf(StrategyRegistry);
    });
  });

  // =========================================================================
  // setDependencies
  // =========================================================================
  describe('setDependencies', () => {
    it('should set kill switch service', () => {
      const killSwitch = new KillSwitchService();
      registry.setDependencies({ killSwitchService: killSwitch });
      // No direct way to verify, but should not throw
      expect(true).toBe(true);
    });

    it('should set position cap service', () => {
      registry.setDependencies({ positionCapService: {} as any });
      expect(true).toBe(true);
    });
  });

  // =========================================================================
  // registerStrategy
  // =========================================================================
  describe('registerStrategy', () => {
    it('should register a strategy type', () => {
      const mockStrategy = createMockStrategy();
      const registration: StrategyRegistration = {
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: { minEdge: 2 },
      };

      registry.registerStrategy(registration);
      // Registration is successful if activation works
    });

    it('should allow registering multiple strategy types', () => {
      const valueStrategy = createMockStrategy({ type: StrategyType.VALUE });
      const newsStrategy = createMockStrategy({ type: StrategyType.NEWS });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => valueStrategy,
        defaultConfig: {},
      });

      registry.registerStrategy({
        type: StrategyType.NEWS,
        factory: () => newsStrategy,
        defaultConfig: {},
      });

      // Both should be registered
    });
  });

  // =========================================================================
  // activateStrategy
  // =========================================================================
  describe('activateStrategy', () => {
    beforeEach(() => {
      const mockStrategy = createMockStrategy();
      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: { minEdge: 2 },
      });
    });

    it('should activate a registered strategy', async () => {
      const config = createMockConfig();
      const strategy = await registry.activateStrategy(config);

      expect(strategy).toBeDefined();
      expect(strategy.type).toBe(StrategyType.VALUE);
    });

    it('should call strategy.initialize with merged config', async () => {
      const mockStrategy = createMockStrategy();
      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: { minEdge: 5 },
      });

      const config = createMockConfig({ minEdge: 3 });
      await registry.activateStrategy(config);

      expect(mockStrategy.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ minEdge: 3 })
      );
    });

    it('should throw when max strategies reached', async () => {
      const smallRegistry = new StrategyRegistry({ maxActiveStrategies: 1 });
      const mockStrategy = createMockStrategy();
      smallRegistry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });

      const config1 = createMockConfig({ id: 'strategy-1' });
      await smallRegistry.activateStrategy(config1);

      const config2 = createMockConfig({ id: 'strategy-2' });
      await expect(smallRegistry.activateStrategy(config2)).rejects.toThrow(
        'Maximum active strategies (1) reached'
      );
    });

    it('should throw for unregistered strategy type', async () => {
      const config = createMockConfig({ type: StrategyType.NEWS });
      await expect(registry.activateStrategy(config)).rejects.toThrow(
        'No registration found for strategy type: NEWS'
      );
    });

    it('should track active strategy count', async () => {
      const config = createMockConfig();
      await registry.activateStrategy(config);

      const status = registry.getStatus();
      expect(status.activeStrategies).toBe(1);
    });
  });

  // =========================================================================
  // deactivateStrategy
  // =========================================================================
  describe('deactivateStrategy', () => {
    let mockStrategy: Strategy;

    beforeEach(async () => {
      mockStrategy = createMockStrategy();
      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig());
    });

    it('should deactivate an active strategy', async () => {
      await registry.deactivateStrategy('config-1');

      const status = registry.getStatus();
      expect(status.activeStrategies).toBe(0);
    });

    it('should call strategy.shutdown', async () => {
      await registry.deactivateStrategy('config-1');
      expect(mockStrategy.shutdown).toHaveBeenCalled();
    });

    it('should handle deactivating non-existent strategy', async () => {
      await registry.deactivateStrategy('non-existent');
      // Should not throw
      expect(true).toBe(true);
    });

    it('should remove strategy config', async () => {
      await registry.deactivateStrategy('config-1');
      const config = registry.getStrategyConfig('config-1');
      expect(config).toBeUndefined();
    });
  });

  // =========================================================================
  // pauseStrategy & resumeStrategy
  // =========================================================================
  describe('pauseStrategy', () => {
    let mockStrategy: Strategy;
    let statusChangeHandler: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      mockStrategy = createMockStrategy();
      statusChangeHandler = vi.fn();

      const registryWithEvents = new StrategyRegistry(
        {},
        { onStrategyStatusChange: statusChangeHandler }
      );
      registryWithEvents.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registryWithEvents.activateStrategy(createMockConfig());
      registry = registryWithEvents;
    });

    it('should send kill switch event to strategy', async () => {
      await registry.pauseStrategy('config-1');

      expect(mockStrategy.onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: StrategyEventType.KILL_SWITCH_TRIGGERED,
          data: { reason: 'Manual pause' },
        })
      );
    });

    it('should trigger status change callback', async () => {
      await registry.pauseStrategy('config-1');

      expect(statusChangeHandler).toHaveBeenCalledWith(
        mockStrategy,
        StrategyStatus.PAUSED
      );
    });

    it('should handle pausing non-existent strategy', async () => {
      await registry.pauseStrategy('non-existent');
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('resumeStrategy', () => {
    let mockStrategy: Strategy;
    let statusChangeHandler: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      mockStrategy = createMockStrategy();
      statusChangeHandler = vi.fn();

      const registryWithEvents = new StrategyRegistry(
        {},
        { onStrategyStatusChange: statusChangeHandler }
      );
      registryWithEvents.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registryWithEvents.activateStrategy(createMockConfig());
      registry = registryWithEvents;
    });

    it('should trigger status change callback with ACTIVE', async () => {
      await registry.resumeStrategy('config-1');

      expect(statusChangeHandler).toHaveBeenCalledWith(
        mockStrategy,
        StrategyStatus.ACTIVE
      );
    });

    it('should handle resuming non-existent strategy', async () => {
      await registry.resumeStrategy('non-existent');
      // Should not throw
      expect(true).toBe(true);
    });
  });

  // =========================================================================
  // runStrategies
  // =========================================================================
  describe('runStrategies', () => {
    let mockStrategy: Strategy;
    let signalHandler: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const signal = createMockSignal();
      mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([signal]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });
      signalHandler = vi.fn();

      const registryWithEvents = new StrategyRegistry(
        {},
        { onSignalGenerated: signalHandler }
      );
      registryWithEvents.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registryWithEvents.activateStrategy(createMockConfig());
      registry = registryWithEvents;
    });

    it('should run active strategies and collect signals', async () => {
      const context = createMockContext();
      const signals = await registry.runStrategies(context);

      expect(signals.length).toBe(1);
      expect(mockStrategy.generateSignals).toHaveBeenCalledWith(context);
    });

    it('should trigger signal generated callback', async () => {
      const context = createMockContext();
      await registry.runStrategies(context);

      expect(signalHandler).toHaveBeenCalledWith(
        expect.objectContaining({ marketTicker: 'TEST-MARKET' }),
        mockStrategy
      );
    });

    it('should skip disabled strategies', async () => {
      // Deactivate and create a disabled strategy
      await registry.deactivateStrategy('config-1');

      mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([createMockSignal()]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });

      await registry.activateStrategy(createMockConfig({ enabled: false }));

      const context = createMockContext();
      const signals = await registry.runStrategies(context);

      expect(signals.length).toBe(0);
    });

    it('should skip paused strategies', async () => {
      // Make strategy appear paused
      vi.mocked(mockStrategy.getState).mockReturnValue({
        id: 'mock-strategy-1',
        configId: 'config-1',
        status: StrategyStatus.PAUSED,
        errorCount: 0,
        signalsGenerated: 0,
        tradesExecuted: 0,
        tradesRejected: 0,
        pnlToday: 0,
        updatedAt: new Date(),
      });

      const context = createMockContext();
      const signals = await registry.runStrategies(context);

      expect(signals.length).toBe(0);
    });

    it('should filter by blocked categories', async () => {
      await registry.deactivateStrategy('config-1');

      mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([createMockSignal()]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });

      await registry.activateStrategy(
        createMockConfig({ blockedCategories: ['politics'] })
      );

      const context = createMockContext({
        market: { ...createMockContext().market, category: 'politics' },
      });

      const signals = await registry.runStrategies(context);

      expect(signals.length).toBe(0);
    });

    it('should filter by blocked markets', async () => {
      await registry.deactivateStrategy('config-1');

      mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([createMockSignal()]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });

      await registry.activateStrategy(
        createMockConfig({ blockedMarkets: ['TEST-MARKET'] })
      );

      const context = createMockContext();
      const signals = await registry.runStrategies(context);

      expect(signals.length).toBe(0);
    });

    it('should filter by allowed categories when specified', async () => {
      await registry.deactivateStrategy('config-1');

      mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([createMockSignal()]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });

      await registry.activateStrategy(
        createMockConfig({ allowedCategories: ['crypto'] }) // Only crypto allowed
      );

      const context = createMockContext({
        market: { ...createMockContext().market, category: 'politics' },
      });

      const signals = await registry.runStrategies(context);

      expect(signals.length).toBe(0);
    });

    it('should handle strategy errors gracefully', async () => {
      const errorHandler = vi.fn();
      await registry.deactivateStrategy('config-1');

      mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockRejectedValue(new Error('Strategy failed')),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      const registryWithErrors = new StrategyRegistry(
        {},
        { onStrategyError: errorHandler }
      );
      registryWithErrors.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registryWithErrors.activateStrategy(createMockConfig());

      const context = createMockContext();
      const signals = await registryWithErrors.runStrategies(context);

      expect(signals.length).toBe(0);
      expect(errorHandler).toHaveBeenCalledWith(
        mockStrategy,
        expect.any(Error)
      );
    });

    it('should store pending signals', async () => {
      const context = createMockContext();
      await registry.runStrategies(context);

      const pending = registry.getPendingSignals();
      expect(pending.length).toBe(1);
    });
  });

  // =========================================================================
  // evaluateSignal
  // =========================================================================
  describe('evaluateSignal', () => {
    it('should return not found for invalid signal ID', async () => {
      const result = await registry.evaluateSignal('non-existent-signal');

      expect(result.approved).toBe(false);
      expect(result.rejectionReason).toBe('Signal not found');
    });

    it('should evaluate signal and approve when checks pass', async () => {
      const signal = createMockSignal({ strategyId: 'config-1', edge: 5, confidence: 0.75 });
      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([signal]),
        evaluateSignal: vi.fn().mockResolvedValue(createMockThesis()),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'config-1', minEdge: 3, minConfidence: 0.6 }));
      await registry.runStrategies(createMockContext());

      const pending = registry.getPendingSignals();
      const result = await registry.evaluateSignal(pending[0].id);

      expect(result.approved).toBe(true);
      expect(result.thesis).toBeDefined();
      expect(result.checks.passed).toBe(true);
    });

    it('should reject signal with insufficient edge', async () => {
      const lowEdgeSignal = createMockSignal({ strategyId: 'config-1', edge: 1, confidence: 0.8 });
      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([lowEdgeSignal]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'config-1', minEdge: 5, minConfidence: 0.5 }));
      await registry.runStrategies(createMockContext());

      const pending = registry.getPendingSignals();
      const result = await registry.evaluateSignal(pending[0].id);

      expect(result.approved).toBe(false);
      expect(result.checks.blockingCheck).toBe('Minimum Edge');
    });

    it('should reject signal with insufficient confidence', async () => {
      const lowConfidenceSignal = createMockSignal({ strategyId: 'config-1', edge: 10, confidence: 0.3 });
      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([lowConfidenceSignal]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'config-1', minEdge: 1, minConfidence: 0.7 }));
      await registry.runStrategies(createMockContext());

      const pending = registry.getPendingSignals();
      const result = await registry.evaluateSignal(pending[0].id);

      expect(result.approved).toBe(false);
      expect(result.checks.blockingCheck).toBe('Minimum Confidence');
    });

    it('should reject expired signals', async () => {
      const signal = createMockSignal({ strategyId: 'config-1', edge: 5, confidence: 0.8 });
      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([signal]),
        evaluateSignal: vi.fn().mockResolvedValue(createMockThesis()),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'config-1', minEdge: 1, minConfidence: 0.5 }));
      await registry.runStrategies(createMockContext());

      // Fast forward past expiry
      vi.advanceTimersByTime(120000); // 2 minutes

      const pending = registry.getPendingSignals();
      const result = await registry.evaluateSignal(pending[0].id);

      expect(result.approved).toBe(false);
      expect(result.checks.blockingCheck).toBe('Signal Expired');
    });

    it('should check kill switch when service is set', async () => {
      const signal = createMockSignal({ strategyId: 'config-1', edge: 5, confidence: 0.8 });
      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([signal]),
        evaluateSignal: vi.fn().mockResolvedValue(createMockThesis()),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'config-1', minEdge: 1, minConfidence: 0.5 }));

      // Create a kill switch with in-memory storage
      const storage = new InMemoryKillSwitchStorage();
      const killSwitchService = new KillSwitchService(storage);
      // Use request object format with proper enum values
      await killSwitchService.trigger({
        level: KillSwitchLevel.GLOBAL,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'test',
        description: 'Test trigger'
      });
      registry.setDependencies({ killSwitchService });

      await registry.runStrategies(createMockContext());

      const pending = registry.getPendingSignals();
      const result = await registry.evaluateSignal(pending[0].id);

      expect(result.approved).toBe(false);
      expect(result.checks.blockingCheck).toBe('Kill Switch');
    });

    it('should reject when strategy returns no thesis', async () => {
      const signal = createMockSignal({ strategyId: 'config-1', edge: 5, confidence: 0.8 });
      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([signal]),
        evaluateSignal: vi.fn().mockResolvedValue(null),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'config-1', minEdge: 1, minConfidence: 0.5 }));
      await registry.runStrategies(createMockContext());

      const pending = registry.getPendingSignals();
      const result = await registry.evaluateSignal(pending[0].id);

      expect(result.approved).toBe(false);
      expect(result.rejectionReason).toBe('Strategy did not create thesis');
    });

    it('should trigger callbacks on approval', async () => {
      const approveHandler = vi.fn();
      const rejectHandler = vi.fn();

      const registryWithEvents = new StrategyRegistry(
        {},
        { onSignalApproved: approveHandler, onSignalRejected: rejectHandler }
      );

      const signal = createMockSignal({ strategyId: 'config-1', edge: 5, confidence: 0.8 });
      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([signal]),
        evaluateSignal: vi.fn().mockResolvedValue(createMockThesis()),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registryWithEvents.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registryWithEvents.activateStrategy(createMockConfig({ id: 'config-1', minEdge: 1, minConfidence: 0.5 }));
      await registryWithEvents.runStrategies(createMockContext());

      const pending = registryWithEvents.getPendingSignals();
      await registryWithEvents.evaluateSignal(pending[0].id);

      expect(approveHandler).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // dispatchEvent
  // =========================================================================
  describe('dispatchEvent', () => {
    let mockStrategy: Strategy;

    beforeEach(async () => {
      mockStrategy = createMockStrategy();
      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig());
    });

    it('should dispatch event to all active strategies', async () => {
      const event: StrategyEvent = {
        type: StrategyEventType.MARKET_UPDATE,
        timestamp: new Date(),
        data: { ticker: 'TEST' },
      };

      await registry.dispatchEvent(event);

      expect(mockStrategy.onEvent).toHaveBeenCalledWith(event);
    });

    it('should handle errors during event dispatch', async () => {
      const errorHandler = vi.fn();
      await registry.deactivateStrategy('config-1');

      mockStrategy = createMockStrategy({
        onEvent: vi.fn().mockRejectedValue(new Error('Event handling failed')),
      });

      const registryWithErrors = new StrategyRegistry(
        {},
        { onStrategyError: errorHandler }
      );
      registryWithErrors.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registryWithErrors.activateStrategy(createMockConfig());

      const event: StrategyEvent = {
        type: StrategyEventType.KILL_SWITCH_TRIGGERED,
        timestamp: new Date(),
        data: { reason: 'Test' },
      };

      await registryWithErrors.dispatchEvent(event);

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Getters
  // =========================================================================
  describe('getActiveStrategies', () => {
    it('should return empty array when no strategies', () => {
      const strategies = registry.getActiveStrategies();
      expect(strategies).toEqual([]);
    });

    it('should return all active strategies', async () => {
      const mockStrategy = createMockStrategy();
      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig());

      const strategies = registry.getActiveStrategies();
      expect(strategies.length).toBe(1);
    });
  });

  describe('getStrategy', () => {
    it('should return undefined for non-existent strategy', () => {
      const strategy = registry.getStrategy('non-existent');
      expect(strategy).toBeUndefined();
    });

    it('should return strategy by ID', async () => {
      const mockStrategy = createMockStrategy();
      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'my-strategy' }));

      const strategy = registry.getStrategy('my-strategy');
      expect(strategy).toBeDefined();
    });
  });

  describe('getStrategyConfig', () => {
    it('should return undefined for non-existent config', () => {
      const config = registry.getStrategyConfig('non-existent');
      expect(config).toBeUndefined();
    });

    it('should return config by ID', async () => {
      const mockStrategy = createMockStrategy();
      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'my-strategy', minEdge: 7 }));

      const config = registry.getStrategyConfig('my-strategy');
      expect(config?.minEdge).toBe(7);
    });
  });

  describe('getPendingSignals', () => {
    it('should return only pending signals', async () => {
      const pendingSignal1 = createMockSignal({ id: 'signal-1', strategyId: 'config-1', status: SignalStatus.PENDING });
      const pendingSignal2 = createMockSignal({ id: 'signal-2', strategyId: 'config-1', status: SignalStatus.PENDING });

      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn()
          .mockResolvedValueOnce([pendingSignal1])
          .mockResolvedValueOnce([pendingSignal2]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig({ id: 'config-1' }));

      await registry.runStrategies(createMockContext());
      await registry.runStrategies(createMockContext());

      const pending = registry.getPendingSignals();
      // Both are pending initially
      expect(pending.length).toBe(2);
    });
  });

  // =========================================================================
  // cleanupExpiredSignals
  // =========================================================================
  describe('cleanupExpiredSignals', () => {
    it('should mark old pending signals as expired', async () => {
      const oldSignal = createMockSignal({
        createdAt: new Date(Date.now() - 120000), // 2 minutes ago
        status: SignalStatus.PENDING,
      });

      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([oldSignal]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig());
      await registry.runStrategies(createMockContext());

      const removed = registry.cleanupExpiredSignals();
      expect(removed).toBe(1);
    });

    it('should not touch non-pending signals', async () => {
      const approvedSignal = createMockSignal({
        createdAt: new Date(Date.now() - 120000),
        status: SignalStatus.APPROVED,
      });

      const mockStrategy = createMockStrategy({
        generateSignals: vi.fn().mockResolvedValue([approvedSignal]),
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig());
      await registry.runStrategies(createMockContext());

      const removed = registry.cleanupExpiredSignals();
      expect(removed).toBe(0);
    });

    it('should return 0 when no signals to cleanup', () => {
      const removed = registry.cleanupExpiredSignals();
      expect(removed).toBe(0);
    });
  });

  // =========================================================================
  // getStatus
  // =========================================================================
  describe('getStatus', () => {
    it('should return correct status summary', async () => {
      const mockStrategy = createMockStrategy({
        getState: vi.fn().mockReturnValue({
          id: 'mock-strategy-1',
          configId: 'config-1',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => mockStrategy,
        defaultConfig: {},
      });
      await registry.activateStrategy(createMockConfig());

      const status = registry.getStatus();

      expect(status.activeStrategies).toBe(1);
      expect(status.pendingSignals).toBe(0);
      expect(status.byType[StrategyType.VALUE]).toBe(1);
      expect(status.byType[StrategyType.NEWS]).toBe(0);
      expect(status.byStatus[StrategyStatus.ACTIVE]).toBe(1);
      expect(status.byStatus[StrategyStatus.PAUSED]).toBe(0);
    });

    it('should count strategies by type correctly', async () => {
      const valueStrategy = createMockStrategy({
        type: StrategyType.VALUE,
        getState: vi.fn().mockReturnValue({
          id: 'value-1',
          configId: 'config-value',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      const newsStrategy = createMockStrategy({
        type: StrategyType.NEWS,
        getState: vi.fn().mockReturnValue({
          id: 'news-1',
          configId: 'config-news',
          status: StrategyStatus.ACTIVE,
          errorCount: 0,
          signalsGenerated: 0,
          tradesExecuted: 0,
          tradesRejected: 0,
          pnlToday: 0,
          updatedAt: new Date(),
        }),
      });

      registry.registerStrategy({
        type: StrategyType.VALUE,
        factory: () => valueStrategy,
        defaultConfig: {},
      });
      registry.registerStrategy({
        type: StrategyType.NEWS,
        factory: () => newsStrategy,
        defaultConfig: {},
      });

      await registry.activateStrategy(createMockConfig({ id: 'value-config', type: StrategyType.VALUE }));
      await registry.activateStrategy(createMockConfig({ id: 'news-config', type: StrategyType.NEWS }));

      const status = registry.getStatus();

      expect(status.byType[StrategyType.VALUE]).toBe(1);
      expect(status.byType[StrategyType.NEWS]).toBe(1);
    });
  });
});
