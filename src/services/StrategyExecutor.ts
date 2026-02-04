// Strategy Executor
// Orchestrates strategy lifecycle: signal generation, risk checks, order execution

import {
  StrategyConfig,
  StrategyContext,
  StrategyEvent,
  StrategyEventType,
  StrategyStatus,
  Signal,
  SignalStatus,
} from '../types/strategy';
import { Thesis } from '../types/thesis';
import { StrategyRegistry } from './StrategyRegistry';
import { StrategyManagementService } from './StrategyManagementService';
import { createLogger } from '../lib/logger';

const log = createLogger('StrategyExecutor');

export interface OrderSubmitter {
  submitOrder(params: {
    ticker: string;
    side: 'yes' | 'no';
    action: 'buy' | 'sell';
    type: 'limit' | 'market';
    count: number;
    price?: number;
  }): Promise<{ orderId: string; filled: boolean }>;
}

export interface ExecutionResult {
  signalId: string;
  strategyId: string;
  approved: boolean;
  executed: boolean;
  orderId?: string;
  thesis?: Thesis;
  rejectionReason?: string;
  error?: string;
}

export interface RunResult {
  signals: Signal[];
  executions: ExecutionResult[];
  errors: string[];
  duration: number;
}

export class StrategyExecutor {
  private running = false;
  private lastRunAt?: Date;
  private totalRuns = 0;
  private totalSignals = 0;
  private totalExecutions = 0;

  constructor(
    private registry: StrategyRegistry,
    private management: StrategyManagementService,
    private orderSubmitter?: OrderSubmitter
  ) {}

