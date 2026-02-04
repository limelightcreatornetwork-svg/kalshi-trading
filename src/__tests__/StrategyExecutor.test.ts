// Strategy Executor Tests
// Tests for signal lifecycle, risk evaluation, and order execution

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrategyExecutor, OrderSubmitter } from '../services/StrategyExecutor';
import { StrategyRegistry } from '../services/StrategyRegistry';
import {
  StrategyManagementService,
  InMemoryStrategyConfigStorage,
  InMemoryStrategyStateStorage,
} from '../services/StrategyManagementService';
import {
  StrategyConfig,
  StrategyType,
  StrategyStatus,
  StrategyState,
  StrategyContext,
  StrategyEventType,
  Signal,
  SignalType,
  SignalStatus,
} from '../types/strategy';

// ─── Helpers ────────────────────────────────────────────────────────

function makeContext(overrides: Partial<StrategyContext> = {}): StrategyContext {
  return {
    market: {
      id: 'market-1',
      ticker: 'TICKER-A',
      title: 'Test Market',
      yesBid: 45,
      yesAsk: 48,
      noBid: 50,
      noAsk: 53,
      lastPrice: 46,
      volume24h: 10000,
      openInterest: 5000,
    },
    limits: {
      maxPositionSize: 100,
      maxNotional: 5000,
      remainingBudget: 10000,
    },
    timestamp: new Date(),
    ...overrides,
  };
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: crypto.randomUUID(),
    strategyId: 'strategy-1',
    marketId: 'market-1',
    marketTicker: 'TICKER-A',
    type: SignalType.ENTRY,
    direction: 'yes',
    strength: 0.8,
    confidence: 0.75,
    targetPrice: 45,
    currentPrice: 48,
    edge: 3,
    reason: 'Test signal',
    status: SignalStatus.PENDING,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockOrderSubmitter(): OrderSubmitter {
  return {
    submitOrder: vi.fn().mockResolvedValue({ orderId: 'order-123', filled: true }),
  };
}

describe('StrategyExecutor', () => {
  let registry: StrategyRegistry;
  let management: StrategyManagementService;
  let executor: StrategyExecutor;

  beforeEach(() => {
    registry = new StrategyRegistry();
    management = new StrategyManagementService(
      new InMemoryStrategyConfigStorage(),
      new InMemoryStrategyStateStorage()
    );
    executor = new StrategyExecutor(registry, management);
  });

  // ─── Basic Run ────────────────────────────────────────────────

  describe('run', () => {
    it('should return empty results when no strategies registered', async () => {
      const result = await executor.run(makeContext());

      expect(result.signals).toHaveLength(0);
      expect(result.executions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should prevent concurrent runs', async () => {
      // Start a run that takes some time
      const slowRegistry = new StrategyRegistry();
      vi.spyOn(slowRegistry, 'runStrategies').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 50))
      );

      const slowExecutor = new StrategyExecutor(slowRegistry, management);

      // Start first run (don't await)
      const run1 = slowExecutor.run(makeContext());

      // Immediately try second run
      const run2 = await slowExecutor.run(makeContext());

      expect(run2.errors).toContain('Executor already running');

      await run1; // Clean up
    });

    it('should track total runs', async () => {
      await executor.run(makeContext());
      await executor.run(makeContext());

      const status = executor.getStatus();
      expect(status.totalRuns).toBe(2);
    });
  });

  // ─── Signal Evaluation ────────────────────────────────────────

  describe('signal evaluation', () => {
    it('should evaluate signals through registry', async () => {
      const signal = makeSignal();

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: false,
        checks: { passed: false, checks: [], blockingCheck: 'Minimum Edge' },
        rejectionReason: 'Minimum Edge',
      });

      const result = await executor.run(makeContext());

      expect(result.executions).toHaveLength(1);
      expect(result.executions[0].approved).toBe(false);
      expect(result.executions[0].rejectionReason).toBe('Minimum Edge');
    });

    it('should not execute when autoExecute is off', async () => {
      const signal = makeSignal();
      const thesis = { id: 'thesis-1' };

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: thesis as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: false,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await executor.run(makeContext());

      expect(result.executions[0].approved).toBe(true);
      expect(result.executions[0].executed).toBe(false);
    });
  });

  // ─── Auto-Execution ───────────────────────────────────────────

  describe('auto-execution', () => {
    it('should execute when autoExecute is on and order submitter exists', async () => {
      const signal = makeSignal();
      const thesis = { id: 'thesis-1' };
      const orderSubmitter = createMockOrderSubmitter();
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: thesis as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);

      const result = await executorWithOrders.run(makeContext());

      expect(result.executions[0].executed).toBe(true);
      expect(result.executions[0].orderId).toBe('order-123');
      expect(orderSubmitter.submitOrder).toHaveBeenCalled();
    });

    it('should report error when order submission fails', async () => {
      const signal = makeSignal();
      const orderSubmitter: OrderSubmitter = {
        submitOrder: vi.fn().mockRejectedValue(new Error('Insufficient funds')),
      };
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: { id: 'thesis-1' } as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);

      const result = await executorWithOrders.run(makeContext());

      expect(result.executions[0].approved).toBe(true);
      expect(result.executions[0].executed).toBe(false);
      expect(result.executions[0].error).toBe('Insufficient funds');
    });

    it('should report error when no order submitter configured', async () => {
      const signal = makeSignal();

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: { id: 'thesis-1' } as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await executor.run(makeContext());

      expect(result.executions[0].error).toBe('No order submitter configured');
    });
  });

  // ─── Status ───────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return initial status', () => {
      const status = executor.getStatus();

      expect(status.running).toBe(false);
      expect(status.totalRuns).toBe(0);
      expect(status.totalSignals).toBe(0);
      expect(status.totalExecutions).toBe(0);
    });

    it('should track signals and executions', async () => {
      const signal = makeSignal();
      const orderSubmitter = createMockOrderSubmitter();
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: { id: 'thesis-1' } as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);

      await executorWithOrders.run(makeContext());

      const status = executorWithOrders.getStatus();
      expect(status.totalSignals).toBe(1);
      expect(status.totalExecutions).toBe(1);
      expect(status.lastRunAt).toBeDefined();
    });
  });

  // ─── syncStrategies ──────────────────────────────────────────

  describe('syncStrategies (via run)', () => {
    it('should deactivate strategies no longer enabled', async () => {
      // Register a strategy in the registry that's not in management
      const mockStrategy = {
        id: 'old-strategy',
        type: StrategyType.VALUE,
        name: 'Old',
        description: '',
        initialize: vi.fn(),
        generateSignals: vi.fn().mockResolvedValue([]),
        evaluateSignal: vi.fn(),
        onEvent: vi.fn(),
        getState: vi.fn(),
        shutdown: vi.fn(),
      };

      vi.spyOn(registry, 'getActiveStrategies').mockReturnValue([mockStrategy]);
      vi.spyOn(registry, 'runStrategies').mockResolvedValue([]);
      const deactivateSpy = vi.spyOn(registry, 'deactivateStrategy').mockResolvedValue(undefined);

      // Management returns empty list (no enabled strategies)
      vi.spyOn(management, 'listStrategies').mockResolvedValue([]);

      await executor.run(makeContext());

      expect(deactivateSpy).toHaveBeenCalledWith('old-strategy');
    });

    it('should activate new enabled strategies', async () => {
      vi.spyOn(registry, 'getActiveStrategies').mockReturnValue([]);
      vi.spyOn(registry, 'runStrategies').mockResolvedValue([]);
      const activateSpy = vi.spyOn(registry, 'activateStrategy').mockResolvedValue({} as any);

      const config: StrategyConfig = {
        id: 'new-strategy',
        name: 'New',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: false,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(management, 'listStrategies').mockResolvedValue([
        {
          config,
          state: {
            id: 's1',
            configId: 'new-strategy',
            status: StrategyStatus.ACTIVE,
            errorCount: 0,
            signalsGenerated: 0,
            tradesExecuted: 0,
            tradesRejected: 0,
            pnlToday: 0,
            updatedAt: new Date(),
          },
        },
      ]);

      await executor.run(makeContext());

      expect(activateSpy).toHaveBeenCalledWith(config);
    });

    it('should silently skip strategies whose type is not registered', async () => {
      vi.spyOn(registry, 'getActiveStrategies').mockReturnValue([]);
      vi.spyOn(registry, 'runStrategies').mockResolvedValue([]);
      vi.spyOn(registry, 'activateStrategy').mockRejectedValue(new Error('Unknown type'));

      const config: StrategyConfig = {
        id: 'unknown-type',
        name: 'Unknown',
        type: 'CUSTOM' as StrategyType,
        enabled: true,
        autoExecute: false,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(management, 'listStrategies').mockResolvedValue([
        {
          config,
          state: {
            id: 's1',
            configId: 'unknown-type',
            status: StrategyStatus.DISABLED,
            errorCount: 0,
            signalsGenerated: 0,
            tradesExecuted: 0,
            tradesRejected: 0,
            pnlToday: 0,
            updatedAt: new Date(),
          },
        },
      ]);

      // Should not throw
      const result = await executor.run(makeContext());
      expect(result.errors).toHaveLength(0);
    });

    it('should not deactivate strategies that are still enabled', async () => {
      const mockStrategy = {
        id: 'active-strategy',
        type: StrategyType.VALUE,
        name: 'Active',
        description: '',
        initialize: vi.fn(),
        generateSignals: vi.fn().mockResolvedValue([]),
        evaluateSignal: vi.fn(),
        onEvent: vi.fn(),
        getState: vi.fn(),
        shutdown: vi.fn(),
      };

      vi.spyOn(registry, 'getActiveStrategies').mockReturnValue([mockStrategy]);
      vi.spyOn(registry, 'runStrategies').mockResolvedValue([]);
      const deactivateSpy = vi.spyOn(registry, 'deactivateStrategy').mockResolvedValue(undefined);

      vi.spyOn(management, 'listStrategies').mockResolvedValue([
        {
          config: {
            id: 'active-strategy',
            name: 'Active',
            type: StrategyType.VALUE,
            enabled: true,
            autoExecute: false,
            maxOrdersPerHour: 10,
            maxPositionSize: 100,
            maxNotionalPerTrade: 5000,
            minEdge: 2,
            minConfidence: 0.55,
            maxSpread: 10,
            minLiquidity: 50,
            allowedCategories: [],
            blockedCategories: [],
            blockedMarkets: [],
            params: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          state: {
            id: 's1',
            configId: 'active-strategy',
            status: StrategyStatus.ACTIVE,
            errorCount: 0,
            signalsGenerated: 0,
            tradesExecuted: 0,
            tradesRejected: 0,
            pnlToday: 0,
            updatedAt: new Date(),
          },
        },
      ]);

      await executor.run(makeContext());

      expect(deactivateSpy).not.toHaveBeenCalled();
    });
  });

  // ─── updateStrategyState ──────────────────────────────────────

  describe('updateStrategyState (via run)', () => {
    function setupSignalRun(
      executorInstance: StrategyExecutor,
      signalOverrides: Partial<Signal> = {},
      evalResult: { approved: boolean; thesis?: any; rejectionReason?: string } = { approved: false, rejectionReason: 'Test' },
      configOverrides: Partial<StrategyConfig> = {},
    ) {
      const signal = makeSignal(signalOverrides);

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: evalResult.approved,
        checks: { passed: evalResult.approved, checks: [] },
        thesis: evalResult.thesis,
        rejectionReason: evalResult.rejectionReason,
      });

      if (evalResult.approved) {
        vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
          id: 'strategy-1',
          name: 'Test',
          type: StrategyType.VALUE,
          enabled: true,
          autoExecute: false,
          maxOrdersPerHour: 10,
          maxPositionSize: 100,
          maxNotionalPerTrade: 5000,
          minEdge: 2,
          minConfidence: 0.55,
          maxSpread: 10,
          minLiquidity: 50,
          allowedCategories: [],
          blockedCategories: [],
          blockedMarkets: [],
          params: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          ...configOverrides,
        });
      }

      return signal;
    }

    it('should return early if strategy not found in management', async () => {
      setupSignalRun(executor, {}, { approved: false, rejectionReason: 'Edge' });
      vi.spyOn(management, 'getStrategy').mockResolvedValue(null);
      const updateStateSpy = vi.spyOn(management, 'updateState');

      const result = await executor.run(makeContext());

      expect(result.executions).toHaveLength(1);
      expect(updateStateSpy).not.toHaveBeenCalled();
    });

    it('should increment signalsGenerated on each signal', async () => {
      setupSignalRun(executor, {}, { approved: false, rejectionReason: 'Edge' });

      const state: StrategyState = {
        id: 's1',
        configId: 'strategy-1',
        status: StrategyStatus.ACTIVE,
        errorCount: 0,
        signalsGenerated: 5,
        tradesExecuted: 2,
        tradesRejected: 1,
        pnlToday: 100,
        updatedAt: new Date(),
      };

      vi.spyOn(management, 'getStrategy').mockResolvedValue({
        config: {} as any,
        state,
      });
      const updateStateSpy = vi.spyOn(management, 'updateState').mockResolvedValue(state);

      await executor.run(makeContext());

      expect(updateStateSpy).toHaveBeenCalledWith('strategy-1', expect.objectContaining({
        signalsGenerated: 6,
      }));
    });

    it('should increment tradesRejected when signal not approved', async () => {
      setupSignalRun(executor, {}, { approved: false, rejectionReason: 'Edge too low' });

      const state: StrategyState = {
        id: 's1',
        configId: 'strategy-1',
        status: StrategyStatus.ACTIVE,
        errorCount: 0,
        signalsGenerated: 3,
        tradesExecuted: 1,
        tradesRejected: 0,
        pnlToday: 50,
        updatedAt: new Date(),
      };

      vi.spyOn(management, 'getStrategy').mockResolvedValue({
        config: {} as any,
        state,
      });
      const updateStateSpy = vi.spyOn(management, 'updateState').mockResolvedValue(state);

      await executor.run(makeContext());

      expect(updateStateSpy).toHaveBeenCalledWith('strategy-1', expect.objectContaining({
        tradesRejected: 1,
      }));
    });

    it('should increment tradesExecuted when order is executed', async () => {
      const orderSubmitter = createMockOrderSubmitter();
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      setupSignalRun(executorWithOrders, {}, { approved: true, thesis: { id: 't1' } }, { autoExecute: true });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);

      const state: StrategyState = {
        id: 's1',
        configId: 'strategy-1',
        status: StrategyStatus.ACTIVE,
        errorCount: 0,
        signalsGenerated: 3,
        tradesExecuted: 5,
        tradesRejected: 0,
        pnlToday: 200,
        updatedAt: new Date(),
      };

      vi.spyOn(management, 'getStrategy').mockResolvedValue({
        config: {} as any,
        state,
      });
      const updateStateSpy = vi.spyOn(management, 'updateState').mockResolvedValue(state);

      await executorWithOrders.run(makeContext());

      expect(updateStateSpy).toHaveBeenCalledWith('strategy-1', expect.objectContaining({
        tradesExecuted: 6,
        lastTradeAt: expect.any(Date),
      }));
    });

    it('should track errors and set lastError', async () => {
      const orderSubmitter: OrderSubmitter = {
        submitOrder: vi.fn().mockRejectedValue(new Error('API down')),
      };
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      setupSignalRun(executorWithOrders, {}, { approved: true, thesis: { id: 't1' } }, { autoExecute: true });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);

      const state: StrategyState = {
        id: 's1',
        configId: 'strategy-1',
        status: StrategyStatus.ACTIVE,
        errorCount: 3,
        signalsGenerated: 10,
        tradesExecuted: 5,
        tradesRejected: 2,
        pnlToday: 100,
        updatedAt: new Date(),
      };

      vi.spyOn(management, 'getStrategy').mockResolvedValue({
        config: {} as any,
        state,
      });
      const updateStateSpy = vi.spyOn(management, 'updateState').mockResolvedValue(state);

      await executorWithOrders.run(makeContext());

      expect(updateStateSpy).toHaveBeenCalledWith('strategy-1', expect.objectContaining({
        errorCount: 4,
        lastError: 'API down',
        lastErrorAt: expect.any(Date),
      }));
    });

    it('should auto-pause strategy after 10+ errors', async () => {
      const orderSubmitter: OrderSubmitter = {
        submitOrder: vi.fn().mockRejectedValue(new Error('Persistent failure')),
      };
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      setupSignalRun(executorWithOrders, {}, { approved: true, thesis: { id: 't1' } }, { autoExecute: true });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);

      const state: StrategyState = {
        id: 's1',
        configId: 'strategy-1',
        status: StrategyStatus.ACTIVE,
        errorCount: 9, // Will become 10 after this error
        signalsGenerated: 20,
        tradesExecuted: 5,
        tradesRejected: 2,
        pnlToday: -50,
        updatedAt: new Date(),
      };

      vi.spyOn(management, 'getStrategy').mockResolvedValue({
        config: {} as any,
        state,
      });
      const updateStateSpy = vi.spyOn(management, 'updateState').mockResolvedValue(state);

      await executorWithOrders.run(makeContext());

      expect(updateStateSpy).toHaveBeenCalledWith('strategy-1', expect.objectContaining({
        errorCount: 10,
        status: StrategyStatus.ERROR,
      }));
    });

    it('should not auto-pause when error count is below 10', async () => {
      const orderSubmitter: OrderSubmitter = {
        submitOrder: vi.fn().mockRejectedValue(new Error('Temp failure')),
      };
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      setupSignalRun(executorWithOrders, {}, { approved: true, thesis: { id: 't1' } }, { autoExecute: true });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);

      const state: StrategyState = {
        id: 's1',
        configId: 'strategy-1',
        status: StrategyStatus.ACTIVE,
        errorCount: 5,
        signalsGenerated: 10,
        tradesExecuted: 3,
        tradesRejected: 1,
        pnlToday: 0,
        updatedAt: new Date(),
      };

      vi.spyOn(management, 'getStrategy').mockResolvedValue({
        config: {} as any,
        state,
      });
      const updateStateSpy = vi.spyOn(management, 'updateState').mockResolvedValue(state);

      await executorWithOrders.run(makeContext());

      const call = updateStateSpy.mock.calls[0][1];
      expect(call.errorCount).toBe(6);
      expect(call.status).toBeUndefined();
    });
  });

  // ─── Signal Evaluation Errors ─────────────────────────────────

  describe('signal evaluation error handling', () => {
    it('should catch errors from evaluateAndExecute and add to errors array', async () => {
      const signal = makeSignal();

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockRejectedValue(new Error('Evaluation crash'));

      const result = await executor.run(makeContext());

      expect(result.executions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Evaluation crash');
    });

    it('should handle non-Error throws in signal evaluation', async () => {
      const signal = makeSignal();

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockRejectedValue('string error');

      const result = await executor.run(makeContext());

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('string error');
    });

    it('should continue processing remaining signals after one fails', async () => {
      const signal1 = makeSignal({ id: 'signal-1' });
      const signal2 = makeSignal({ id: 'signal-2' });

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal1, signal2]);
      vi.spyOn(registry, 'evaluateSignal')
        .mockRejectedValueOnce(new Error('First fails'))
        .mockResolvedValueOnce({
          approved: false,
          checks: { passed: false, checks: [], blockingCheck: 'Edge' },
          rejectionReason: 'Edge',
        });
      vi.spyOn(management, 'getStrategy').mockResolvedValue(null);

      const result = await executor.run(makeContext());

      expect(result.errors).toHaveLength(1);
      expect(result.executions).toHaveLength(1);
      expect(result.executions[0].signalId).toBe('signal-2');
    });
  });

  // ─── Order Execution Details ──────────────────────────────────

  describe('order execution details', () => {
    it('should use market pricing when useAggressivePricing is true', async () => {
      const signal = makeSignal({ targetPrice: 50 });
      const orderSubmitter = createMockOrderSubmitter();
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: { id: 't1' } as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: { useAggressivePricing: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);
      vi.spyOn(management, 'getStrategy').mockResolvedValue(null);

      await executorWithOrders.run(makeContext());

      expect(orderSubmitter.submitOrder).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'market' })
      );
    });

    it('should dispatch ORDER_REJECTED event on order failure', async () => {
      const signal = makeSignal();
      const orderSubmitter: OrderSubmitter = {
        submitOrder: vi.fn().mockRejectedValue(new Error('Exchange down')),
      };
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: { id: 't1' } as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const dispatchSpy = vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);
      vi.spyOn(management, 'getStrategy').mockResolvedValue(null);

      await executorWithOrders.run(makeContext());

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: StrategyEventType.ORDER_REJECTED,
          data: expect.objectContaining({
            error: 'Exchange down',
          }),
        })
      );
    });

    it('should dispatch ORDER_FILLED event on successful execution', async () => {
      const signal = makeSignal();
      const orderSubmitter = createMockOrderSubmitter();
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: { id: 't1' } as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const dispatchSpy = vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);
      vi.spyOn(management, 'getStrategy').mockResolvedValue(null);

      await executorWithOrders.run(makeContext());

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: StrategyEventType.ORDER_FILLED,
          data: expect.objectContaining({
            orderId: 'order-123',
            filled: true,
          }),
        })
      );
    });

    it('should update signal status and metadata on execution', async () => {
      const signal = makeSignal();
      const orderSubmitter = createMockOrderSubmitter();
      const executorWithOrders = new StrategyExecutor(registry, management, orderSubmitter);

      vi.spyOn(registry, 'runStrategies').mockResolvedValue([signal]);
      vi.spyOn(registry, 'evaluateSignal').mockResolvedValue({
        approved: true,
        checks: { passed: true, checks: [] },
        thesis: { id: 't1' } as any,
      });
      vi.spyOn(registry, 'getStrategyConfig').mockReturnValue({
        id: 'strategy-1',
        name: 'Test',
        type: StrategyType.VALUE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 10,
        maxPositionSize: 100,
        maxNotionalPerTrade: 5000,
        minEdge: 2,
        minConfidence: 0.55,
        maxSpread: 10,
        minLiquidity: 50,
        allowedCategories: [],
        blockedCategories: [],
        blockedMarkets: [],
        params: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);
      vi.spyOn(management, 'getStrategy').mockResolvedValue(null);

      await executorWithOrders.run(makeContext());

      expect(signal.status).toBe(SignalStatus.EXECUTED);
      expect(signal.orderId).toBe('order-123');
      expect(signal.executedAt).toBeDefined();
    });
  });

  // ─── Signal Cleanup ───────────────────────────────────────────

  describe('cleanupExpiredSignals', () => {
    it('should delegate to registry', () => {
      vi.spyOn(registry, 'cleanupExpiredSignals').mockReturnValue(3);
      const result = executor.cleanupExpiredSignals();
      expect(result).toBe(3);
    });
  });

  // ─── Event Dispatch ───────────────────────────────────────────

  describe('dispatchEvent', () => {
    it('should delegate to registry', async () => {
      vi.spyOn(registry, 'dispatchEvent').mockResolvedValue(undefined);

      await executor.dispatchEvent({
        type: 'MARKET_UPDATE' as any,
        timestamp: new Date(),
        data: { ticker: 'TEST' },
      });

      expect(registry.dispatchEvent).toHaveBeenCalled();
    });
  });
});
