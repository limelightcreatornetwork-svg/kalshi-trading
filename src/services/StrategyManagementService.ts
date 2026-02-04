// Strategy Management Service
// CRUD operations for strategy configurations with state tracking

import {
  StrategyConfig,
  StrategyState,
  StrategyStatus,
  StrategyType,
} from '../types/strategy';

// ─── Storage Interface ──────────────────────────────────────────────

export interface StrategyConfigStorage {
  getAll(): Promise<StrategyConfig[]>;
  getById(id: string): Promise<StrategyConfig | null>;
  getByType(type: StrategyType): Promise<StrategyConfig[]>;
  getEnabled(): Promise<StrategyConfig[]>;
  create(config: StrategyConfig): Promise<void>;
  update(id: string, updates: Partial<StrategyConfig>): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface StrategyStateStorage {
  getByConfigId(configId: string): Promise<StrategyState | null>;
  upsert(state: StrategyState): Promise<void>;
  delete(configId: string): Promise<void>;
}

// ─── In-Memory Storage ──────────────────────────────────────────────

export class InMemoryStrategyConfigStorage implements StrategyConfigStorage {
  private configs: Map<string, StrategyConfig> = new Map();

  async getAll(): Promise<StrategyConfig[]> {
    return Array.from(this.configs.values());
  }

  async getById(id: string): Promise<StrategyConfig | null> {
    return this.configs.get(id) ?? null;
  }

  async getByType(type: StrategyType): Promise<StrategyConfig[]> {
    return Array.from(this.configs.values()).filter(c => c.type === type);
  }

  async getEnabled(): Promise<StrategyConfig[]> {
    return Array.from(this.configs.values()).filter(c => c.enabled);
  }

  async create(config: StrategyConfig): Promise<void> {
    this.configs.set(config.id, config);
  }

  async update(id: string, updates: Partial<StrategyConfig>): Promise<void> {
    const existing = this.configs.get(id);
    if (existing) {
      this.configs.set(id, { ...existing, ...updates, id, updatedAt: new Date() });
    }
  }

  async delete(id: string): Promise<void> {
    this.configs.delete(id);
  }

  clear(): void {
    this.configs.clear();
  }
}

export class InMemoryStrategyStateStorage implements StrategyStateStorage {
  private states: Map<string, StrategyState> = new Map();

  async getByConfigId(configId: string): Promise<StrategyState | null> {
    return this.states.get(configId) ?? null;
  }

  async upsert(state: StrategyState): Promise<void> {
    this.states.set(state.configId, state);
  }

  async delete(configId: string): Promise<void> {
    this.states.delete(configId);
  }

  clear(): void {
    this.states.clear();
  }
}

// ─── Service ────────────────────────────────────────────────────────

export interface CreateStrategyInput {
  name: string;
  type: StrategyType;
  enabled?: boolean;
  autoExecute?: boolean;
  maxOrdersPerHour?: number;
  maxPositionSize?: number;
  maxNotionalPerTrade?: number;
  minEdge?: number;
  minConfidence?: number;
  maxSpread?: number;
  minLiquidity?: number;
  allowedCategories?: string[];
  blockedCategories?: string[];
  blockedMarkets?: string[];
  params?: Record<string, unknown>;
}

export interface UpdateStrategyInput {
  name?: string;
  enabled?: boolean;
  autoExecute?: boolean;
  maxOrdersPerHour?: number;
  maxPositionSize?: number;
  maxNotionalPerTrade?: number;
  minEdge?: number;
  minConfidence?: number;
  maxSpread?: number;
  minLiquidity?: number;
  allowedCategories?: string[];
  blockedCategories?: string[];
  blockedMarkets?: string[];
  params?: Record<string, unknown>;
}

export interface StrategyWithState {
  config: StrategyConfig;
  state: StrategyState;
}

const DEFAULT_STRATEGY_CONFIG: Omit<StrategyConfig, 'id' | 'name' | 'type' | 'createdAt' | 'updatedAt' | 'params'> = {
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
};

export class StrategyManagementService {
  constructor(
    private configStorage: StrategyConfigStorage,
    private stateStorage: StrategyStateStorage
  ) {}

  async listStrategies(filter?: { type?: StrategyType; enabled?: boolean }): Promise<StrategyWithState[]> {
    let configs: StrategyConfig[];

    if (filter?.type) {
      configs = await this.configStorage.getByType(filter.type);
    } else if (filter?.enabled !== undefined) {
      if (filter.enabled) {
        configs = await this.configStorage.getEnabled();
      } else {
        const all = await this.configStorage.getAll();
        configs = all.filter(c => !c.enabled);
      }
    } else {
      configs = await this.configStorage.getAll();
    }

    const results: StrategyWithState[] = [];
    for (const config of configs) {
      const state = await this.stateStorage.getByConfigId(config.id);
      results.push({
        config,
        state: state ?? this.createDefaultState(config.id),
      });
    }

    return results;
  }

  async getStrategy(id: string): Promise<StrategyWithState | null> {
    const config = await this.configStorage.getById(id);
    if (!config) return null;

    const state = await this.stateStorage.getByConfigId(id);
    return {
      config,
      state: state ?? this.createDefaultState(id),
    };
  }

