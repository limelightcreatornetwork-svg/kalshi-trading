// Kill Switch Service
// Implements Tier 1 Feature #22: Kill switch hierarchy

import {
  KillSwitch,
  KillSwitchLevel,
  KillSwitchReason,
  KillSwitchConfig,
  TriggerKillSwitchRequest,
  ResetKillSwitchRequest,
  KillSwitchCheckContext,
  KillSwitchCheckResult,
  KILL_SWITCH_PRIORITY,
} from '../types/killswitch';

export interface KillSwitchStorage {
  getActive(): Promise<KillSwitch[]>;
  getByLevel(level: KillSwitchLevel): Promise<KillSwitch[]>;
  getById(id: string): Promise<KillSwitch | null>;
  create(killSwitch: KillSwitch): Promise<void>;
  update(id: string, updates: Partial<KillSwitch>): Promise<void>;
  getConfig(level: KillSwitchLevel, targetId?: string): Promise<KillSwitchConfig | null>;
  setConfig(config: KillSwitchConfig): Promise<void>;
}

// In-memory storage for testing
export class InMemoryKillSwitchStorage implements KillSwitchStorage {
  private switches: Map<string, KillSwitch> = new Map();
  private configs: Map<string, KillSwitchConfig> = new Map();

  async getActive(): Promise<KillSwitch[]> {
    const now = new Date();
    return Array.from(this.switches.values()).filter(s => {
      if (!s.isActive) return false;
      // Check auto-reset
      if (s.autoResetAt && s.autoResetAt <= now) return false;
      return true;
    });
  }

  async getByLevel(level: KillSwitchLevel): Promise<KillSwitch[]> {
    return Array.from(this.switches.values()).filter(s => 
      s.level === level && s.isActive
    );
  }

  async getById(id: string): Promise<KillSwitch | null> {
    return this.switches.get(id) ?? null;
  }

  async create(killSwitch: KillSwitch): Promise<void> {
    this.switches.set(killSwitch.id, killSwitch);
  }

