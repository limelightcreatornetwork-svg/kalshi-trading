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
  StrategyType,
  StrategyStatus,
  StrategyContext,
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
