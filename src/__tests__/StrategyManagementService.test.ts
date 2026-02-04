// Strategy Management Service Tests
// Tests for CRUD operations, state management, and storage

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StrategyManagementService,
  InMemoryStrategyConfigStorage,
  InMemoryStrategyStateStorage,
} from '../services/StrategyManagementService';
import { StrategyType, StrategyStatus } from '../types/strategy';

describe('StrategyManagementService', () => {
  let service: StrategyManagementService;
  let configStorage: InMemoryStrategyConfigStorage;
  let stateStorage: InMemoryStrategyStateStorage;

  beforeEach(() => {
    configStorage = new InMemoryStrategyConfigStorage();
    stateStorage = new InMemoryStrategyStateStorage();
    service = new StrategyManagementService(configStorage, stateStorage);
  });

  // ─── Create ─────────────────────────────────────────────────────

  describe('createStrategy', () => {
    it('should create a strategy with defaults', async () => {
      const result = await service.createStrategy({
        name: 'Test Value Strategy',
        type: StrategyType.VALUE,
      });

      expect(result.config.id).toBeDefined();
      expect(result.config.name).toBe('Test Value Strategy');
      expect(result.config.type).toBe(StrategyType.VALUE);
      expect(result.config.enabled).toBe(false);
      expect(result.config.autoExecute).toBe(false);
      expect(result.config.maxOrdersPerHour).toBe(10);
      expect(result.config.maxPositionSize).toBe(100);
      expect(result.config.minEdge).toBe(2);
      expect(result.config.minConfidence).toBe(0.55);
    });

    it('should create a strategy with custom settings', async () => {
      const result = await service.createStrategy({
        name: 'Aggressive Arb',
        type: StrategyType.ARBITRAGE,
        enabled: true,
        autoExecute: true,
        maxOrdersPerHour: 50,
        maxPositionSize: 200,
        minEdge: 5,
        minConfidence: 0.7,
        params: { spread_threshold: 3 },
      });

      expect(result.config.type).toBe(StrategyType.ARBITRAGE);
      expect(result.config.enabled).toBe(true);
      expect(result.config.autoExecute).toBe(true);
      expect(result.config.maxOrdersPerHour).toBe(50);
      expect(result.config.minEdge).toBe(5);
      expect(result.config.params).toEqual({ spread_threshold: 3 });
    });

    it('should create default state for new strategy', async () => {
      const result = await service.createStrategy({
        name: 'Test',
        type: StrategyType.VALUE,
      });

      expect(result.state.status).toBe(StrategyStatus.DISABLED);
      expect(result.state.signalsGenerated).toBe(0);
      expect(result.state.tradesExecuted).toBe(0);
      expect(result.state.errorCount).toBe(0);
    });

    it('should throw for empty name', async () => {
      await expect(service.createStrategy({
        name: '',
        type: StrategyType.VALUE,
      })).rejects.toThrow('Strategy name is required');
    });

    it('should throw for whitespace-only name', async () => {
      await expect(service.createStrategy({
        name: '   ',
        type: StrategyType.VALUE,
      })).rejects.toThrow('Strategy name is required');
    });

    it('should throw for invalid type', async () => {
      await expect(service.createStrategy({
        name: 'Test',
        type: 'INVALID' as StrategyType,
      })).rejects.toThrow('Invalid strategy type');
    });

    it('should trim name whitespace', async () => {
      const result = await service.createStrategy({
        name: '  Spaced Name  ',
        type: StrategyType.NEWS,
      });
      expect(result.config.name).toBe('Spaced Name');
    });

    it('should set timestamps', async () => {
      const before = new Date();
      const result = await service.createStrategy({
        name: 'Test',
        type: StrategyType.VALUE,
      });
      const after = new Date();

      expect(result.config.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.config.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(result.config.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should create with category filters', async () => {
      const result = await service.createStrategy({
        name: 'Filtered',
        type: StrategyType.VALUE,
        allowedCategories: ['crypto', 'politics'],
        blockedCategories: ['sports'],
        blockedMarkets: ['BTC-100K'],
      });

      expect(result.config.allowedCategories).toEqual(['crypto', 'politics']);
      expect(result.config.blockedCategories).toEqual(['sports']);
      expect(result.config.blockedMarkets).toEqual(['BTC-100K']);
    });
  });

  // ─── Read ──────────────────────────────────────────────────────

  describe('getStrategy', () => {
    it('should return strategy by ID', async () => {
      const created = await service.createStrategy({
        name: 'Test',
        type: StrategyType.VALUE,
      });

      const fetched = await service.getStrategy(created.config.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.config.name).toBe('Test');
    });

    it('should return null for non-existent ID', async () => {
      const result = await service.getStrategy('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listStrategies', () => {
    it('should return empty list when none exist', async () => {
      const result = await service.listStrategies();
      expect(result).toHaveLength(0);
    });

    it('should return all strategies', async () => {
      await service.createStrategy({ name: 'A', type: StrategyType.VALUE });
      await service.createStrategy({ name: 'B', type: StrategyType.NEWS });
      await service.createStrategy({ name: 'C', type: StrategyType.ARBITRAGE });

      const result = await service.listStrategies();
      expect(result).toHaveLength(3);
    });

    it('should filter by type', async () => {
      await service.createStrategy({ name: 'Val1', type: StrategyType.VALUE });
      await service.createStrategy({ name: 'Val2', type: StrategyType.VALUE });
      await service.createStrategy({ name: 'News1', type: StrategyType.NEWS });

      const result = await service.listStrategies({ type: StrategyType.VALUE });
      expect(result).toHaveLength(2);
      expect(result.every(s => s.config.type === StrategyType.VALUE)).toBe(true);
    });

    it('should filter by enabled', async () => {
      await service.createStrategy({ name: 'On', type: StrategyType.VALUE, enabled: true });
      await service.createStrategy({ name: 'Off', type: StrategyType.VALUE, enabled: false });

      const enabled = await service.listStrategies({ enabled: true });
      expect(enabled).toHaveLength(1);
      expect(enabled[0].config.name).toBe('On');

      const disabled = await service.listStrategies({ enabled: false });
      expect(disabled).toHaveLength(1);
      expect(disabled[0].config.name).toBe('Off');
    });
  });

  // ─── Update ────────────────────────────────────────────────────

  describe('updateStrategy', () => {
    it('should update name', async () => {
      const created = await service.createStrategy({ name: 'Original', type: StrategyType.VALUE });
      const updated = await service.updateStrategy(created.config.id, { name: 'Updated' });
      expect(updated.config.name).toBe('Updated');
    });

    it('should update risk settings', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE });
      const updated = await service.updateStrategy(created.config.id, {
        minEdge: 5,
        minConfidence: 0.8,
        maxOrdersPerHour: 20,
      });

      expect(updated.config.minEdge).toBe(5);
      expect(updated.config.minConfidence).toBe(0.8);
      expect(updated.config.maxOrdersPerHour).toBe(20);
    });

    it('should throw for non-existent strategy', async () => {
      await expect(service.updateStrategy('nonexistent', { name: 'X' }))
        .rejects.toThrow('Strategy not found');
    });

    it('should throw for empty name', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE });
      await expect(service.updateStrategy(created.config.id, { name: '' }))
        .rejects.toThrow('Strategy name cannot be empty');
    });

    it('should preserve unchanged fields', async () => {
      const created = await service.createStrategy({
        name: 'Test',
        type: StrategyType.VALUE,
        minEdge: 3,
        minConfidence: 0.6,
      });
      const updated = await service.updateStrategy(created.config.id, { name: 'New Name' });

      expect(updated.config.minEdge).toBe(3);
      expect(updated.config.minConfidence).toBe(0.6);
    });

    it('should update params', async () => {
      const created = await service.createStrategy({
        name: 'Test',
        type: StrategyType.VALUE,
        params: { a: 1 },
      });
      const updated = await service.updateStrategy(created.config.id, {
        params: { b: 2 },
      });
      expect(updated.config.params).toEqual({ b: 2 });
    });
  });

  // ─── Toggle ────────────────────────────────────────────────────

  describe('toggleStrategy', () => {
    it('should enable a strategy', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE });
      expect(created.config.enabled).toBe(false);

      const toggled = await service.toggleStrategy(created.config.id, true);
      expect(toggled.config.enabled).toBe(true);
    });

    it('should disable a strategy', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE, enabled: true });
      const toggled = await service.toggleStrategy(created.config.id, false);
      expect(toggled.config.enabled).toBe(false);
    });
  });

  // ─── Delete ────────────────────────────────────────────────────

  describe('deleteStrategy', () => {
    it('should delete a strategy', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE });
      await service.deleteStrategy(created.config.id);

      const result = await service.getStrategy(created.config.id);
      expect(result).toBeNull();
    });

    it('should throw for non-existent strategy', async () => {
      await expect(service.deleteStrategy('nonexistent'))
        .rejects.toThrow('Strategy not found');
    });

    it('should throw for active strategy', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE });
      await service.updateState(created.config.id, { status: StrategyStatus.ACTIVE });

      await expect(service.deleteStrategy(created.config.id))
        .rejects.toThrow('Cannot delete an active strategy');
    });

    it('should allow deleting disabled strategy', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE });
      // State is DISABLED by default
      await service.deleteStrategy(created.config.id);

      const list = await service.listStrategies();
      expect(list).toHaveLength(0);
    });
  });

  // ─── State Management ─────────────────────────────────────────

  describe('updateState', () => {
    it('should update state fields', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE });
      const state = await service.updateState(created.config.id, {
        status: StrategyStatus.ACTIVE,
        signalsGenerated: 5,
        tradesExecuted: 2,
      });

      expect(state.status).toBe(StrategyStatus.ACTIVE);
      expect(state.signalsGenerated).toBe(5);
      expect(state.tradesExecuted).toBe(2);
    });

    it('should create state if none exists', async () => {
      // Directly test with a config ID that has no state
      const state = await service.updateState('new-config-id', {
        status: StrategyStatus.PAUSED,
        errorCount: 3,
      });

      expect(state.configId).toBe('new-config-id');
      expect(state.status).toBe(StrategyStatus.PAUSED);
      expect(state.errorCount).toBe(3);
    });

    it('should set updatedAt timestamp', async () => {
      const created = await service.createStrategy({ name: 'Test', type: StrategyType.VALUE });
      const before = new Date();
      const state = await service.updateState(created.config.id, {
        signalsGenerated: 10,
      });

      expect(state.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  // ─── Summary ──────────────────────────────────────────────────

  describe('getSummary', () => {
    it('should return empty summary with no strategies', async () => {
      const summary = await service.getSummary();
      expect(summary.total).toBe(0);
      expect(summary.enabled).toBe(0);
      expect(summary.disabled).toBe(0);
    });

    it('should count by type', async () => {
      await service.createStrategy({ name: 'V1', type: StrategyType.VALUE });
      await service.createStrategy({ name: 'V2', type: StrategyType.VALUE });
      await service.createStrategy({ name: 'N1', type: StrategyType.NEWS });

      const summary = await service.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.byType[StrategyType.VALUE]).toBe(2);
      expect(summary.byType[StrategyType.NEWS]).toBe(1);
      expect(summary.byType[StrategyType.ARBITRAGE]).toBe(0);
    });

    it('should count enabled/disabled', async () => {
      await service.createStrategy({ name: 'On', type: StrategyType.VALUE, enabled: true });
      await service.createStrategy({ name: 'Off1', type: StrategyType.VALUE });
      await service.createStrategy({ name: 'Off2', type: StrategyType.NEWS });

      const summary = await service.getSummary();
      expect(summary.enabled).toBe(1);
      expect(summary.disabled).toBe(2);
    });

    it('should count by status', async () => {
      const s1 = await service.createStrategy({ name: 'A', type: StrategyType.VALUE });
      const s2 = await service.createStrategy({ name: 'B', type: StrategyType.VALUE });
      await service.createStrategy({ name: 'C', type: StrategyType.VALUE });

      await service.updateState(s1.config.id, { status: StrategyStatus.ACTIVE });
      await service.updateState(s2.config.id, { status: StrategyStatus.ERROR });

      const summary = await service.getSummary();
      expect(summary.byStatus[StrategyStatus.ACTIVE]).toBe(1);
      expect(summary.byStatus[StrategyStatus.ERROR]).toBe(1);
      expect(summary.byStatus[StrategyStatus.DISABLED]).toBe(1);
    });
  });
});

