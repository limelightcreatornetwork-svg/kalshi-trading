/**
 * Storage Services Tests
 * 
 * Tests for all Prisma-based storage adapters:
 * - PrismaDailyPnLStorage
 * - PrismaSecretsStorage
 * - PrismaKillSwitchStorage
 * - PrismaAnalyticsStorage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before imports
const mockPrisma = {
  dailyPnL: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  apiCredential: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  killSwitch: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  killSwitchConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  dailySnapshot: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  tradeHistory: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
    return fn(mockPrisma);
  }),
};

vi.mock('../lib/prisma', () => ({
  requirePrisma: () => mockPrisma,
}));

import { PrismaDailyPnLStorage } from '../services/storage/prismaDailyPnLStorage';
import { PrismaSecretsStorage } from '../services/storage/prismaSecretsStorage';
import { PrismaKillSwitchStorage } from '../services/storage/prismaKillSwitchStorage';
import { PrismaSnapshotStorage, PrismaTradeStorage } from '../services/storage/prismaAnalyticsStorage';

// ============================================================================
// PrismaDailyPnLStorage Tests
// ============================================================================

describe('PrismaDailyPnLStorage', () => {
  let storage: PrismaDailyPnLStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new PrismaDailyPnLStorage();
  });

  const mockPnLRecord = {
    id: 'pnl-1',
    date: new Date('2024-01-15T00:00:00.000Z'),
    realizedPnl: 100.5,
    unrealizedPnl: 50.25,
    fees: 5.0,
    grossPnl: 150.75,
    netPnl: 145.75,
    tradesCount: 10,
    winCount: 7,
    lossCount: 3,
    positionsOpened: 5,
    positionsClosed: 4,
    peakPnl: 200.0,
    drawdown: 50.0,
    drawdownPct: 25.0,
    createdAt: new Date('2024-01-15T00:00:00Z'),
    updatedAt: new Date('2024-01-15T12:00:00Z'),
  };

  describe('getByDate', () => {
    it('should return mapped PnL record when found', async () => {
      mockPrisma.dailyPnL.findUnique.mockResolvedValue(mockPnLRecord);

      const result = await storage.getByDate('2024-01-15');

      expect(mockPrisma.dailyPnL.findUnique).toHaveBeenCalledWith({
        where: { date: new Date('2024-01-15T00:00:00.000Z') },
      });
      expect(result).toEqual({
        id: 'pnl-1',
        date: '2024-01-15',
        realizedPnl: 100.5,
        unrealizedPnl: 50.25,
        fees: 5.0,
        grossPnl: 150.75,
        netPnl: 145.75,
        tradesCount: 10,
        winCount: 7,
        lossCount: 3,
        positionsOpened: 5,
        positionsClosed: 4,
        peakPnl: 200.0,
        drawdown: 50.0,
        drawdownPct: 25.0,
        createdAt: mockPnLRecord.createdAt,
        updatedAt: mockPnLRecord.updatedAt,
      });
    });

    it('should return null when record not found', async () => {
      mockPrisma.dailyPnL.findUnique.mockResolvedValue(null);

      const result = await storage.getByDate('2024-01-15');

      expect(result).toBeNull();
    });

    it('should handle string date in record', async () => {
      const recordWithStringDate = { ...mockPnLRecord, date: '2024-01-15' };
      mockPrisma.dailyPnL.findUnique.mockResolvedValue(recordWithStringDate);

      const result = await storage.getByDate('2024-01-15');

      expect(result?.date).toBe('2024-01-15');
    });

    it('should handle null values with defaults', async () => {
      const recordWithNulls = {
        ...mockPnLRecord,
        realizedPnl: null,
        unrealizedPnl: null,
        fees: null,
        grossPnl: null,
        netPnl: null,
        tradesCount: null,
        winCount: null,
        lossCount: null,
        positionsOpened: null,
        positionsClosed: null,
        peakPnl: null,
        drawdown: null,
        drawdownPct: null,
      };
      mockPrisma.dailyPnL.findUnique.mockResolvedValue(recordWithNulls);

      const result = await storage.getByDate('2024-01-15');

      expect(result?.realizedPnl).toBe(0);
      expect(result?.tradesCount).toBe(0);
      expect(result?.winCount).toBe(0);
    });
  });

  describe('create', () => {
    it('should create a new PnL record', async () => {
      mockPrisma.dailyPnL.create.mockResolvedValue(mockPnLRecord);

      const pnl = {
        id: 'pnl-1',
        date: '2024-01-15',
        realizedPnl: 100.5,
        unrealizedPnl: 50.25,
        fees: 5.0,
        grossPnl: 150.75,
        netPnl: 145.75,
        tradesCount: 10,
        winCount: 7,
        lossCount: 3,
        positionsOpened: 5,
        positionsClosed: 4,
        peakPnl: 200.0,
        drawdown: 50.0,
        drawdownPct: 25.0,
        createdAt: new Date('2024-01-15T00:00:00Z'),
        updatedAt: new Date('2024-01-15T12:00:00Z'),
      };

      await storage.create(pnl);

      expect(mockPrisma.dailyPnL.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'pnl-1',
          date: new Date('2024-01-15T00:00:00.000Z'),
          realizedPnl: 100.5,
        }),
      });
    });
  });

  describe('update', () => {
    it('should update an existing PnL record', async () => {
      mockPrisma.dailyPnL.update.mockResolvedValue(mockPnLRecord);

      const updates = {
        realizedPnl: 200.0,
        winCount: 10,
        updatedAt: new Date('2024-01-15T15:00:00Z'),
      };

      await storage.update('2024-01-15', updates);

      expect(mockPrisma.dailyPnL.update).toHaveBeenCalledWith({
        where: { date: new Date('2024-01-15T00:00:00.000Z') },
        data: expect.objectContaining({
          realizedPnl: 200.0,
          winCount: 10,
        }),
      });
    });

    it('should use current date for updatedAt when not provided', async () => {
      mockPrisma.dailyPnL.update.mockResolvedValue(mockPnLRecord);
      const before = new Date();

      await storage.update('2024-01-15', { realizedPnl: 100 });

      const call = mockPrisma.dailyPnL.update.mock.calls[0][0];
      expect(call.data.updatedAt).toBeInstanceOf(Date);
      expect(call.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('getRange', () => {
    it('should return PnL records within date range', async () => {
      mockPrisma.dailyPnL.findMany.mockResolvedValue([mockPnLRecord]);

      const result = await storage.getRange('2024-01-01', '2024-01-31');

      expect(mockPrisma.dailyPnL.findMany).toHaveBeenCalledWith({
        where: {
          date: {
            gte: new Date('2024-01-01T00:00:00.000Z'),
            lte: new Date('2024-01-31T00:00:00.000Z'),
          },
        },
        orderBy: { date: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
    });

    it('should return empty array when no records found', async () => {
      mockPrisma.dailyPnL.findMany.mockResolvedValue([]);

      const result = await storage.getRange('2024-01-01', '2024-01-31');

      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// PrismaSecretsStorage Tests
// ============================================================================

describe('PrismaSecretsStorage', () => {
  let storage: PrismaSecretsStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new PrismaSecretsStorage();
  });

  const mockCredentialRecord = {
    id: 'cred-1',
    name: 'Test API Key',
    provider: 'kalshi',
    apiKey: 'encrypted-api-key',
    apiSecret: 'encrypted-api-secret',
    scopes: ['read', 'trade'],
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T12:00:00Z'),
    lastUsedAt: new Date('2024-01-15T08:00:00Z'),
  };

  describe('get', () => {
    it('should return mapped credential when found', async () => {
      mockPrisma.apiCredential.findUnique.mockResolvedValue(mockCredentialRecord);

      const result = await storage.get('cred-1');

      expect(mockPrisma.apiCredential.findUnique).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
      });
      expect(result).toEqual({
        id: 'cred-1',
        name: 'Test API Key',
        provider: 'kalshi',
        apiKey: 'encrypted-api-key',
        apiSecret: 'encrypted-api-secret',
        scopes: ['read', 'trade'],
        isActive: true,
        createdAt: mockCredentialRecord.createdAt,
        updatedAt: mockCredentialRecord.updatedAt,
        lastUsedAt: mockCredentialRecord.lastUsedAt,
      });
    });

    it('should return null when not found', async () => {
      mockPrisma.apiCredential.findUnique.mockResolvedValue(null);

      const result = await storage.get('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle null optional fields', async () => {
      const recordWithNulls = {
        ...mockCredentialRecord,
        apiSecret: null,
        scopes: null,
        lastUsedAt: null,
      };
      mockPrisma.apiCredential.findUnique.mockResolvedValue(recordWithNulls);

      const result = await storage.get('cred-1');

      expect(result?.apiSecret).toBeUndefined();
      expect(result?.scopes).toEqual([]);
      expect(result?.lastUsedAt).toBeUndefined();
    });
  });

  describe('getByProvider', () => {
    it('should return active credentials for provider', async () => {
      mockPrisma.apiCredential.findMany.mockResolvedValue([mockCredentialRecord]);

      const result = await storage.getByProvider('kalshi');

      expect(mockPrisma.apiCredential.findMany).toHaveBeenCalledWith({
        where: { provider: 'kalshi', isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('kalshi');
    });

    it('should return empty array when no credentials found', async () => {
      mockPrisma.apiCredential.findMany.mockResolvedValue([]);

      const result = await storage.getByProvider('unknown');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create a new credential', async () => {
      mockPrisma.apiCredential.create.mockResolvedValue(mockCredentialRecord);

      const credential = {
        id: 'cred-1',
        name: 'Test API Key',
        provider: 'kalshi',
        apiKey: 'encrypted-api-key',
        apiSecret: 'encrypted-api-secret',
        scopes: ['read', 'trade'],
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        lastUsedAt: new Date('2024-01-15T08:00:00Z'),
      };

      await storage.create(credential);

      expect(mockPrisma.apiCredential.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'cred-1',
          name: 'Test API Key',
          provider: 'kalshi',
        }),
      });
    });

    it('should handle undefined optional fields', async () => {
      mockPrisma.apiCredential.create.mockResolvedValue(mockCredentialRecord);

      const credential = {
        id: 'cred-1',
        name: 'Test API Key',
        provider: 'kalshi',
        apiKey: 'encrypted-api-key',
        scopes: ['read'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.create(credential);

      const call = mockPrisma.apiCredential.create.mock.calls[0][0];
      expect(call.data.apiSecret).toBeNull();
      expect(call.data.lastUsedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should update credential fields', async () => {
      mockPrisma.apiCredential.update.mockResolvedValue(mockCredentialRecord);

      await storage.update('cred-1', {
        name: 'Updated Name',
        isActive: false,
      });

      expect(mockPrisma.apiCredential.update).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
        data: expect.objectContaining({
          name: 'Updated Name',
          isActive: false,
        }),
      });
    });

    it('should set default updatedAt when not provided', async () => {
      mockPrisma.apiCredential.update.mockResolvedValue(mockCredentialRecord);
      const before = new Date();

      await storage.update('cred-1', { name: 'Updated' });

      const call = mockPrisma.apiCredential.update.mock.calls[0][0];
      expect(call.data.updatedAt).toBeInstanceOf(Date);
      expect(call.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('delete', () => {
    it('should delete credential by id', async () => {
      mockPrisma.apiCredential.delete.mockResolvedValue(mockCredentialRecord);

      await storage.delete('cred-1');

      expect(mockPrisma.apiCredential.delete).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
      });
    });
  });

  describe('list', () => {
    it('should return all credentials', async () => {
      mockPrisma.apiCredential.findMany.mockResolvedValue([
        mockCredentialRecord,
        { ...mockCredentialRecord, id: 'cred-2', provider: 'other' },
      ]);

      const result = await storage.list();

      expect(mockPrisma.apiCredential.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });
  });
});

// ============================================================================
// PrismaKillSwitchStorage Tests
// ============================================================================

describe('PrismaKillSwitchStorage', () => {
  let storage: PrismaKillSwitchStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new PrismaKillSwitchStorage();
  });

  const mockKillSwitchRecord = {
    id: 'ks-1',
    level: 'GLOBAL',
    targetId: null,
    isActive: true,
    reason: 'MANUAL',
    description: 'Emergency stop',
    triggeredBy: 'user-1',
    triggeredAt: new Date('2024-01-15T10:00:00Z'),
    autoResetAt: null,
    resetBy: null,
    resetAt: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  };

  const mockKillSwitchConfigRecord = {
    id: 'ksc-1',
    level: 'GLOBAL',
    targetId: null,
    maxDailyLoss: 1000,
    maxDrawdown: 500,
    maxErrorRate: 0.1,
    maxLatency: 5000,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  describe('getActive', () => {
    it('should return active kill switches', async () => {
      mockPrisma.killSwitch.findMany.mockResolvedValue([mockKillSwitchRecord]);

      const result = await storage.getActive();

      expect(mockPrisma.killSwitch.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { triggeredAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe('GLOBAL');
      expect(result[0].isActive).toBe(true);
    });

    it('should return empty array when no active switches', async () => {
      mockPrisma.killSwitch.findMany.mockResolvedValue([]);

      const result = await storage.getActive();

      expect(result).toEqual([]);
    });
  });

  describe('getByLevel', () => {
    it('should return kill switches by level', async () => {
      mockPrisma.killSwitch.findMany.mockResolvedValue([mockKillSwitchRecord]);

      const result = await storage.getByLevel('GLOBAL');

      expect(mockPrisma.killSwitch.findMany).toHaveBeenCalledWith({
        where: { level: 'GLOBAL' },
        orderBy: { triggeredAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should return kill switch when found', async () => {
      mockPrisma.killSwitch.findUnique.mockResolvedValue(mockKillSwitchRecord);

      const result = await storage.getById('ks-1');

      expect(mockPrisma.killSwitch.findUnique).toHaveBeenCalledWith({
        where: { id: 'ks-1' },
      });
      expect(result?.id).toBe('ks-1');
    });

    it('should return null when not found', async () => {
      mockPrisma.killSwitch.findUnique.mockResolvedValue(null);

      const result = await storage.getById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle optional fields', async () => {
      const recordWithOptionals = {
        ...mockKillSwitchRecord,
        targetId: 'market-1',
        autoResetAt: new Date('2024-01-16T10:00:00Z'),
        resetBy: 'admin',
        resetAt: new Date('2024-01-15T12:00:00Z'),
        description: 'Test description',
      };
      mockPrisma.killSwitch.findUnique.mockResolvedValue(recordWithOptionals);

      const result = await storage.getById('ks-1');

      expect(result?.targetId).toBe('market-1');
      expect(result?.autoResetAt).toEqual(new Date('2024-01-16T10:00:00Z'));
      expect(result?.resetBy).toBe('admin');
      expect(result?.description).toBe('Test description');
    });
  });

  describe('create', () => {
    it('should create a new kill switch', async () => {
      mockPrisma.killSwitch.create.mockResolvedValue(mockKillSwitchRecord);

      const killSwitch = {
        id: 'ks-1',
        level: 'GLOBAL' as const,
        isActive: true,
        reason: 'MANUAL' as const,
        description: 'Emergency stop',
        triggeredBy: 'user-1',
        triggeredAt: new Date('2024-01-15T10:00:00Z'),
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
      };

      await storage.create(killSwitch);

      expect(mockPrisma.killSwitch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'ks-1',
          level: 'GLOBAL',
          isActive: true,
          reason: 'MANUAL',
        }),
      });
    });

    it('should handle optional fields as null', async () => {
      mockPrisma.killSwitch.create.mockResolvedValue(mockKillSwitchRecord);

      const killSwitch = {
        id: 'ks-1',
        level: 'GLOBAL' as const,
        isActive: true,
        reason: 'MANUAL' as const,
        triggeredBy: 'user-1',
        triggeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.create(killSwitch);

      const call = mockPrisma.killSwitch.create.mock.calls[0][0];
      expect(call.data.targetId).toBeNull();
      expect(call.data.description).toBeNull();
      expect(call.data.autoResetAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should update kill switch fields', async () => {
      mockPrisma.killSwitch.update.mockResolvedValue(mockKillSwitchRecord);

      await storage.update('ks-1', {
        isActive: false,
        resetBy: 'admin',
        resetAt: new Date('2024-01-15T12:00:00Z'),
      });

      expect(mockPrisma.killSwitch.update).toHaveBeenCalledWith({
        where: { id: 'ks-1' },
        data: expect.objectContaining({
          isActive: false,
          resetBy: 'admin',
        }),
      });
    });

    it('should set default updatedAt', async () => {
      mockPrisma.killSwitch.update.mockResolvedValue(mockKillSwitchRecord);
      const before = new Date();

      await storage.update('ks-1', { isActive: false });

      const call = mockPrisma.killSwitch.update.mock.calls[0][0];
      expect(call.data.updatedAt).toBeInstanceOf(Date);
      expect(call.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('getConfig', () => {
    it('should return config for level without targetId', async () => {
      mockPrisma.killSwitchConfig.findUnique.mockResolvedValue(mockKillSwitchConfigRecord);

      const result = await storage.getConfig('GLOBAL');

      expect(mockPrisma.killSwitchConfig.findUnique).toHaveBeenCalledWith({
        where: {
          level_targetId: {
            level: 'GLOBAL',
            targetId: '',
          },
        },
      });
      expect(result?.level).toBe('GLOBAL');
      expect(result?.maxDailyLoss).toBe(1000);
    });

    it('should return config for level with targetId', async () => {
      mockPrisma.killSwitchConfig.findUnique.mockResolvedValue({
        ...mockKillSwitchConfigRecord,
        targetId: 'market-1',
      });

      const result = await storage.getConfig('MARKET', 'market-1');

      expect(mockPrisma.killSwitchConfig.findUnique).toHaveBeenCalledWith({
        where: {
          level_targetId: {
            level: 'MARKET',
            targetId: 'market-1',
          },
        },
      });
      expect(result?.targetId).toBe('market-1');
    });

    it('should return null when config not found', async () => {
      mockPrisma.killSwitchConfig.findUnique.mockResolvedValue(null);

      const result = await storage.getConfig('GLOBAL');

      expect(result).toBeNull();
    });

    it('should handle null numeric fields', async () => {
      const recordWithNulls = {
        ...mockKillSwitchConfigRecord,
        maxDailyLoss: null,
        maxDrawdown: null,
        maxErrorRate: null,
        maxLatency: null,
      };
      mockPrisma.killSwitchConfig.findUnique.mockResolvedValue(recordWithNulls);

      const result = await storage.getConfig('GLOBAL');

      expect(result?.maxDailyLoss).toBeUndefined();
      expect(result?.maxDrawdown).toBeUndefined();
      expect(result?.maxErrorRate).toBeUndefined();
      expect(result?.maxLatency).toBeUndefined();
    });
  });

  describe('setConfig', () => {
    it('should upsert config', async () => {
      mockPrisma.killSwitchConfig.upsert.mockResolvedValue(mockKillSwitchConfigRecord);

      const config = {
        id: 'ksc-1',
        level: 'GLOBAL' as const,
        maxDailyLoss: 1000,
        maxDrawdown: 500,
        maxErrorRate: 0.1,
        maxLatency: 5000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.setConfig(config);

      expect(mockPrisma.killSwitchConfig.upsert).toHaveBeenCalledWith({
        where: {
          level_targetId: {
            level: 'GLOBAL',
            targetId: '',
          },
        },
        create: expect.objectContaining({
          level: 'GLOBAL',
          maxDailyLoss: 1000,
        }),
        update: expect.objectContaining({
          maxDailyLoss: 1000,
        }),
      });
    });

    it('should handle config with targetId', async () => {
      mockPrisma.killSwitchConfig.upsert.mockResolvedValue(mockKillSwitchConfigRecord);

      const config = {
        id: 'ksc-2',
        level: 'MARKET' as const,
        targetId: 'market-1',
        maxDailyLoss: 500,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.setConfig(config);

      const call = mockPrisma.killSwitchConfig.upsert.mock.calls[0][0];
      expect(call.where.level_targetId.targetId).toBe('market-1');
    });
  });
});

// ============================================================================
// PrismaSnapshotStorage Tests
// ============================================================================

describe('PrismaSnapshotStorage', () => {
  let storage: PrismaSnapshotStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new PrismaSnapshotStorage();
  });

  const mockSnapshotRecord = {
    id: 'snap-1',
    date: new Date('2024-01-15T00:00:00.000Z'),
    portfolioValue: 10000,
    cashBalance: 5000,
    positionValue: 5000,
    realizedPnL: 500,
    unrealizedPnL: 200,
    dailyPnL: 100,
    openPositions: 5,
    closedPositions: 3,
    highWaterMark: 10500,
    drawdownAmount: 500,
    drawdownPercent: 4.76,
    createdAt: new Date('2024-01-15T00:00:00Z'),
    updatedAt: new Date('2024-01-15T12:00:00Z'),
  };

  describe('getByDate', () => {
    it('should return mapped snapshot when found', async () => {
      mockPrisma.dailySnapshot.findUnique.mockResolvedValue(mockSnapshotRecord);

      const result = await storage.getByDate('2024-01-15');

      expect(mockPrisma.dailySnapshot.findUnique).toHaveBeenCalledWith({
        where: { date: new Date('2024-01-15T00:00:00.000Z') },
      });
      expect(result).toEqual({
        id: 'snap-1',
        date: '2024-01-15',
        portfolioValue: 10000,
        cashBalance: 5000,
        positionValue: 5000,
        realizedPnL: 500,
        unrealizedPnL: 200,
        dailyPnL: 100,
        openPositions: 5,
        closedPositions: 3,
        highWaterMark: 10500,
        drawdownAmount: 500,
        drawdownPercent: 4.76,
        createdAt: mockSnapshotRecord.createdAt,
        updatedAt: mockSnapshotRecord.updatedAt,
      });
    });

    it('should return null when snapshot not found', async () => {
      mockPrisma.dailySnapshot.findUnique.mockResolvedValue(null);

      const result = await storage.getByDate('2024-01-15');

      expect(result).toBeNull();
    });

    it('should handle string date in record', async () => {
      const recordWithStringDate = { ...mockSnapshotRecord, date: '2024-01-15' };
      mockPrisma.dailySnapshot.findUnique.mockResolvedValue(recordWithStringDate);

      const result = await storage.getByDate('2024-01-15');

      expect(result?.date).toBe('2024-01-15');
    });

    it('should handle null values with defaults', async () => {
      const recordWithNulls = {
        ...mockSnapshotRecord,
        portfolioValue: null,
        cashBalance: null,
        realizedPnL: null,
        openPositions: null,
      };
      mockPrisma.dailySnapshot.findUnique.mockResolvedValue(recordWithNulls);

      const result = await storage.getByDate('2024-01-15');

      expect(result?.portfolioValue).toBe(0);
      expect(result?.cashBalance).toBe(0);
      expect(result?.realizedPnL).toBe(0);
      expect(result?.openPositions).toBe(0);
    });
  });

  describe('getRange', () => {
    it('should return snapshots within date range', async () => {
      mockPrisma.dailySnapshot.findMany.mockResolvedValue([mockSnapshotRecord]);

      const result = await storage.getRange('2024-01-01', '2024-01-31');

      expect(mockPrisma.dailySnapshot.findMany).toHaveBeenCalledWith({
        where: {
          date: {
            gte: new Date('2024-01-01T00:00:00.000Z'),
            lte: new Date('2024-01-31T00:00:00.000Z'),
          },
        },
        orderBy: { date: 'asc' },
        take: undefined,
      });
      expect(result).toHaveLength(1);
    });

    it('should apply limit when provided', async () => {
      mockPrisma.dailySnapshot.findMany.mockResolvedValue([mockSnapshotRecord]);

      await storage.getRange('2024-01-01', '2024-01-31', 10);

      expect(mockPrisma.dailySnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it('should return empty array when no snapshots found', async () => {
      mockPrisma.dailySnapshot.findMany.mockResolvedValue([]);

      const result = await storage.getRange('2024-01-01', '2024-01-31');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create a new snapshot', async () => {
      mockPrisma.dailySnapshot.create.mockResolvedValue(mockSnapshotRecord);

      const snapshot = {
        id: 'snap-1',
        date: '2024-01-15',
        portfolioValue: 10000,
        cashBalance: 5000,
        positionValue: 5000,
        realizedPnL: 500,
        unrealizedPnL: 200,
        dailyPnL: 100,
        openPositions: 5,
        closedPositions: 3,
        highWaterMark: 10500,
        drawdownAmount: 500,
        drawdownPercent: 4.76,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.create(snapshot);

      expect(mockPrisma.dailySnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'snap-1',
          date: new Date('2024-01-15T00:00:00.000Z'),
          portfolioValue: 10000,
        }),
      });
    });
  });

  describe('update', () => {
    it('should update an existing snapshot', async () => {
      mockPrisma.dailySnapshot.update.mockResolvedValue(mockSnapshotRecord);

      const updates = {
        portfolioValue: 11000,
        dailyPnL: 200,
        updatedAt: new Date('2024-01-15T15:00:00Z'),
      };

      await storage.update('2024-01-15', updates);

      expect(mockPrisma.dailySnapshot.update).toHaveBeenCalledWith({
        where: { date: new Date('2024-01-15T00:00:00.000Z') },
        data: expect.objectContaining({
          portfolioValue: 11000,
          dailyPnL: 200,
        }),
      });
    });

    it('should use current date for updatedAt when not provided', async () => {
      mockPrisma.dailySnapshot.update.mockResolvedValue(mockSnapshotRecord);
      const before = new Date();

      await storage.update('2024-01-15', { portfolioValue: 11000 });

      const call = mockPrisma.dailySnapshot.update.mock.calls[0][0];
      expect(call.data.updatedAt).toBeInstanceOf(Date);
      expect(call.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('getLatest', () => {
    it('should return the most recent snapshot', async () => {
      mockPrisma.dailySnapshot.findFirst.mockResolvedValue(mockSnapshotRecord);

      const result = await storage.getLatest();

      expect(mockPrisma.dailySnapshot.findFirst).toHaveBeenCalledWith({
        orderBy: { date: 'desc' },
      });
      expect(result?.id).toBe('snap-1');
    });

    it('should return null when no snapshots exist', async () => {
      mockPrisma.dailySnapshot.findFirst.mockResolvedValue(null);

      const result = await storage.getLatest();

      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// PrismaTradeStorage Tests
// ============================================================================

describe('PrismaTradeStorage', () => {
  let storage: PrismaTradeStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new PrismaTradeStorage();
  });

  const mockTradeRecord = {
    id: 'trade-1',
    marketTicker: 'BTCUSD',
    marketTitle: 'Bitcoin Price',
    side: 'yes',
    direction: 'buy',
    entryPrice: 50,
    entryQuantity: 10,
    entryValue: 500,
    entryDate: new Date('2024-01-15T10:00:00Z'),
    exitPrice: 60,
    exitQuantity: 10,
    exitValue: 600,
    exitDate: new Date('2024-01-16T10:00:00Z'),
    currentPrice: null,
    currentQuantity: null,
    realizedPnL: 100,
    unrealizedPnL: 0,
    fees: 5,
    netPnL: 95,
    pnlPercent: 19,
    result: 'WIN',
    holdingPeriod: 86400,
    strategyId: 'strategy-1',
    thesisId: 'thesis-1',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-16T10:00:00Z'),
  };

  describe('getAll', () => {
    it('should return all trades', async () => {
      mockPrisma.tradeHistory.findMany.mockResolvedValue([mockTradeRecord]);

      const result = await storage.getAll();

      expect(mockPrisma.tradeHistory.findMany).toHaveBeenCalledWith({
        orderBy: { entryDate: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].marketTicker).toBe('BTCUSD');
    });

    it('should return empty array when no trades', async () => {
      mockPrisma.tradeHistory.findMany.mockResolvedValue([]);

      const result = await storage.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('getByResult', () => {
    it('should return trades filtered by result', async () => {
      mockPrisma.tradeHistory.findMany.mockResolvedValue([mockTradeRecord]);

      const result = await storage.getByResult('WIN');

      expect(mockPrisma.tradeHistory.findMany).toHaveBeenCalledWith({
        where: { result: 'WIN' },
        orderBy: { entryDate: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('getByDateRange', () => {
    it('should return trades within date range', async () => {
      mockPrisma.tradeHistory.findMany.mockResolvedValue([mockTradeRecord]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = await storage.getByDateRange(startDate, endDate);

      expect(mockPrisma.tradeHistory.findMany).toHaveBeenCalledWith({
        where: {
          entryDate: { lte: endDate },
          OR: [
            { exitDate: { gte: startDate } },
            { exitDate: null, entryDate: { gte: startDate } },
          ],
        },
        orderBy: { entryDate: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should return trade when found', async () => {
      mockPrisma.tradeHistory.findUnique.mockResolvedValue(mockTradeRecord);

      const result = await storage.getById('trade-1');

      expect(mockPrisma.tradeHistory.findUnique).toHaveBeenCalledWith({
        where: { id: 'trade-1' },
      });
      expect(result?.id).toBe('trade-1');
    });

    it('should return null when not found', async () => {
      mockPrisma.tradeHistory.findUnique.mockResolvedValue(null);

      const result = await storage.getById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle null optional fields', async () => {
      const recordWithNulls = {
        ...mockTradeRecord,
        marketTitle: null,
        exitPrice: null,
        exitQuantity: null,
        exitValue: null,
        exitDate: null,
        currentPrice: null,
        currentQuantity: null,
        holdingPeriod: null,
        strategyId: null,
        thesisId: null,
      };
      mockPrisma.tradeHistory.findUnique.mockResolvedValue(recordWithNulls);

      const result = await storage.getById('trade-1');

      expect(result?.marketTitle).toBeNull();
      expect(result?.exitPrice).toBeNull();
      expect(result?.exitDate).toBeNull();
      expect(result?.strategyId).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new trade', async () => {
      mockPrisma.tradeHistory.create.mockResolvedValue(mockTradeRecord);

      const trade = {
        id: 'trade-1',
        marketTicker: 'BTCUSD',
        marketTitle: 'Bitcoin Price',
        side: 'yes' as const,
        direction: 'buy' as const,
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
        entryDate: new Date('2024-01-15T10:00:00Z'),
        exitPrice: 60,
        exitQuantity: 10,
        exitValue: 600,
        exitDate: new Date('2024-01-16T10:00:00Z'),
        currentPrice: null,
        currentQuantity: null,
        realizedPnL: 100,
        unrealizedPnL: 0,
        fees: 5,
        netPnL: 95,
        pnlPercent: 19,
        result: 'WIN' as const,
        holdingPeriod: 86400,
        strategyId: 'strategy-1',
        thesisId: 'thesis-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.create(trade);

      expect(mockPrisma.tradeHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'trade-1',
          marketTicker: 'BTCUSD',
          side: 'yes',
          direction: 'buy',
        }),
      });
    });

    it('should handle null optional fields', async () => {
      mockPrisma.tradeHistory.create.mockResolvedValue(mockTradeRecord);

      const trade = {
        id: 'trade-1',
        marketTicker: 'BTCUSD',
        marketTitle: null,
        side: 'yes' as const,
        direction: 'buy' as const,
        entryPrice: 50,
        entryQuantity: 10,
        entryValue: 500,
        entryDate: new Date(),
        exitPrice: null,
        exitQuantity: null,
        exitValue: null,
        exitDate: null,
        currentPrice: null,
        currentQuantity: null,
        realizedPnL: 0,
        unrealizedPnL: 0,
        fees: 0,
        netPnL: 0,
        pnlPercent: 0,
        result: 'OPEN' as const,
        holdingPeriod: null,
        strategyId: null,
        thesisId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.create(trade);

      const call = mockPrisma.tradeHistory.create.mock.calls[0][0];
      expect(call.data.marketTitle).toBeNull();
      expect(call.data.exitPrice).toBeNull();
      expect(call.data.strategyId).toBeNull();
    });
  });

  describe('update', () => {
    it('should update trade fields', async () => {
      mockPrisma.tradeHistory.update.mockResolvedValue(mockTradeRecord);

      await storage.update('trade-1', {
        exitPrice: 70,
        exitValue: 700,
        result: 'WIN' as const,
      });

      expect(mockPrisma.tradeHistory.update).toHaveBeenCalledWith({
        where: { id: 'trade-1' },
        data: expect.objectContaining({
          exitPrice: 70,
          exitValue: 700,
          result: 'WIN',
        }),
      });
    });

    it('should set default updatedAt when not provided', async () => {
      mockPrisma.tradeHistory.update.mockResolvedValue(mockTradeRecord);
      const before = new Date();

      await storage.update('trade-1', { exitPrice: 70 });

      const call = mockPrisma.tradeHistory.update.mock.calls[0][0];
      expect(call.data.updatedAt).toBeInstanceOf(Date);
      expect(call.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('getOpenTrades', () => {
    it('should return trades with OPEN result', async () => {
      const openTrade = { ...mockTradeRecord, result: 'OPEN' };
      mockPrisma.tradeHistory.findMany.mockResolvedValue([openTrade]);

      const result = await storage.getOpenTrades();

      expect(mockPrisma.tradeHistory.findMany).toHaveBeenCalledWith({
        where: { result: 'OPEN' },
        orderBy: { entryDate: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].result).toBe('OPEN');
    });
  });

  describe('getClosedTrades', () => {
    it('should return trades with non-OPEN result', async () => {
      mockPrisma.tradeHistory.findMany.mockResolvedValue([mockTradeRecord]);

      const result = await storage.getClosedTrades();

      expect(mockPrisma.tradeHistory.findMany).toHaveBeenCalledWith({
        where: { result: { not: 'OPEN' } },
        orderBy: { entryDate: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });
});
