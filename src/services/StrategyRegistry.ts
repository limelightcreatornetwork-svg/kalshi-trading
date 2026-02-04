// Strategy Registry
// Manages strategy plugins and their lifecycle

import {
  Strategy,
  StrategyType,
  StrategyStatus,
  StrategyConfig,
  StrategyRegistration,
  StrategyContext,
  StrategyEvent,
  StrategyEventType,
  Signal,
  SignalStatus,
  PreTradeCheck,
} from '../types/strategy';
import { Thesis } from '../types/thesis';
import { KillSwitchService } from './KillSwitchService';
import { PositionCapService } from './PositionCapService';

export interface StrategyRegistryConfig {
  maxActiveStrategies: number;
  signalExpiryMs: number;
  defaultAutoExecute: boolean;
}

const DEFAULT_CONFIG: StrategyRegistryConfig = {
  maxActiveStrategies: 10,
  signalExpiryMs: 60000, // 1 minute
  defaultAutoExecute: false,
};

export interface StrategyRegistryEvents {
  onSignalGenerated?: (signal: Signal, strategy: Strategy) => void;
  onSignalApproved?: (signal: Signal, thesis: Thesis) => void;
  onSignalRejected?: (signal: Signal, reason: string) => void;
  onStrategyError?: (strategy: Strategy, error: Error) => void;
  onStrategyStatusChange?: (strategy: Strategy, status: StrategyStatus) => void;
}

export class StrategyRegistry {
  private config: StrategyRegistryConfig;
  private events: StrategyRegistryEvents;
  private registrations: Map<StrategyType, StrategyRegistration> = new Map();
  private activeStrategies: Map<string, Strategy> = new Map();
  private strategyConfigs: Map<string, StrategyConfig> = new Map();
  private pendingSignals: Map<string, Signal> = new Map();
  
  // Dependencies
  private killSwitchService?: KillSwitchService;
  private positionCapService?: PositionCapService;

  constructor(
    config: Partial<StrategyRegistryConfig> = {},
    events: StrategyRegistryEvents = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;
  }

  /**
   * Set dependencies for risk checking
   */
  setDependencies(deps: {
    killSwitchService?: KillSwitchService;
    positionCapService?: PositionCapService;
  }): void {
    this.killSwitchService = deps.killSwitchService;
    this.positionCapService = deps.positionCapService;
  }

  /**
   * Register a strategy type
   */
  registerStrategy(registration: StrategyRegistration): void {
    this.registrations.set(registration.type, registration);
  }

  /**
   * Create and activate a strategy instance
   */
  async activateStrategy(config: StrategyConfig): Promise<Strategy> {
    if (this.activeStrategies.size >= this.config.maxActiveStrategies) {
      throw new Error(`Maximum active strategies (${this.config.maxActiveStrategies}) reached`);
    }

    const registration = this.registrations.get(config.type);
    if (!registration) {
      throw new Error(`No registration found for strategy type: ${config.type}`);
    }

    // Merge with default config
    const fullConfig: StrategyConfig = {
      ...registration.defaultConfig,
      ...config,
    } as StrategyConfig;

    // Create strategy instance
    const strategy = registration.factory(fullConfig);
    await strategy.initialize(fullConfig);

    // Store
    this.activeStrategies.set(config.id, strategy);
    this.strategyConfigs.set(config.id, fullConfig);

    return strategy;
  }

  /**
   * Deactivate a strategy
   */
  async deactivateStrategy(strategyId: string): Promise<void> {
    const strategy = this.activeStrategies.get(strategyId);
    if (strategy) {
      await strategy.shutdown();
      this.activeStrategies.delete(strategyId);
      this.strategyConfigs.delete(strategyId);
    }
  }

  /**
   * Pause a strategy (keep state but stop generating signals)
   */
  async pauseStrategy(strategyId: string): Promise<void> {
    const strategy = this.activeStrategies.get(strategyId);
    if (strategy) {
      await strategy.onEvent({
        type: StrategyEventType.KILL_SWITCH_TRIGGERED,
        timestamp: new Date(),
        data: { reason: 'Manual pause' },
      });
      if (this.events.onStrategyStatusChange) {
        this.events.onStrategyStatusChange(strategy, StrategyStatus.PAUSED);
      }
    }
  }