  /**
   * Run all enabled strategies against a market context.
   * For each signal generated, evaluates risk and optionally executes.
   */
  async run(context: StrategyContext): Promise<RunResult> {
    if (this.running) {
      return { signals: [], executions: [], errors: ['Executor already running'], duration: 0 };
    }

    this.running = true;
    const startTime = Date.now();
    const errors: string[] = [];
    const executions: ExecutionResult[] = [];

    try {
      // Load enabled strategies into registry
      await this.syncStrategies();

      // Generate signals from all active strategies
      const signals = await this.registry.runStrategies(context);
      this.totalSignals += signals.length;

      log.info('Signals generated', {
        count: signals.length,
        market: context.market.ticker,
      });

      // Evaluate and execute each signal
      for (const signal of signals) {
        try {
          const result = await this.evaluateAndExecute(signal);
          executions.push(result);

          // Update strategy state
          await this.updateStrategyState(signal.strategyId, result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Signal ${signal.id}: ${message}`);
          log.error('Signal evaluation failed', { signalId: signal.id, error: message });
        }
      }

      this.totalRuns++;
      this.lastRunAt = new Date();

      const duration = Date.now() - startTime;
      log.info('Run completed', {
        signals: signals.length,
        executions: executions.filter(e => e.executed).length,
        rejections: executions.filter(e => !e.approved).length,
        errors: errors.length,
        duration,
      });

      return { signals, executions, errors, duration };
    } finally {
      this.running = false;
    }
  }

  /**
   * Evaluate a signal through risk checks and optionally execute.
   */
  private async evaluateAndExecute(signal: Signal): Promise<ExecutionResult> {
    const result = await this.registry.evaluateSignal(signal.id);

    if (!result.approved) {
      log.info('Signal rejected', {
        signalId: signal.id,
        reason: result.rejectionReason,
      });
      return {
        signalId: signal.id,
        strategyId: signal.strategyId,
        approved: false,
        executed: false,
        thesis: result.thesis,
        rejectionReason: result.rejectionReason,
      };
    }

    // Check if strategy config allows auto-execution
    const config = this.registry.getStrategyConfig(signal.strategyId);
    if (!config?.autoExecute) {
      log.info('Signal approved, awaiting manual execution', {
        signalId: signal.id,
        thesisId: result.thesis?.id,
      });
      return {
        signalId: signal.id,
        strategyId: signal.strategyId,
        approved: true,
        executed: false,
        thesis: result.thesis,
      };
    }

    // Auto-execute
    if (!this.orderSubmitter) {
      log.warn('Auto-execute enabled but no order submitter configured');
      return {
        signalId: signal.id,
        strategyId: signal.strategyId,
        approved: true,
        executed: false,
        thesis: result.thesis,
        error: 'No order submitter configured',
      };
    }

    try {
      const orderResult = await this.orderSubmitter.submitOrder({
        ticker: signal.marketTicker,
        side: signal.direction,
        action: 'buy',
        type: config.params?.useAggressivePricing ? 'market' : 'limit',
        count: Math.min(config.maxPositionSize, Math.floor(config.maxNotionalPerTrade / signal.targetPrice)),
        price: signal.targetPrice,
      });

      signal.status = SignalStatus.EXECUTED;
      signal.orderId = orderResult.orderId;
      signal.executedAt = new Date();
      this.totalExecutions++;

      log.info('Order executed', {
        signalId: signal.id,
        orderId: orderResult.orderId,
        filled: orderResult.filled,
      });

      // Dispatch order event to strategies
      await this.registry.dispatchEvent({
        type: StrategyEventType.ORDER_FILLED,
        timestamp: new Date(),
        data: {
          orderId: orderResult.orderId,
          signalId: signal.id,
          strategyId: signal.strategyId,
          ticker: signal.marketTicker,
          side: signal.direction,
          filled: orderResult.filled,
        },
      });

      return {
        signalId: signal.id,
        strategyId: signal.strategyId,
        approved: true,
        executed: true,
        orderId: orderResult.orderId,
        thesis: result.thesis,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Order execution failed', { signalId: signal.id, error: message });

      await this.registry.dispatchEvent({
        type: StrategyEventType.ORDER_REJECTED,
        timestamp: new Date(),
        data: {
          signalId: signal.id,
          strategyId: signal.strategyId,
          error: message,
        },
      });

      return {
        signalId: signal.id,
        strategyId: signal.strategyId,
        approved: true,
        executed: false,
        thesis: result.thesis,
        error: message,
      };
    }
  }

  /**
   * Sync strategy configs from management service into the registry.
   */
  private async syncStrategies(): Promise<void> {
    const strategies = await this.management.listStrategies({ enabled: true });
    const registeredIds = new Set(this.registry.getActiveStrategies().map(s => s.id));
    const enabledIds = new Set(strategies.map(s => s.config.id));

    // Deactivate strategies that are no longer enabled
    for (const id of registeredIds) {
      if (!enabledIds.has(id)) {
        await this.registry.deactivateStrategy(id);
        log.info('Deactivated strategy', { id });
      }
    }

    // Activate new strategies (only if their type is registered)
    for (const { config } of strategies) {
      if (!registeredIds.has(config.id)) {
        try {
          await this.registry.activateStrategy(config);
          log.info('Activated strategy', { id: config.id, name: config.name });
        } catch {
          // Type not registered - skip silently
        }
      }
    }
  }

  /**
   * Update the strategy state after an execution result.
   */
  private async updateStrategyState(strategyId: string, result: ExecutionResult): Promise<void> {
    const currentState = (await this.management.getStrategy(strategyId))?.state;
    if (!currentState) return;

    const updates: Partial<typeof currentState> = {
      lastRunAt: new Date(),
      lastSignalAt: new Date(),
      signalsGenerated: currentState.signalsGenerated + 1,
    };

    if (result.executed) {
      updates.tradesExecuted = currentState.tradesExecuted + 1;
      updates.lastTradeAt = new Date();
    } else if (!result.approved) {
      updates.tradesRejected = currentState.tradesRejected + 1;
    }

    if (result.error) {
      updates.errorCount = currentState.errorCount + 1;
      updates.lastError = result.error;
      updates.lastErrorAt = new Date();

      // Auto-pause on too many errors
      if ((updates.errorCount ?? 0) >= 10) {
        updates.status = StrategyStatus.ERROR;
        log.warn('Strategy paused due to errors', { strategyId, errorCount: updates.errorCount });
      }
    }

    await this.management.updateState(strategyId, updates);
  }

  /**
   * Dispatch an event to all active strategies.
   */
  async dispatchEvent(event: StrategyEvent): Promise<void> {
    await this.registry.dispatchEvent(event);
  }

  /**
   * Clean up expired signals.
   */
  cleanupExpiredSignals(): number {
    return this.registry.cleanupExpiredSignals();
  }

  /**
   * Get executor status summary.
   */
  getStatus(): {
    running: boolean;
    lastRunAt?: Date;
    totalRuns: number;
    totalSignals: number;
    totalExecutions: number;
    registryStatus: ReturnType<StrategyRegistry['getStatus']>;
  } {
    return {
      running: this.running,
      lastRunAt: this.lastRunAt,
      totalRuns: this.totalRuns,
      totalSignals: this.totalSignals,
      totalExecutions: this.totalExecutions,
      registryStatus: this.registry.getStatus(),
    };
  }
}
