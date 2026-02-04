// Strategy Types - Plugin interface for trading strategies

import { Thesis } from './thesis';

export enum StrategyType {
  VALUE = 'VALUE',                 // Mispricing detection
  NEWS = 'NEWS',                   // Event-driven trading
  MARKET_MAKING = 'MARKET_MAKING', // Two-sided quoting
  ARBITRAGE = 'ARBITRAGE',         // Cross-market parity
  HEDGING = 'HEDGING',             // Position hedging
}

export enum StrategyStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
  ERROR = 'ERROR',
}

export interface StrategyConfig {
  id: string;
  name: string;
  type: StrategyType;
  
  // Execution settings
  enabled: boolean;
  autoExecute: boolean;          // Auto-trade or require approval
  maxOrdersPerHour: number;
  maxPositionSize: number;
  maxNotionalPerTrade: number;
  
  // Risk settings
  minEdge: number;               // Minimum edge to trade (cents)
  minConfidence: number;         // Minimum model confidence (0-1)
  maxSpread: number;             // Don't trade if spread > X cents
  minLiquidity: number;          // Minimum depth at top of book
  
  // Market filters
  allowedCategories: string[];   // Empty = all allowed
  blockedCategories: string[];   // Always blocked
  blockedMarkets: string[];      // Specific tickers to block
  
  // Strategy-specific params
  params: Record<string, unknown>;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface StrategyState {
  id: string;
  configId: string;
  status: StrategyStatus;
  
  // Runtime state
  lastRunAt?: Date;
  lastSignalAt?: Date;
  lastTradeAt?: Date;
  
  // Error tracking
  errorCount: number;
  lastError?: string;
  lastErrorAt?: Date;
  
  // Performance (session)
  signalsGenerated: number;
  tradesExecuted: number;
  tradesRejected: number;
  pnlToday: number;
  
  updatedAt: Date;
}

export interface Signal {
  id: string;
  strategyId: string;
  marketId: string;
  marketTicker: string;
  
  // Signal details
  type: SignalType;
  direction: 'yes' | 'no';
  strength: number;              // 0-1 signal strength
  confidence: number;            // 0-1 model confidence
  
  // Pricing
  targetPrice: number;           // Fair value estimate
  currentPrice: number;          // Market price at signal time
  edge: number;                  // Implied edge
  
  // Evidence
  reason: string;                // Human-readable explanation
  evidenceLinks?: string[];
  dataSnapshotId?: string;
  
  // Lifecycle
  status: SignalStatus;
  thesisId?: string;             // Created thesis ID
  orderId?: string;              // Executed order ID
  
  createdAt: Date;
  evaluatedAt?: Date;
  executedAt?: Date;
  expiredAt?: Date;
}

export enum SignalType {
  ENTRY = 'ENTRY',               // Open new position
  EXIT = 'EXIT',                 // Close existing position
  SCALE_IN = 'SCALE_IN',         // Add to position
  SCALE_OUT = 'SCALE_OUT',       // Reduce position
  HEDGE = 'HEDGE',               // Hedging signal
}

export enum SignalStatus {
  PENDING = 'PENDING',           // Awaiting evaluation
  APPROVED = 'APPROVED',         // Passed risk checks
  REJECTED = 'REJECTED',         // Failed risk checks
  EXECUTED = 'EXECUTED',         // Order placed
  EXPIRED = 'EXPIRED',           // Too old to execute
  CANCELLED = 'CANCELLED',       // Manually cancelled
}

// Strategy plugin interface
export interface Strategy {
  id: string;
  type: StrategyType;
  name: string;
  description: string;
  
  /**
   * Initialize the strategy with config
   */
  initialize(config: StrategyConfig): Promise<void>;
  
  /**
   * Generate signals for a market
   * Called periodically or on market data update
   */
  generateSignals(context: StrategyContext): Promise<Signal[]>;
  
  /**
   * Evaluate a signal and create a thesis
   * Returns thesis if signal is actionable
   */
  evaluateSignal(signal: Signal): Promise<Thesis | null>;
  
  /**
   * Update strategy state after an event
   */
  onEvent(event: StrategyEvent): Promise<void>;
  
  /**
   * Get current strategy state
   */
  getState(): StrategyState;
  
  /**
   * Cleanup and shutdown
   */
  shutdown(): Promise<void>;
}

export interface StrategyContext {
  // Market data
  market: {
    id: string;
    ticker: string;
    title: string;
    category?: string;
    yesBid: number;
    yesAsk: number;
    noBid: number;
    noAsk: number;
    lastPrice: number;
    volume24h: number;
    openInterest: number;
    closeTime?: Date;
    expirationTime?: Date;
  };
  
  // Current position (if any)
  position?: {
    side: 'yes' | 'no';
    quantity: number;
    avgPrice: number;
    unrealizedPnl: number;
  };
  
  // Risk limits
  limits: {
    maxPositionSize: number;
    maxNotional: number;
    remainingBudget: number;
  };
  
  // External data (news, etc.)
  externalData?: Record<string, unknown>;
  
  timestamp: Date;
}

export interface StrategyEvent {
  type: StrategyEventType;
  timestamp: Date;
  data: Record<string, unknown>;
}

export enum StrategyEventType {
  MARKET_UPDATE = 'MARKET_UPDATE',
  ORDER_FILLED = 'ORDER_FILLED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  POSITION_OPENED = 'POSITION_OPENED',
  POSITION_CLOSED = 'POSITION_CLOSED',
  MARKET_SETTLED = 'MARKET_SETTLED',
  KILL_SWITCH_TRIGGERED = 'KILL_SWITCH_TRIGGERED',
  NEWS_ALERT = 'NEWS_ALERT',
}

// Strategy registration
export interface StrategyRegistration {
  type: StrategyType;
  factory: (config: StrategyConfig) => Strategy;
  defaultConfig: Partial<StrategyConfig>;
}

// Risk check result
export interface PreTradeCheck {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
    value?: number;
    limit?: number;
  }>;
  blockingCheck?: string;
}