  async createStrategy(input: CreateStrategyInput): Promise<StrategyWithState> {
    if (!input.name?.trim()) {
      throw new Error('Strategy name is required');
    }

    if (!Object.values(StrategyType).includes(input.type)) {
      throw new Error(`Invalid strategy type: ${input.type}`);
    }

    const id = crypto.randomUUID();
    const now = new Date();

    const config: StrategyConfig = {
      id,
      name: input.name.trim(),
      type: input.type,
      enabled: input.enabled ?? DEFAULT_STRATEGY_CONFIG.enabled,
      autoExecute: input.autoExecute ?? DEFAULT_STRATEGY_CONFIG.autoExecute,
      maxOrdersPerHour: input.maxOrdersPerHour ?? DEFAULT_STRATEGY_CONFIG.maxOrdersPerHour,
      maxPositionSize: input.maxPositionSize ?? DEFAULT_STRATEGY_CONFIG.maxPositionSize,
      maxNotionalPerTrade: input.maxNotionalPerTrade ?? DEFAULT_STRATEGY_CONFIG.maxNotionalPerTrade,
      minEdge: input.minEdge ?? DEFAULT_STRATEGY_CONFIG.minEdge,
      minConfidence: input.minConfidence ?? DEFAULT_STRATEGY_CONFIG.minConfidence,
      maxSpread: input.maxSpread ?? DEFAULT_STRATEGY_CONFIG.maxSpread,
      minLiquidity: input.minLiquidity ?? DEFAULT_STRATEGY_CONFIG.minLiquidity,
      allowedCategories: input.allowedCategories ?? DEFAULT_STRATEGY_CONFIG.allowedCategories,
      blockedCategories: input.blockedCategories ?? DEFAULT_STRATEGY_CONFIG.blockedCategories,
      blockedMarkets: input.blockedMarkets ?? DEFAULT_STRATEGY_CONFIG.blockedMarkets,
      params: input.params ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const state = this.createDefaultState(id);

    await this.configStorage.create(config);
    await this.stateStorage.upsert(state);

    return { config, state };
  }

  async updateStrategy(id: string, input: UpdateStrategyInput): Promise<StrategyWithState> {
    const existing = await this.configStorage.getById(id);
    if (!existing) {
      throw new Error(`Strategy not found: ${id}`);
    }

    if (input.name !== undefined && !input.name.trim()) {
      throw new Error('Strategy name cannot be empty');
    }

    const updates: Partial<StrategyConfig> = {};
    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.autoExecute !== undefined) updates.autoExecute = input.autoExecute;
    if (input.maxOrdersPerHour !== undefined) updates.maxOrdersPerHour = input.maxOrdersPerHour;
    if (input.maxPositionSize !== undefined) updates.maxPositionSize = input.maxPositionSize;
    if (input.maxNotionalPerTrade !== undefined) updates.maxNotionalPerTrade = input.maxNotionalPerTrade;
    if (input.minEdge !== undefined) updates.minEdge = input.minEdge;
    if (input.minConfidence !== undefined) updates.minConfidence = input.minConfidence;
    if (input.maxSpread !== undefined) updates.maxSpread = input.maxSpread;
    if (input.minLiquidity !== undefined) updates.minLiquidity = input.minLiquidity;
    if (input.allowedCategories !== undefined) updates.allowedCategories = input.allowedCategories;
    if (input.blockedCategories !== undefined) updates.blockedCategories = input.blockedCategories;
    if (input.blockedMarkets !== undefined) updates.blockedMarkets = input.blockedMarkets;
    if (input.params !== undefined) updates.params = input.params;

    await this.configStorage.update(id, updates);

    return (await this.getStrategy(id))!;
  }

  async deleteStrategy(id: string): Promise<void> {
    const existing = await this.configStorage.getById(id);
    if (!existing) {
      throw new Error(`Strategy not found: ${id}`);
    }

    // Don't allow deleting active strategies
    const state = await this.stateStorage.getByConfigId(id);
    if (state && state.status === StrategyStatus.ACTIVE) {
      throw new Error('Cannot delete an active strategy. Disable it first.');
    }

    await this.stateStorage.delete(id);
    await this.configStorage.delete(id);
  }

  async toggleStrategy(id: string, enabled: boolean): Promise<StrategyWithState> {
    return this.updateStrategy(id, { enabled });
  }

  async updateState(configId: string, updates: Partial<StrategyState>): Promise<StrategyState> {
    const existing = await this.stateStorage.getByConfigId(configId);
    const state = existing ?? this.createDefaultState(configId);

    const updated: StrategyState = {
      ...state,
      ...updates,
      id: state.id,
      configId: state.configId,
      updatedAt: new Date(),
    };

    await this.stateStorage.upsert(updated);
    return updated;
  }

  async getSummary(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    byType: Record<StrategyType, number>;
    byStatus: Record<StrategyStatus, number>;
  }> {
    const all = await this.listStrategies();

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

    let enabled = 0;
    let disabled = 0;

    for (const { config, state } of all) {
      byType[config.type]++;
      byStatus[state.status]++;
      if (config.enabled) enabled++;
      else disabled++;
    }

    return {
      total: all.length,
      enabled,
      disabled,
      byType,
      byStatus,
    };
  }

  private createDefaultState(configId: string): StrategyState {
    return {
      id: crypto.randomUUID(),
      configId,
      status: StrategyStatus.DISABLED,
      errorCount: 0,
      signalsGenerated: 0,
      tradesExecuted: 0,
      tradesRejected: 0,
      pnlToday: 0,
      updatedAt: new Date(),
    };
  }
}
