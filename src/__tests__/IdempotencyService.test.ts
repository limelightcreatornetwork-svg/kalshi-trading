// Idempotency Service Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  IdempotencyService,
  IdempotencyConflictError,
} from '../services/IdempotencyService';
import { InMemoryIdempotencyStorage, createIdempotencyService } from './helpers/test-factories';

describe('InMemoryIdempotencyStorage', () => {
  let storage: InMemoryIdempotencyStorage;

  beforeEach(() => {
    storage = new InMemoryIdempotencyStorage();
  });

  it('should store and retrieve records', async () => {
    const record = {
      key: 'test-key',
      requestHash: 'hash123',
      responseStatus: 200,
      responseBody: { success: true },
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
    };

    await storage.set(record);
    const retrieved = await storage.get('test-key');

    expect(retrieved).toEqual(record);
  });

  it('should return null for non-existent key', async () => {
    const result = await storage.get('non-existent');
    expect(result).toBeNull();
  });

  it('should return null for expired records', async () => {
    const record = {
      key: 'expired-key',
      requestHash: 'hash123',
      responseStatus: 200,
      expiresAt: new Date(Date.now() - 1000), // Already expired
      createdAt: new Date(),
    };

    await storage.set(record);
    const result = await storage.get('expired-key');

    expect(result).toBeNull();
  });

  it('should delete records', async () => {
    const record = {
      key: 'delete-me',
      requestHash: 'hash123',
      responseStatus: 200,
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
    };

    await storage.set(record);
    await storage.delete('delete-me');
    const result = await storage.get('delete-me');

    expect(result).toBeNull();
  });

  it('should cleanup expired records', async () => {
    const validRecord = {
      key: 'valid',
      requestHash: 'hash1',
      responseStatus: 200,
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
    };

    const expiredRecord = {
      key: 'expired',
      requestHash: 'hash2',
      responseStatus: 200,
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    };

    await storage.set(validRecord);
    await storage.set(expiredRecord);

    expect(storage.size()).toBe(2);

    const deleted = await storage.cleanup();

    expect(deleted).toBe(1);
    expect(storage.size()).toBe(1);
    expect(await storage.get('valid')).not.toBeNull();
    expect(await storage.get('expired')).toBeNull();
  });
});

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let storage: InMemoryIdempotencyStorage;

  beforeEach(() => {
    storage = new InMemoryIdempotencyStorage();
    service = new IdempotencyService(storage, { ttlMs: 60000 });
  });

  describe('generateKey', () => {
    it('should generate deterministic keys for same inputs', () => {
      const timestamp = Date.now();
      const key1 = service.generateKey('market-1', 'YES', 100, 0.55, timestamp);
      const key2 = service.generateKey('market-1', 'YES', 100, 0.55, timestamp);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const timestamp = Date.now();
      const key1 = service.generateKey('market-1', 'YES', 100, 0.55, timestamp);
      const key2 = service.generateKey('market-1', 'NO', 100, 0.55, timestamp);
      const key3 = service.generateKey('market-1', 'YES', 200, 0.55, timestamp);

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('should handle market orders (no price)', () => {
      const timestamp = Date.now();
      const key1 = service.generateKey('market-1', 'YES', 100, undefined, timestamp);
      const key2 = service.generateKey('market-1', 'YES', 100, undefined, timestamp);

      expect(key1).toBe(key2);
    });
  });

  describe('generateRandomKey', () => {
    it('should generate unique keys', () => {
      const key1 = service.generateRandomKey();
      const key2 = service.generateRandomKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('hashRequest', () => {
    it('should produce same hash for same request', () => {
      const request = { marketId: 'market-1', side: 'YES', quantity: 100 };
      const hash1 = service.hashRequest(request);
      const hash2 = service.hashRequest(request);

      expect(hash1).toBe(hash2);
    });

    it('should produce same hash regardless of key order', () => {
      const request1 = { marketId: 'market-1', side: 'YES', quantity: 100 };
      const request2 = { quantity: 100, side: 'YES', marketId: 'market-1' };

      expect(service.hashRequest(request1)).toBe(service.hashRequest(request2));
    });

    it('should produce different hash for different requests', () => {
      const request1 = { marketId: 'market-1', side: 'YES', quantity: 100 };
      const request2 = { marketId: 'market-1', side: 'NO', quantity: 100 };

      expect(service.hashRequest(request1)).not.toBe(service.hashRequest(request2));
    });
  });

  describe('check', () => {
    it('should return isNew=true for new key', async () => {
      const result = await service.check('new-key', 'hash123');

      expect(result.isNew).toBe(true);
      expect(result.existingRecord).toBeUndefined();
    });

    it('should return existing record for duplicate key with same hash', async () => {
      await service.record('existing-key', 'hash123', 200, { success: true });
      const result = await service.check('existing-key', 'hash123');

      expect(result.isNew).toBe(false);
      expect(result.existingRecord).toBeDefined();
      expect(result.existingRecord?.responseStatus).toBe(200);
    });

    it('should throw IdempotencyConflictError for same key with different hash', async () => {
      await service.record('conflict-key', 'hash123', 200, { success: true });

      await expect(service.check('conflict-key', 'different-hash')).rejects.toThrow(
        IdempotencyConflictError
      );
    });
  });

  describe('record', () => {
    it('should store idempotency record', async () => {
      const record = await service.record(
        'record-key',
        'hash123',
        201,
        { orderId: 'order-1' },
        'order-1'
      );

      expect(record.key).toBe('record-key');
      expect(record.requestHash).toBe('hash123');
      expect(record.responseStatus).toBe(201);
      expect(record.responseBody).toEqual({ orderId: 'order-1' });
      expect(record.orderId).toBe('order-1');
      expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('execute', () => {
    it('should execute function for new request', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 201,
        body: { orderId: 'order-1' },
        orderId: 'order-1',
      });

      const result = await service.execute('exec-key', { marketId: 'market-1' }, fn);

      expect(fn).toHaveBeenCalled();
      expect(result.fromCache).toBe(false);
      expect(result.status).toBe(201);
      expect(result.body).toEqual({ orderId: 'order-1' });
    });

    it('should return cached result for duplicate request', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 201,
        body: { orderId: 'order-1' },
        orderId: 'order-1',
      });

      // First call
      await service.execute('cache-key', { marketId: 'market-1' }, fn);

      // Second call with same key and request
      const result = await service.execute('cache-key', { marketId: 'market-1' }, fn);

      expect(fn).toHaveBeenCalledTimes(1); // Only called once
      expect(result.fromCache).toBe(true);
      expect(result.body).toEqual({ orderId: 'order-1' });
    });

    it('should throw for same key with different request', async () => {
      const fn = vi.fn().mockResolvedValue({ status: 201, body: {} });

      await service.execute('conflict-exec-key', { marketId: 'market-1' }, fn);

      await expect(
        service.execute('conflict-exec-key', { marketId: 'market-2' }, fn)
      ).rejects.toThrow(IdempotencyConflictError);
    });
  });

  describe('invalidate', () => {
    it('should remove idempotency record', async () => {
      await service.record('invalidate-key', 'hash123', 200);
      await service.invalidate('invalidate-key');

      const result = await service.check('invalidate-key', 'hash123');
      expect(result.isNew).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove expired records', async () => {
      // Create service with very short TTL
      const shortTtlService = new IdempotencyService(storage, { ttlMs: 1 });
      
      await shortTtlService.record('cleanup-key', 'hash123', 200);
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const deleted = await shortTtlService.cleanup();
      expect(deleted).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('createIdempotencyService', () => {
  it('should create service with default config', () => {
    const service = createIdempotencyService();
    expect(service).toBeInstanceOf(IdempotencyService);
  });

  it('should create service with custom config', () => {
    const service = createIdempotencyService({ ttlMs: 1000 });
    expect(service).toBeInstanceOf(IdempotencyService);
  });
});

describe('IdempotencyConflictError', () => {
  it('should include idempotency key in error', () => {
    const error = new IdempotencyConflictError('Conflict detected', 'my-key');

    expect(error.name).toBe('IdempotencyConflictError');
    expect(error.message).toBe('Conflict detected');
    expect(error.idempotencyKey).toBe('my-key');
  });
});
