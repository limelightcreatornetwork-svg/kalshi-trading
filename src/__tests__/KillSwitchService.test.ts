// Kill Switch Service Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KillSwitchService,
  KillSwitchServiceEvents,
} from '../services/KillSwitchService';
import { InMemoryKillSwitchStorage, createKillSwitchService } from './helpers/test-factories';
import {
  KillSwitchLevel,
  KillSwitchReason,
  KILL_SWITCH_PRIORITY,
} from '../types/killswitch';

describe('InMemoryKillSwitchStorage', () => {
  let storage: InMemoryKillSwitchStorage;

  beforeEach(() => {
    storage = new InMemoryKillSwitchStorage();
  });

  it('should create and retrieve kill switches', async () => {
    const killSwitch = {
      id: 'ks-1',
      level: KillSwitchLevel.GLOBAL,
      isActive: true,
      reason: KillSwitchReason.MANUAL,
      triggeredBy: 'user-1',
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.create(killSwitch);
    const retrieved = await storage.getById('ks-1');

    expect(retrieved).toEqual(killSwitch);
  });

  it('should filter active switches', async () => {
    await storage.create({
      id: 'ks-active',
      level: KillSwitchLevel.GLOBAL,
      isActive: true,
      reason: KillSwitchReason.MANUAL,
      triggeredBy: 'user-1',
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await storage.create({
      id: 'ks-inactive',
      level: KillSwitchLevel.GLOBAL,
      isActive: false,
      reason: KillSwitchReason.MANUAL,
      triggeredBy: 'user-1',
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const active = await storage.getActive();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('ks-active');
  });

  it('should exclude auto-reset switches that have expired', async () => {
    await storage.create({
      id: 'ks-autoreset',
      level: KillSwitchLevel.GLOBAL,
      isActive: true,
      reason: KillSwitchReason.SCHEDULED,
      triggeredBy: 'system',
      triggeredAt: new Date(),
      autoResetAt: new Date(Date.now() - 1000), // Already past
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const active = await storage.getActive();
    expect(active).toHaveLength(0);
  });

  it('should filter by level', async () => {
    await storage.create({
      id: 'ks-global',
      level: KillSwitchLevel.GLOBAL,
      isActive: true,
      reason: KillSwitchReason.MANUAL,
      triggeredBy: 'user-1',
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await storage.create({
      id: 'ks-strategy',
      level: KillSwitchLevel.STRATEGY,
      targetId: 'strategy-1',
      isActive: true,
      reason: KillSwitchReason.MANUAL,
      triggeredBy: 'user-1',
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const globalSwitches = await storage.getByLevel(KillSwitchLevel.GLOBAL);
    expect(globalSwitches).toHaveLength(1);
    expect(globalSwitches[0].level).toBe(KillSwitchLevel.GLOBAL);
  });
});

describe('KillSwitchService', () => {
  let service: KillSwitchService;
  let storage: InMemoryKillSwitchStorage;
  let events: KillSwitchServiceEvents;

  beforeEach(() => {
    storage = new InMemoryKillSwitchStorage();
    events = {
      onTrigger: vi.fn(),
      onReset: vi.fn(),
      onAutoTrigger: vi.fn(),
    };
    service = new KillSwitchService(storage, events);
  });

  describe('trigger', () => {
    it('should create a new kill switch', async () => {
      const ks = await service.trigger({
        level: KillSwitchLevel.GLOBAL,
        reason: KillSwitchReason.MANUAL,
        description: 'Test kill switch',
        triggeredBy: 'user-1',
      });

      expect(ks.id).toBeDefined();
      expect(ks.level).toBe(KillSwitchLevel.GLOBAL);
      expect(ks.isActive).toBe(true);
      expect(ks.reason).toBe(KillSwitchReason.MANUAL);
      expect(events.onTrigger).toHaveBeenCalled();
    });

    it('should update existing switch at same level/target', async () => {
      // First trigger
      const ks1 = await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      // Second trigger at same level/target
      const ks2 = await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-1',
        reason: KillSwitchReason.LOSS_LIMIT,
        description: 'Updated reason',
        triggeredBy: 'system',
      });

      expect(ks2.id).toBe(ks1.id);
      expect(ks2.reason).toBe(KillSwitchReason.LOSS_LIMIT);
    });

    it('should create separate switches for different targets', async () => {
      const ks1 = await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      const ks2 = await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-2',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      expect(ks1.id).not.toBe(ks2.id);
    });
  });

  describe('emergencyStop', () => {
    it('should trigger global kill switch', async () => {
      const ks = await service.emergencyStop('user-1', 'Critical issue');

      expect(ks.level).toBe(KillSwitchLevel.GLOBAL);
      expect(ks.reason).toBe(KillSwitchReason.MANUAL);
      expect(ks.description).toContain('Critical issue');
    });
  });

  describe('reset', () => {
    it('should deactivate kill switch', async () => {
      const ks = await service.trigger({
        level: KillSwitchLevel.GLOBAL,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      const reset = await service.reset({ id: ks.id, resetBy: 'user-2' });

      expect(reset?.isActive).toBe(false);
      expect(reset?.resetBy).toBe('user-2');
      expect(reset?.resetAt).toBeDefined();
      expect(events.onReset).toHaveBeenCalled();
    });

    it('should return null for non-existent switch', async () => {
      const result = await service.reset({ id: 'non-existent', resetBy: 'user-1' });
      expect(result).toBeNull();
    });
  });

  describe('resetLevel', () => {
    it('should reset all switches at a level', async () => {
      await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-2',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      await service.trigger({
        level: KillSwitchLevel.GLOBAL,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      const count = await service.resetLevel(KillSwitchLevel.STRATEGY, 'admin');

      expect(count).toBe(2);
      
      const status = await service.getStatus();
      expect(status.byLevel[KillSwitchLevel.STRATEGY]).toBe(0);
      expect(status.byLevel[KillSwitchLevel.GLOBAL]).toBe(1);
    });
  });

  describe('check', () => {
    it('should return not blocked when no active switches', async () => {
      const result = await service.check({ strategyId: 'strategy-1' });

      expect(result.isBlocked).toBe(false);
      expect(result.activeCount).toBe(0);
    });

    it('should block on global kill switch', async () => {
      await service.trigger({
        level: KillSwitchLevel.GLOBAL,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      const result = await service.check({ strategyId: 'strategy-1' });

      expect(result.isBlocked).toBe(true);
      expect(result.blockingSwitch?.level).toBe(KillSwitchLevel.GLOBAL);
    });

    it('should block on matching strategy switch', async () => {
      await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      const result = await service.check({ strategyId: 'strategy-1' });

      expect(result.isBlocked).toBe(true);
      expect(result.blockingSwitch?.level).toBe(KillSwitchLevel.STRATEGY);
    });

    it('should not block on non-matching strategy switch', async () => {
      await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      const result = await service.check({ strategyId: 'strategy-2' });

      expect(result.isBlocked).toBe(false);
      expect(result.activeCount).toBe(1);
    });

    it('should block on matching market switch', async () => {
      await service.trigger({
        level: KillSwitchLevel.MARKET,
        targetId: 'market-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      const result = await service.check({ marketId: 'market-1' });

      expect(result.isBlocked).toBe(true);
    });

    it('should return highest priority blocking switch', async () => {
      await service.trigger({
        level: KillSwitchLevel.MARKET,
        targetId: 'market-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      await service.trigger({
        level: KillSwitchLevel.GLOBAL,
        reason: KillSwitchReason.LOSS_LIMIT,
        triggeredBy: 'system',
      });

      const result = await service.check({ marketId: 'market-1' });

      expect(result.isBlocked).toBe(true);
      expect(result.blockingSwitch?.level).toBe(KillSwitchLevel.GLOBAL);
    });
  });

  describe('checkThresholds', () => {
    beforeEach(async () => {
      await service.configure({
        level: KillSwitchLevel.GLOBAL,
        maxDailyLoss: 1000,
        maxDrawdown: 0.1,
        maxErrorRate: 0.05,
        maxLatency: 5000,
        isActive: true,
      });
    });

    it('should trigger on daily loss threshold', async () => {
      const ks = await service.checkThresholds(KillSwitchLevel.GLOBAL, undefined, {
        dailyLoss: 1500,
      });

      expect(ks).not.toBeNull();
      expect(ks?.reason).toBe(KillSwitchReason.LOSS_LIMIT);
      expect(events.onAutoTrigger).toHaveBeenCalled();
    });

    it('should trigger on drawdown threshold', async () => {
      const ks = await service.checkThresholds(KillSwitchLevel.GLOBAL, undefined, {
        drawdown: 0.15,
      });

      expect(ks).not.toBeNull();
      expect(ks?.reason).toBe(KillSwitchReason.LOSS_LIMIT);
    });

    it('should trigger on error rate threshold', async () => {
      const ks = await service.checkThresholds(KillSwitchLevel.GLOBAL, undefined, {
        errorRate: 0.10,
      });

      expect(ks).not.toBeNull();
      expect(ks?.reason).toBe(KillSwitchReason.ERROR_RATE);
    });

    it('should trigger on latency threshold', async () => {
      const ks = await service.checkThresholds(KillSwitchLevel.GLOBAL, undefined, {
        latency: 10000,
      });

      expect(ks).not.toBeNull();
      expect(ks?.reason).toBe(KillSwitchReason.ANOMALY);
    });

    it('should not trigger when below thresholds', async () => {
      const ks = await service.checkThresholds(KillSwitchLevel.GLOBAL, undefined, {
        dailyLoss: 500,
        drawdown: 0.05,
        errorRate: 0.01,
        latency: 1000,
      });

      expect(ks).toBeNull();
    });

    it('should return null when config not found', async () => {
      const ks = await service.checkThresholds(
        KillSwitchLevel.STRATEGY,
        'unconfigured-strategy',
        { dailyLoss: 10000 }
      );

      expect(ks).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('should return correct status summary', async () => {
      await service.trigger({
        level: KillSwitchLevel.GLOBAL,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      await service.trigger({
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strategy-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      await service.trigger({
        level: KillSwitchLevel.MARKET,
        targetId: 'market-1',
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'user-1',
      });

      const status = await service.getStatus();

      expect(status.globalActive).toBe(true);
      expect(status.activeCount).toBe(3);
      expect(status.byLevel[KillSwitchLevel.GLOBAL]).toBe(1);
      expect(status.byLevel[KillSwitchLevel.STRATEGY]).toBe(1);
      expect(status.byLevel[KillSwitchLevel.MARKET]).toBe(1);
      expect(status.byLevel[KillSwitchLevel.ACCOUNT]).toBe(0);
    });
  });
});

describe('KILL_SWITCH_PRIORITY', () => {
  it('should have GLOBAL as highest priority', () => {
    expect(KILL_SWITCH_PRIORITY[KillSwitchLevel.GLOBAL]).toBeGreaterThan(
      KILL_SWITCH_PRIORITY[KillSwitchLevel.ACCOUNT]
    );
    expect(KILL_SWITCH_PRIORITY[KillSwitchLevel.GLOBAL]).toBeGreaterThan(
      KILL_SWITCH_PRIORITY[KillSwitchLevel.STRATEGY]
    );
    expect(KILL_SWITCH_PRIORITY[KillSwitchLevel.GLOBAL]).toBeGreaterThan(
      KILL_SWITCH_PRIORITY[KillSwitchLevel.MARKET]
    );
  });
});

describe('createKillSwitchService', () => {
  it('should create service with default storage', () => {
    const service = createKillSwitchService();
    expect(service).toBeInstanceOf(KillSwitchService);
  });
});

describe('KillSwitchService - additional coverage', () => {
  let storage: InMemoryKillSwitchStorage;
  let service: KillSwitchService;

  beforeEach(() => {
    storage = new InMemoryKillSwitchStorage();
    service = new KillSwitchService(storage);
  });

  describe('switchApplies - ACCOUNT level', () => {
    it('should block when account-level switch matches accountId', async () => {
      await storage.create({
        id: 'ks-account',
        level: KillSwitchLevel.ACCOUNT,
        targetId: 'account-123',
        isActive: true,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'admin',
        triggeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.check({
        accountId: 'account-123',
      });

      expect(result.isBlocked).toBe(true);
      expect(result.blockingSwitch?.level).toBe(KillSwitchLevel.ACCOUNT);
    });

    it('should NOT block when account-level switch does not match accountId', async () => {
      await storage.create({
        id: 'ks-account',
        level: KillSwitchLevel.ACCOUNT,
        targetId: 'account-123',
        isActive: true,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'admin',
        triggeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.check({
        accountId: 'different-account',
      });

      expect(result.isBlocked).toBe(false);
    });
  });

  describe('switchApplies - unknown level (default case)', () => {
    it('should not block for unrecognized kill switch level', async () => {
      await storage.create({
        id: 'ks-unknown',
        level: 'UNKNOWN_LEVEL' as KillSwitchLevel,
        targetId: 'some-target',
        isActive: true,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'admin',
        triggeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.check({
        strategyId: 'any',
        marketId: 'any',
        accountId: 'any',
      });

      expect(result.isBlocked).toBe(false);
      expect(result.activeCount).toBe(1);
    });
  });

  describe('getActive', () => {
    it('should return all active kill switches', async () => {
      await storage.create({
        id: 'ks-1',
        level: KillSwitchLevel.GLOBAL,
        isActive: true,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'admin',
        triggeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await storage.create({
        id: 'ks-2',
        level: KillSwitchLevel.MARKET,
        targetId: 'market-1',
        isActive: true,
        reason: KillSwitchReason.LOSS_LIMIT,
        triggeredBy: 'system',
        triggeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await storage.create({
        id: 'ks-3',
        level: KillSwitchLevel.STRATEGY,
        targetId: 'strat-1',
        isActive: false,
        reason: KillSwitchReason.MANUAL,
        triggeredBy: 'admin',
        triggeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const active = await service.getActive();

      expect(active).toHaveLength(2);
      expect(active.map(s => s.id)).toContain('ks-1');
      expect(active.map(s => s.id)).toContain('ks-2');
      expect(active.map(s => s.id)).not.toContain('ks-3');
    });

    it('should return empty array when no active switches', async () => {
      const active = await service.getActive();
      expect(active).toEqual([]);
    });
  });
});
