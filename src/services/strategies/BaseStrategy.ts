// Base Strategy Implementation
// Provides common functionality for all strategies

import {
  Strategy,
  StrategyType,
  StrategyStatus,
  StrategyConfig,
  StrategyState,
  StrategyContext,
  StrategyEvent,
  StrategyEventType,
  Signal,
  SignalStatus,
  SignalType,
} from '../../types/strategy';
import { Thesis, ThesisStatus } from '../../types/thesis';

export abstract class BaseStrategy implements Strategy {
  id: string;
  type: StrategyType;
  name: string;
  description: string;

  protected config!: StrategyConfig;
  protected state: StrategyState;

  constructor(
    id: string,
    type: StrategyType,
    name: string,
    description: string
  ) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.description = description;

    this.state = {
      id,
      configId: '',
      status: StrategyStatus.DISABLED,
      errorCount: 0,
      signalsGenerated: 0,
      tradesExecuted: 0,
      tradesRejected: 0,
      pnlToday: 0,
      updatedAt: new Date(),
    };
  }

  async initialize(config: StrategyConfig): Promise<void> {
    this.config = config;
    this.state.configId = config.id;
    this.state.status = StrategyStatus.ACTIVE;
    this.state.updatedAt = new Date();

    // Allow subclasses to do additional initialization
    await this.onInitialize();
  }

  // Override this for custom initialization
  protected async onInitialize(): Promise<void> {}

  // Subclasses must implement this
  abstract generateSignals(context: StrategyContext): Promise<Signal[]>;

  // Default thesis creation - can be overridden
  async evaluateSignal(signal: Signal): Promise<Thesis | null> {
    // Don't create thesis if signal doesn't meet minimum requirements
    if (signal.strength < 0.5) {
      return null;
    }

    const thesis: Thesis = {
      id: crypto.randomUUID(),
      marketId: signal.marketId,
      marketTicker: signal.marketTicker,
      hypothesis: signal.reason,
      direction: signal.direction,
      confidence: signal.confidence,
      modelId: this.id,
      modelVersion: '1.0.0',
      evidenceLinks: signal.evidenceLinks || [],
      evidenceSummary: signal.reason,
      dataSnapshotId: signal.dataSnapshotId,
      falsificationCriteria: this.generateFalsificationCriteria(signal),
      targetPrice: signal.targetPrice,
      edgeRequired: this.config.minEdge,
      maxPrice: signal.direction === 'yes' ? 95 : 95,
      status: ThesisStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return thesis;
  }

  // Generate falsification criteria based on signal
  protected generateFalsificationCriteria(signal: Signal): string {
    const priceMove = signal.targetPrice * 0.1; // 10% price move
    if (signal.direction === 'yes') {
      return `Invalidate if: YES price drops below ${(signal.targetPrice - priceMove).toFixed(0)}¢ or contradictory evidence emerges`;
    } else {
      return `Invalidate if: NO price drops below ${(signal.targetPrice - priceMove).toFixed(0)}¢ or contradictory evidence emerges`;
    }
  }

  async onEvent(event: StrategyEvent): Promise<void> {
    this.state.updatedAt = new Date();

    switch (event.type) {
      case StrategyEventType.ORDER_FILLED:
        this.state.tradesExecuted++;
        this.state.lastTradeAt = event.timestamp;
        break;

      case StrategyEventType.ORDER_REJECTED:
        this.state.tradesRejected++;
        break;

      case StrategyEventType.KILL_SWITCH_TRIGGERED:
        this.state.status = StrategyStatus.PAUSED;
        break;

      case StrategyEventType.MARKET_UPDATE:
        // Could update internal state
        break;
    }

    // Allow subclasses to handle events
    await this.onCustomEvent(event);
  }

  // Override for custom event handling
  protected async onCustomEvent(event: StrategyEvent): Promise<void> {}

  getState(): StrategyState {
    return { ...this.state };
  }

  async shutdown(): Promise<void> {
    this.state.status = StrategyStatus.DISABLED;
    await this.onShutdown();
  }

  // Override for cleanup
  protected async onShutdown(): Promise<void> {}

  // Utility methods for subclasses

  /**
   * Create a signal
   */
  protected createSignal(
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
    const currentPrice = params.direction === 'yes' 
      ? context.market.yesAsk 
      : context.market.noAsk;
    
    const signal: Signal = {
      id: crypto.randomUUID(),
      strategyId: this.id,
      marketId: context.market.id,
      marketTicker: context.market.ticker,
      type: params.type,
      direction: params.direction,
      strength: params.strength,
      confidence: params.confidence,
      targetPrice: params.targetPrice,
      currentPrice,
      edge: params.targetPrice - currentPrice,
      reason: params.reason,
      evidenceLinks: params.evidenceLinks,
      status: SignalStatus.PENDING,
      createdAt: new Date(),
    };

    this.state.signalsGenerated++;
    this.state.lastSignalAt = new Date();

    return signal;
  }

  /**
   * Calculate implied probability from price
   */
  protected priceToProb(price: number): number {
    return price / 100;
  }

  /**
   * Calculate price from probability
   */
  protected probToPrice(prob: number): number {
    return prob * 100;
  }

  /**
   * Calculate mid price
   */
  protected getMidPrice(bid: number, ask: number): number {
    return (bid + ask) / 2;
  }

  /**
   * Calculate spread
   */
  protected getSpread(bid: number, ask: number): number {
    return ask - bid;
  }

  /**
   * Check if market passes liquidity requirements
   */
  protected passesLiquidityCheck(context: StrategyContext): boolean {
    const yesSpread = context.market.yesAsk - context.market.yesBid;
    const noSpread = context.market.noAsk - context.market.noBid;
    
    // Check spreads
    if (yesSpread > this.config.maxSpread) return false;
    if (noSpread > this.config.maxSpread) return false;
    
    // TODO: Check depth when available
    
    return true;
  }

  /**
   * Log a message (override for custom logging)
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    const prefix = `[${this.name}]`;
    switch (level) {
      case 'info':
        console.log(prefix, message, data ?? '');
        break;
      case 'warn':
        console.warn(prefix, message, data ?? '');
        break;
      case 'error':
        console.error(prefix, message, data ?? '');
        break;
    }
  }

  /**
   * Record an error
   */
  protected recordError(error: Error): void {
    this.state.errorCount++;
    this.state.lastError = error.message;
    this.state.lastErrorAt = new Date();
    
    // Auto-pause if too many errors
    if (this.state.errorCount >= 10) {
      this.state.status = StrategyStatus.ERROR;
      this.log('error', 'Strategy paused due to excessive errors');
    }
  }
}
