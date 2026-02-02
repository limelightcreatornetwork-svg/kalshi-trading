// Secrets Service Tests
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SecretsService,
  InMemorySecretsStorage,
  createSecretsService,
} from '../services/SecretsService';

describe('InMemorySecretsStorage', () => {
  let storage: InMemorySecretsStorage;

  beforeEach(() => {
    storage = new InMemorySecretsStorage();
  });

  it('should store and retrieve credentials', async () => {
    const credential = {
      id: 'cred-1',
      name: 'My Kalshi Key',
      provider: 'kalshi',
      apiKey: 'encrypted-key',
      apiSecret: 'encrypted-secret',
      scopes: ['read', 'trade'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.create(credential);
    const retrieved = await storage.get('cred-1');

    expect(retrieved).toEqual(credential);
  });

  it('should filter by provider', async () => {
    await storage.create({
      id: 'cred-1',
      name: 'Kalshi Key',
      provider: 'kalshi',
      apiKey: 'key1',
      scopes: ['read'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await storage.create({
      id: 'cred-2',
      name: 'Polygon Key',
      provider: 'polygon',
      apiKey: 'key2',
      scopes: ['read'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const kalshiCreds = await storage.getByProvider('kalshi');
    expect(kalshiCreds).toHaveLength(1);
    expect(kalshiCreds[0].provider).toBe('kalshi');
  });

  it('should only return active credentials', async () => {
    await storage.create({
      id: 'cred-1',
      name: 'Active Key',
      provider: 'kalshi',
      apiKey: 'key1',
      scopes: ['read'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await storage.create({
      id: 'cred-2',
      name: 'Inactive Key',
      provider: 'kalshi',
      apiKey: 'key2',
      scopes: ['read'],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const activeCreds = await storage.getByProvider('kalshi');
    expect(activeCreds).toHaveLength(1);
    expect(activeCreds[0].id).toBe('cred-1');
  });
});

describe('SecretsService', () => {
  let service: SecretsService;
  let storage: InMemorySecretsStorage;
  const testEncryptionKey = 'a'.repeat(64); // 32 bytes in hex

  beforeEach(() => {
    storage = new InMemorySecretsStorage();
    service = new SecretsService(storage, testEncryptionKey);
  });

  describe('constructor', () => {
    it('should throw on invalid encryption key', () => {
      expect(() => new SecretsService(storage, 'short')).toThrow();
    });

    it('should accept valid encryption key', () => {
      expect(() => new SecretsService(storage, testEncryptionKey)).not.toThrow();
    });
  });

  describe('createCredential', () => {
    it('should create encrypted credential', async () => {
      const credential = await service.createCredential(
        'My Kalshi Key',
        'kalshi',
        'my-api-key-12345',
        'my-api-secret-67890',
        ['read', 'trade']
      );

      expect(credential.id).toBeDefined();
      expect(credential.name).toBe('My Kalshi Key');
      expect(credential.provider).toBe('kalshi');
      expect(credential.scopes).toEqual(['read', 'trade']);
      // Public version should NOT contain actual keys
      expect((credential as unknown as Record<string, string>).apiKey).toBeUndefined();
      expect((credential as unknown as Record<string, string>).apiSecret).toBeUndefined();
    });

    it('should validate required fields', async () => {
      await expect(service.createCredential('', 'kalshi', 'key')).rejects.toThrow();
      await expect(service.createCredential('name', '', 'key')).rejects.toThrow();
      await expect(service.createCredential('name', 'kalshi', '')).rejects.toThrow();
    });

    it('should validate API key length', async () => {
      await expect(
        service.createCredential('name', 'kalshi', 'short')
      ).rejects.toThrow('too short');
    });

    it('should default to read scope', async () => {
      const credential = await service.createCredential(
        'My Key',
        'kalshi',
        'my-api-key-12345'
      );

      expect(credential.scopes).toEqual(['read']);
    });
  });

  describe('getCredentialDecrypted', () => {
    it('should return decrypted credentials', async () => {
      const created = await service.createCredential(
        'My Kalshi Key',
        'kalshi',
        'my-api-key-12345',
        'my-api-secret-67890',
        ['read', 'trade']
      );

      const decrypted = await service.getCredentialDecrypted(created.id);

      expect(decrypted).not.toBeNull();
      expect(decrypted?.apiKey).toBe('my-api-key-12345');
      expect(decrypted?.apiSecret).toBe('my-api-secret-67890');
      expect(decrypted?.provider).toBe('kalshi');
      expect(decrypted?.scopes).toEqual(['read', 'trade']);
    });

    it('should return null for non-existent credential', async () => {
      const result = await service.getCredentialDecrypted('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for inactive credential', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'my-api-key-12345'
      );
      await service.deactivateCredential(created.id);

      const result = await service.getCredentialDecrypted(created.id);
      expect(result).toBeNull();
    });

    it('should update lastUsedAt', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'my-api-key-12345'
      );

      expect(created.lastUsedAt).toBeUndefined();

      await service.getCredentialDecrypted(created.id);

      const updated = await storage.get(created.id);
      expect(updated?.lastUsedAt).toBeDefined();
    });
  });

  describe('getProviderCredential', () => {
    it('should return first active credential for provider', async () => {
      await service.createCredential('Key 1', 'kalshi', 'api-key-first-123');
      await service.createCredential('Key 2', 'kalshi', 'api-key-second-456');

      const result = await service.getProviderCredential('kalshi');

      expect(result).not.toBeNull();
      expect(result?.apiKey).toBe('api-key-first-123');
    });

    it('should return null for provider with no credentials', async () => {
      const result = await service.getProviderCredential('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listCredentials', () => {
    it('should return all credentials without secrets', async () => {
      await service.createCredential('Key 1', 'kalshi', 'api-key-12345');
      await service.createCredential('Key 2', 'polygon', 'api-key-67890');

      const list = await service.listCredentials();

      expect(list).toHaveLength(2);
      expect(list[0].name).toBeDefined();
      expect((list[0] as unknown as Record<string, string>).apiKey).toBeUndefined();
    });
  });

  describe('updateCredential', () => {
    it('should update credential name', async () => {
      const created = await service.createCredential(
        'Old Name',
        'kalshi',
        'api-key-12345'
      );

      const updated = await service.updateCredential(created.id, {
        name: 'New Name',
      });

      expect(updated?.name).toBe('New Name');
    });

    it('should update API key with re-encryption', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'old-api-key-123'
      );

      await service.updateCredential(created.id, {
        apiKey: 'new-api-key-456',
      });

      const decrypted = await service.getCredentialDecrypted(created.id);
      expect(decrypted?.apiKey).toBe('new-api-key-456');
    });

    it('should return null for non-existent credential', async () => {
      const result = await service.updateCredential('non-existent', {
        name: 'New Name',
      });
      expect(result).toBeNull();
    });
  });

  describe('deactivateCredential', () => {
    it('should deactivate credential', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'api-key-12345'
      );

      const result = await service.deactivateCredential(created.id);

      expect(result).toBe(true);

      const stored = await storage.get(created.id);
      expect(stored?.isActive).toBe(false);
    });

    it('should return false for non-existent credential', async () => {
      const result = await service.deactivateCredential('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('deleteCredential', () => {
    it('should hard delete credential', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'api-key-12345'
      );

      const result = await service.deleteCredential(created.id);

      expect(result).toBe(true);

      const stored = await storage.get(created.id);
      expect(stored).toBeNull();
    });
  });

  describe('verifyCredential', () => {
    it('should verify valid credential', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'api-key-12345'
      );

      const result = await service.verifyCredential(created.id);

      expect(result.valid).toBe(true);
      expect(result.canDecrypt).toBe(true);
      expect(result.provider).toBe('kalshi');
    });

    it('should return invalid for non-existent credential', async () => {
      const result = await service.verifyCredential('non-existent');

      expect(result.valid).toBe(false);
      expect(result.canDecrypt).toBe(false);
    });

    it('should return invalid for inactive credential', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'api-key-12345'
      );
      await service.deactivateCredential(created.id);

      const result = await service.verifyCredential(created.id);

      expect(result.valid).toBe(false);
    });
  });

  describe('hasScope', () => {
    it('should return true for matching scope', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'api-key-12345',
        undefined,
        ['read', 'trade']
      );

      expect(await service.hasScope(created.id, 'trade')).toBe(true);
    });

    it('should return false for non-matching scope', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'api-key-12345',
        undefined,
        ['read']
      );

      expect(await service.hasScope(created.id, 'trade')).toBe(false);
    });

    it('should return true for wildcard scope', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'api-key-12345',
        undefined,
        ['*']
      );

      expect(await service.hasScope(created.id, 'anything')).toBe(true);
    });

    it('should return false for inactive credential', async () => {
      const created = await service.createCredential(
        'My Key',
        'kalshi',
        'api-key-12345',
        undefined,
        ['read', 'trade']
      );
      await service.deactivateCredential(created.id);

      expect(await service.hasScope(created.id, 'trade')).toBe(false);
    });
  });

  describe('static methods', () => {
    it('maskKey should mask API keys', () => {
      expect(SecretsService.maskKey('my-long-api-key-12345')).toBe('****2345');
      expect(SecretsService.maskKey('short')).toBe('****rt');
    });

    it('generateEncryptionKey should generate valid key', () => {
      const key = SecretsService.generateEncryptionKey();
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(key)).toBe(true);
    });
  });
});

describe('createSecretsService', () => {
  it('should create service with generated key', () => {
    const service = createSecretsService();
    expect(service).toBeInstanceOf(SecretsService);
  });

  it('should create service with provided key', () => {
    const service = createSecretsService('a'.repeat(64));
    expect(service).toBeInstanceOf(SecretsService);
  });
});

describe('Encryption security', () => {
  it('should produce different ciphertexts for same plaintext', async () => {
    const storage = new InMemorySecretsStorage();
    const service = new SecretsService(storage, 'a'.repeat(64));

    await service.createCredential('Key 1', 'provider', 'same-api-key-12345');
    await service.createCredential('Key 2', 'provider', 'same-api-key-12345');

    const all = await storage.list();
    // Due to random IV, encrypted values should be different
    expect(all[0].apiKey).not.toBe(all[1].apiKey);
  });

  it('should use authenticated encryption (GCM)', async () => {
    const storage = new InMemorySecretsStorage();
    const service = new SecretsService(storage, 'a'.repeat(64));

    await service.createCredential('Key 1', 'kalshi', 'api-key-12345');

    const stored = await storage.list();
    // GCM produces: iv:authTag:ciphertext (three parts)
    const parts = stored[0].apiKey.split(':');
    expect(parts).toHaveLength(3);
  });
});