  async update(id: string, updates: Partial<KillSwitch>): Promise<void> {
    const existing = this.switches.get(id);
    if (existing) {
      this.switches.set(id, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async getConfig(level: KillSwitchLevel, targetId?: string): Promise<KillSwitchConfig | null> {
    const key = `${level}:${targetId ?? 'global'}`;
    return this.configs.get(key) ?? null;
  }

  async setConfig(config: KillSwitchConfig): Promise<void> {
    const key = `${config.level}:${config.targetId ?? 'global'}`;
    this.configs.set(key, config);
  }

  // For testing
  clear(): void {
    this.switches.clear();
    this.configs.clear();
  }
}

export interface KillSwitchServiceEvents {
  onTrigger?: (killSwitch: KillSwitch) => void;
  onReset?: (killSwitch: KillSwitch) => void;
  onAutoTrigger?: (killSwitch: KillSwitch, reason: string) => void;
}

export class KillSwitchService {
  private storage: KillSwitchStorage;
  private events: KillSwitchServiceEvents;

  constructor(storage: KillSwitchStorage, events: KillSwitchServiceEvents = {}) {
    this.storage = storage;
    this.events = events;
  }

  /**
   * Check if any kill switch blocks the given context
   * Returns the highest priority blocking switch
   */
  async check(context: KillSwitchCheckContext): Promise<KillSwitchCheckResult> {
    const activeSwitches = await this.storage.getActive();
    
    if (activeSwitches.length === 0) {
      return { isBlocked: false, activeCount: 0 };
    }

    // Find all applicable switches
    const applicableSwitches = activeSwitches.filter(s => 
      this.switchApplies(s, context)
    );

    if (applicableSwitches.length === 0) {
      return { isBlocked: false, activeCount: activeSwitches.length };
    }

    // Sort by priority (highest first)
    applicableSwitches.sort((a, b) => 
      KILL_SWITCH_PRIORITY[b.level] - KILL_SWITCH_PRIORITY[a.level]
    );

    return {
      isBlocked: true,
      blockingSwitch: applicableSwitches[0],
      activeCount: activeSwitches.length,
    };
  }

  /**
   * Check if a kill switch applies to a given context
   */
  private switchApplies(killSwitch: KillSwitch, context: KillSwitchCheckContext): boolean {
    switch (killSwitch.level) {
      case KillSwitchLevel.GLOBAL:
        return true;
      case KillSwitchLevel.STRATEGY:
        return context.strategyId === killSwitch.targetId;
      case KillSwitchLevel.MARKET:
        return context.marketId === killSwitch.targetId;
      case KillSwitchLevel.ACCOUNT:
        return context.accountId === killSwitch.targetId;
      default:
        return false;
    }
  }

  /**
   * Trigger a kill switch
   */
  async trigger(request: TriggerKillSwitchRequest): Promise<KillSwitch> {
    // Check for existing active switch at same level/target
    const existingSwitches = await this.storage.getByLevel(request.level);
    const existingForTarget = existingSwitches.find(
      s => s.targetId === request.targetId && s.isActive
    );

    if (existingForTarget) {
      // Update existing switch
      await this.storage.update(existingForTarget.id, {
        reason: request.reason,
        description: request.description,
        triggeredBy: request.triggeredBy,
        triggeredAt: new Date(),
        autoResetAt: request.autoResetAt,
      });
      
      const updated = await this.storage.getById(existingForTarget.id);
      if (updated && this.events.onTrigger) {
        this.events.onTrigger(updated);
      }
      return updated!;
    }

    // Create new kill switch
    const killSwitch: KillSwitch = {
      id: crypto.randomUUID(),
      level: request.level,
      targetId: request.targetId,
      isActive: true,
      reason: request.reason,
      description: request.description,
      triggeredBy: request.triggeredBy,
      triggeredAt: new Date(),
      autoResetAt: request.autoResetAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.create(killSwitch);

    if (this.events.onTrigger) {
      this.events.onTrigger(killSwitch);
    }

    return killSwitch;
  }

  /**
   * Trigger global emergency stop
   */
  async emergencyStop(triggeredBy: string, description?: string): Promise<KillSwitch> {
    return this.trigger({
      level: KillSwitchLevel.GLOBAL,
      reason: KillSwitchReason.MANUAL,
      description: description ?? 'Emergency stop triggered',
      triggeredBy,
    });
  }

  /**
   * Reset a kill switch
   */
  async reset(request: ResetKillSwitchRequest): Promise<KillSwitch | null> {
    const killSwitch = await this.storage.getById(request.id);
    if (!killSwitch) {
      return null;
    }

    await this.storage.update(request.id, {
      isActive: false,
      resetBy: request.resetBy,
      resetAt: new Date(),
    });

    const updated = await this.storage.getById(request.id);
    
    if (updated && this.events.onReset) {
      this.events.onReset(updated);
    }

    return updated;
  }

  /**
   * Reset all kill switches at a given level
   */
  async resetLevel(level: KillSwitchLevel, resetBy: string): Promise<number> {
    const switches = await this.storage.getByLevel(level);
    let count = 0;

    for (const s of switches) {
      if (s.isActive) {
        await this.reset({ id: s.id, resetBy });
        count++;
      }
    }

    return count;
  }

  /**
   * Get all active kill switches
   */
  async getActive(): Promise<KillSwitch[]> {
    return this.storage.getActive();
  }

  /**
   * Check thresholds and auto-trigger if exceeded
   */
  async checkThresholds(
    level: KillSwitchLevel,
    targetId: string | undefined,
    metrics: {
      dailyLoss?: number;
      drawdown?: number;
      errorRate?: number;
      latency?: number;
    }
  ): Promise<KillSwitch | null> {
    const config = await this.storage.getConfig(level, targetId);
    if (!config || !config.isActive) {
      return null;
    }

    let reason: KillSwitchReason | null = null;
    let description: string | null = null;

    // Check each threshold
    if (config.maxDailyLoss && metrics.dailyLoss !== undefined) {
      if (metrics.dailyLoss >= config.maxDailyLoss) {
        reason = KillSwitchReason.LOSS_LIMIT;
        description = `Daily loss $${metrics.dailyLoss.toFixed(2)} exceeded limit $${config.maxDailyLoss}`;
      }
    }

    if (config.maxDrawdown && metrics.drawdown !== undefined) {
      if (metrics.drawdown >= config.maxDrawdown) {
        reason = KillSwitchReason.LOSS_LIMIT;
        description = `Drawdown ${(metrics.drawdown * 100).toFixed(1)}% exceeded limit ${(config.maxDrawdown * 100).toFixed(1)}%`;
      }
    }

    if (config.maxErrorRate && metrics.errorRate !== undefined) {
      if (metrics.errorRate >= config.maxErrorRate) {
        reason = KillSwitchReason.ERROR_RATE;
        description = `Error rate ${(metrics.errorRate * 100).toFixed(1)}% exceeded limit ${(config.maxErrorRate * 100).toFixed(1)}%`;
      }
    }

    if (config.maxLatency && metrics.latency !== undefined) {
      if (metrics.latency >= config.maxLatency) {
        reason = KillSwitchReason.ANOMALY;
        description = `Latency ${metrics.latency}ms exceeded limit ${config.maxLatency}ms`;
      }
    }

    if (reason && description) {
      const killSwitch = await this.trigger({
        level,
        targetId,
        reason,
        description,
        triggeredBy: 'system',
      });

      if (this.events.onAutoTrigger) {
        this.events.onAutoTrigger(killSwitch, description);
      }

      return killSwitch;
    }

    return null;
  }

  /**
   * Configure thresholds for a level/target
   */
  async configure(config: Omit<KillSwitchConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.storage.setConfig({
      ...config,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Get current status summary
   */
  async getStatus(): Promise<{
    globalActive: boolean;
    activeCount: number;
    byLevel: Record<KillSwitchLevel, number>;
  }> {
    const active = await this.storage.getActive();
    
    const byLevel: Record<KillSwitchLevel, number> = {
      [KillSwitchLevel.GLOBAL]: 0,
      [KillSwitchLevel.STRATEGY]: 0,
      [KillSwitchLevel.MARKET]: 0,
      [KillSwitchLevel.ACCOUNT]: 0,
    };

    let globalActive = false;
    
    for (const s of active) {
      byLevel[s.level]++;
      if (s.level === KillSwitchLevel.GLOBAL) {
        globalActive = true;
      }
    }

    return {
      globalActive,
      activeCount: active.length,
      byLevel,
    };
  }
}

// Factory function
export function createKillSwitchService(
  events: KillSwitchServiceEvents = {}
): KillSwitchService {
  return new KillSwitchService(new InMemoryKillSwitchStorage(), events);
}