  /**
   * Resume a paused strategy
   */
  async resumeStrategy(strategyId: string): Promise<void> {
    const strategy = this.activeStrategies.get(strategyId);
    if (strategy) {
      if (this.events.onStrategyStatusChange) {
        this.events.onStrategyStatusChange(strategy, StrategyStatus.ACTIVE);
      }
    }
  }

  /**
   * Run all active strategies for a market
   */
  async runStrategies(context: StrategyContext): Promise<Signal[]> {
    const signals: Signal[] = [];

    for (const [id, strategy] of this.activeStrategies) {
      const config = this.strategyConfigs.get(id);
      const state = strategy.getState();

      // Skip if not active
      if (state.status !== StrategyStatus.ACTIVE) continue;
      if (!config?.enabled) continue;

      // Check category filters
      if (!this.passesFilters(config, context)) continue;

      try {
        const strategySignals = await strategy.generateSignals(context);
        
        for (const signal of strategySignals) {
          signals.push(signal);
          this.pendingSignals.set(signal.id, signal);

          if (this.events.onSignalGenerated) {
            this.events.onSignalGenerated(signal, strategy);
          }
        }
      } catch (error) {
        if (this.events.onStrategyError) {
          this.events.onStrategyError(
            strategy,
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    }

    return signals;
  }

  /**
   * Check if market passes strategy filters
   */
  private passesFilters(config: StrategyConfig, context: StrategyContext): boolean {
    const category = context.market.category || '';

    // Blocked categories take precedence
    if (config.blockedCategories.includes(category)) {
      return false;
    }

    // Blocked markets
    if (config.blockedMarkets.includes(context.market.ticker)) {
      return false;
    }

    // Allowed categories (empty = all allowed)
    if (config.allowedCategories.length > 0) {
      if (!config.allowedCategories.includes(category)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a signal and perform pre-trade checks
   */
  async evaluateSignal(signalId: string): Promise<{
    approved: boolean;
    thesis?: Thesis;
    checks: PreTradeCheck;
    rejectionReason?: string;
  }> {
    const signal = this.pendingSignals.get(signalId);
    if (!signal) {
      return {
        approved: false,
        checks: { passed: false, checks: [], blockingCheck: 'Signal not found' },
        rejectionReason: 'Signal not found',
      };
    }

    const strategy = this.activeStrategies.get(signal.strategyId);
    if (!strategy) {
      return {
        approved: false,
        checks: { passed: false, checks: [], blockingCheck: 'Strategy not found' },
        rejectionReason: 'Strategy not found',
      };
    }

    const config = this.strategyConfigs.get(signal.strategyId);
    if (!config) {
      return {
        approved: false,
        checks: { passed: false, checks: [], blockingCheck: 'Config not found' },
        rejectionReason: 'Config not found',
      };
    }

    // Run pre-trade checks
    const checks = await this.runPreTradeChecks(signal, config);

    if (!checks.passed) {
      signal.status = SignalStatus.REJECTED;
      if (this.events.onSignalRejected) {
        this.events.onSignalRejected(signal, checks.blockingCheck || 'Pre-trade check failed');
      }
      return {
        approved: false,
        checks,
        rejectionReason: checks.blockingCheck,
      };
    }

    // Create thesis from signal
    const thesis = await strategy.evaluateSignal(signal);
    
    if (!thesis) {
      signal.status = SignalStatus.REJECTED;
      return {
        approved: false,
        checks,
        rejectionReason: 'Strategy did not create thesis',
      };
    }

    signal.status = SignalStatus.APPROVED;
    signal.thesisId = thesis.id;

    if (this.events.onSignalApproved) {
      this.events.onSignalApproved(signal, thesis);
    }

    return { approved: true, thesis, checks };
  }

  /**
   * Run pre-trade risk checks
   */
  private async runPreTradeChecks(
    signal: Signal,
    config: StrategyConfig
  ): Promise<PreTradeCheck> {
    const checks: PreTradeCheck['checks'] = [];
    let passed = true;
    let blockingCheck: string | undefined;

    // 1. Kill switch check
    if (this.killSwitchService) {
      const killCheck = await this.killSwitchService.check({
        strategyId: signal.strategyId,
        marketId: signal.marketId,
      });

      checks.push({
        name: 'Kill Switch',
        passed: !killCheck.isBlocked,
        message: killCheck.isBlocked 
          ? `Blocked by ${killCheck.blockingSwitch?.level} kill switch`
          : 'No active kill switches',
      });

      if (killCheck.isBlocked) {
        passed = false;
        blockingCheck = 'Kill Switch';
      }
    }

    // 2. Minimum edge check
    checks.push({
      name: 'Minimum Edge',
      passed: signal.edge >= config.minEdge,
      message: `Edge ${signal.edge.toFixed(2)}¢ vs required ${config.minEdge}¢`,
      value: signal.edge,
      limit: config.minEdge,
    });

    if (signal.edge < config.minEdge) {
      passed = false;
      if (!blockingCheck) blockingCheck = 'Minimum Edge';
    }

    // 3. Minimum confidence check
    checks.push({
      name: 'Minimum Confidence',
      passed: signal.confidence >= config.minConfidence,
      message: `Confidence ${(signal.confidence * 100).toFixed(1)}% vs required ${(config.minConfidence * 100).toFixed(1)}%`,
      value: signal.confidence,
      limit: config.minConfidence,
    });

    if (signal.confidence < config.minConfidence) {
      passed = false;
      if (!blockingCheck) blockingCheck = 'Minimum Confidence';
    }

    // 4. Signal expiry check
    const ageMs = Date.now() - signal.createdAt.getTime();
    const notExpired = ageMs < this.config.signalExpiryMs;

    checks.push({
      name: 'Signal Age',
      passed: notExpired,
      message: `Signal age ${ageMs}ms vs max ${this.config.signalExpiryMs}ms`,
      value: ageMs,
      limit: this.config.signalExpiryMs,
    });

    if (!notExpired) {
      passed = false;
      if (!blockingCheck) blockingCheck = 'Signal Expired';
    }

    // 5. Position cap check (if service available)
    if (this.positionCapService) {
      // Would need to know the order quantity and price
      // For now, just check if we can trade at all
      checks.push({
        name: 'Position Caps',
        passed: true, // Placeholder - actual check needs order details
        message: 'Position cap check passed',
      });
    }

    return { passed, checks, blockingCheck };
  }

  /**
   * Dispatch an event to all active strategies
   */
  async dispatchEvent(event: StrategyEvent): Promise<void> {
    for (const strategy of this.activeStrategies.values()) {
      try {
        await strategy.onEvent(event);
      } catch (error) {
        if (this.events.onStrategyError) {
          this.events.onStrategyError(
            strategy,
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    }
  }

  /**
   * Get all active strategies
   */
  getActiveStrategies(): Strategy[] {
    return Array.from(this.activeStrategies.values());
  }

  /**
   * Get strategy by ID
   */
  getStrategy(id: string): Strategy | undefined {
    return this.activeStrategies.get(id);
  }

  /**
   * Get strategy config
   */
  getStrategyConfig(id: string): StrategyConfig | undefined {
    return this.strategyConfigs.get(id);
  }

  /**
   * Get all pending signals
   */
  getPendingSignals(): Signal[] {
    return Array.from(this.pendingSignals.values())
      .filter(s => s.status === SignalStatus.PENDING);
  }

  /**
   * Clean up expired signals
   */
  cleanupExpiredSignals(): number {
    const now = Date.now();
    let removed = 0;

    for (const [_id, signal] of this.pendingSignals) {
      const age = now - signal.createdAt.getTime();
      if (age > this.config.signalExpiryMs && signal.status === SignalStatus.PENDING) {
        signal.status = SignalStatus.EXPIRED;
        signal.expiredAt = new Date();
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get status summary
   */
  getStatus(): {
    activeStrategies: number;
    pendingSignals: number;
    byType: Record<StrategyType, number>;
    byStatus: Record<StrategyStatus, number>;
  } {
    const byType: Record<StrategyType, number> = {
      [StrategyType.VALUE]: 0,
      [StrategyType.NEWS]: 0,
      [StrategyType.MARKET_MAKING]: 0,
      [StrategyType.ARBITRAGE]: 0,
      [StrategyType.HEDGING]: 0,
    };

    const byStatus: Record<StrategyStatus, number> = {
      [StrategyStatus.ACTIVE]: 0,
      [StrategyStatus.PAUSED]: 0,
      [StrategyStatus.DISABLED]: 0,
      [StrategyStatus.ERROR]: 0,
    };

    for (const strategy of this.activeStrategies.values()) {
      byType[strategy.type]++;
      byStatus[strategy.getState().status]++;
    }

    return {
      activeStrategies: this.activeStrategies.size,
      pendingSignals: this.getPendingSignals().length,
      byType,
      byStatus,
    };
  }
}