// ─── InMemoryStrategyConfigStorage ──────────────────────────────

describe('InMemoryStrategyConfigStorage', () => {
  let storage: InMemoryStrategyConfigStorage;

  beforeEach(() => {
    storage = new InMemoryStrategyConfigStorage();
  });

  it('should store and retrieve configs', async () => {
    const config = {
      id: 'test-1',
      name: 'Test',
      type: StrategyType.VALUE,
      enabled: false,
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

    await storage.create(config);
    const retrieved = await storage.getById('test-1');
    expect(retrieved).toEqual(config);
  });

  it('should clear all configs', async () => {
    await storage.create({
      id: 'a', name: 'A', type: StrategyType.VALUE,
      enabled: false, autoExecute: false, maxOrdersPerHour: 10,
      maxPositionSize: 100, maxNotionalPerTrade: 5000,
      minEdge: 2, minConfidence: 0.55, maxSpread: 10, minLiquidity: 50,
      allowedCategories: [], blockedCategories: [], blockedMarkets: [],
      params: {}, createdAt: new Date(), updatedAt: new Date(),
    });

    storage.clear();
    const all = await storage.getAll();
    expect(all).toHaveLength(0);
  });
});

// ─── InMemoryStrategyStateStorage ───────────────────────────────

describe('InMemoryStrategyStateStorage', () => {
  let storage: InMemoryStrategyStateStorage;

  beforeEach(() => {
    storage = new InMemoryStrategyStateStorage();
  });

  it('should store and retrieve state', async () => {
    const state = {
      id: 's-1',
      configId: 'c-1',
      status: StrategyStatus.ACTIVE,
      errorCount: 0,
      signalsGenerated: 5,
      tradesExecuted: 2,
      tradesRejected: 1,
      pnlToday: 150,
      updatedAt: new Date(),
    };

    await storage.upsert(state);
    const retrieved = await storage.getByConfigId('c-1');
    expect(retrieved).toEqual(state);
  });

  it('should return null for missing configId', async () => {
    const result = await storage.getByConfigId('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete state', async () => {
    await storage.upsert({
      id: 's-1', configId: 'c-1', status: StrategyStatus.DISABLED,
      errorCount: 0, signalsGenerated: 0, tradesExecuted: 0,
      tradesRejected: 0, pnlToday: 0, updatedAt: new Date(),
    });

    await storage.delete('c-1');
    const result = await storage.getByConfigId('c-1');
    expect(result).toBeNull();
  });

  it('should clear all states', async () => {
    await storage.upsert({
      id: 's-1', configId: 'c-1', status: StrategyStatus.DISABLED,
      errorCount: 0, signalsGenerated: 0, tradesExecuted: 0,
      tradesRejected: 0, pnlToday: 0, updatedAt: new Date(),
    });

    storage.clear();
    const result = await storage.getByConfigId('c-1');
    expect(result).toBeNull();
  });
});
