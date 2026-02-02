// Kill Switch Types - Hierarchical emergency stop system

export enum KillSwitchLevel {
  GLOBAL = 'GLOBAL',       // Everything stops
  STRATEGY = 'STRATEGY',   // Specific strategy stops
  MARKET = 'MARKET',       // Specific market stops
  ACCOUNT = 'ACCOUNT',     // Specific account stops
}

export enum KillSwitchReason {
  MANUAL = 'MANUAL',           // Human triggered
  LOSS_LIMIT = 'LOSS_LIMIT',   // Hit loss threshold
  ERROR_RATE = 'ERROR_RATE',   // Too many errors
  ANOMALY = 'ANOMALY',         // Detected unusual behavior
  EXTERNAL = 'EXTERNAL',       // External event (API issues, etc.)
  SCHEDULED = 'SCHEDULED',     // Planned maintenance
}

export interface KillSwitch {
  id: string;
  level: KillSwitchLevel;
  targetId?: string; // Strategy ID, Market ID, or Account ID (null for GLOBAL)
  isActive: boolean;
  reason: KillSwitchReason;
  description?: string;
  triggeredBy: string;
  triggeredAt: Date;
  autoResetAt?: Date;
  resetBy?: string;
  resetAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface KillSwitchConfig {
  id: string;
  level: KillSwitchLevel;
  targetId?: string;
  maxDailyLoss?: number;
  maxDrawdown?: number;
  maxErrorRate?: number;
  maxLatency?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriggerKillSwitchRequest {
  level: KillSwitchLevel;
  targetId?: string;
  reason: KillSwitchReason;
  description?: string;
  triggeredBy: string;
  autoResetAt?: Date;
}

export interface ResetKillSwitchRequest {
  id: string;
  resetBy: string;
}

// Priority order for kill switch levels (higher = more restrictive)
export const KILL_SWITCH_PRIORITY: Record<KillSwitchLevel, number> = {
  [KillSwitchLevel.GLOBAL]: 4,
  [KillSwitchLevel.ACCOUNT]: 3,
  [KillSwitchLevel.STRATEGY]: 2,
  [KillSwitchLevel.MARKET]: 1,
};

// Check if an action is blocked by any active kill switch
export interface KillSwitchCheckContext {
  strategyId?: string;
  marketId?: string;
  accountId?: string;
}

export interface KillSwitchCheckResult {
  isBlocked: boolean;
  blockingSwitch?: KillSwitch;
  activeCount: number;
}
