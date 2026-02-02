// Secrets Service
// Implements Tier 1 Feature #30: Secrets isolation

import crypto from 'crypto';

export interface ApiCredential {
  id: string;
  name: string;
  provider: string;
  apiKey: string;      // Encrypted
  apiSecret?: string;  // Encrypted
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
}

// Redacted version for frontend/logging
export interface ApiCredentialPublic {
  id: string;
  name: string;
  provider: string;
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  // Never include actual key/secret
}

export interface SecretsStorage {
  get(id: string): Promise<ApiCredential | null>;
  getByProvider(provider: string): Promise<ApiCredential[]>;
  create(credential: ApiCredential): Promise<void>;
  update(id: string, updates: Partial<ApiCredential>): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<ApiCredential[]>;
}

// In-memory storage for testing
export class InMemorySecretsStorage implements SecretsStorage {
  private credentials: Map<string, ApiCredential> = new Map();

  async get(id: string): Promise<ApiCredential | null> {
    return this.credentials.get(id) ?? null;
  }

  async getByProvider(provider: string): Promise<ApiCredential[]> {
    return Array.from(this.credentials.values()).filter(
      c => c.provider === provider && c.isActive
    );
  }

  async create(credential: ApiCredential): Promise<void> {
    this.credentials.set(credential.id, credential);
  }

  async update(id: string, updates: Partial<ApiCredential>): Promise<void> {
    const existing = this.credentials.get(id);
    if (existing) {
      this.credentials.set(id, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async delete(id: string): Promise<void> {
    this.credentials.delete(id);
  }

  async list(): Promise<ApiCredential[]> {
    return Array.from(this.credentials.values());
  }

  // For testing
  clear(): void {
    this.credentials.clear();
  }
}

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
}

const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
};

export class SecretsService {
  private storage: SecretsStorage;
  private encryptionKey: Buffer;
  private config: EncryptionConfig;

  constructor(
    storage: SecretsStorage,
    encryptionKeyHex: string,
    config: Partial<EncryptionConfig> = {}
  ) {
    this.storage = storage;
    this.config = { ...DEFAULT_ENCRYPTION_CONFIG, ...config };
    
    // Validate and set encryption key
    if (!encryptionKeyHex || encryptionKeyHex.length < 64) {
      throw new Error('Encryption key must be at least 32 bytes (64 hex chars)');
    }
    this.encryptionKey = Buffer.from(encryptionKeyHex, 'hex').subarray(0, this.config.keyLength);
  }

  /**
   * Encrypt a value
   */
  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(this.config.ivLength);
    const cipher = crypto.createCipheriv(
      this.config.algorithm,
      this.encryptionKey,
      iv
    ) as crypto.CipherGCM;

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a value
   */
  private decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid ciphertext format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(
      this.config.algorithm,
      this.encryptionKey,
      iv
    ) as crypto.DecipherGCM;

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Create a new API credential
   */
  async createCredential(
    name: string,
    provider: string,
    apiKey: string,
    apiSecret?: string,
    scopes: string[] = ['read']
  ): Promise<ApiCredentialPublic> {
    // Validate inputs
    if (!name || !provider || !apiKey) {
      throw new Error('Name, provider, and apiKey are required');
    }

    // Validate API key format (basic check)
    if (apiKey.length < 10) {
      throw new Error('API key appears to be too short');
    }

    const credential: ApiCredential = {
      id: crypto.randomUUID(),
      name,
      provider,
      apiKey: this.encrypt(apiKey),
      apiSecret: apiSecret ? this.encrypt(apiSecret) : undefined,
      scopes,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.create(credential);
    return this.toPublic(credential);
  }

  /**
   * Get credential by ID (returns decrypted for internal use only)
   * This should NEVER be exposed to frontend
   */
  async getCredentialDecrypted(id: string): Promise<{
    apiKey: string;
    apiSecret?: string;
    provider: string;
    scopes: string[];
  } | null> {
    const credential = await this.storage.get(id);
    if (!credential || !credential.isActive) {
      return null;
    }

    // Update last used timestamp
    await this.storage.update(id, { lastUsedAt: new Date() });

    return {
      apiKey: this.decrypt(credential.apiKey),
      apiSecret: credential.apiSecret ? this.decrypt(credential.apiSecret) : undefined,
      provider: credential.provider,
      scopes: credential.scopes,
    };
  }

  /**
   * Get active credential for a provider (internal use)
   */
  async getProviderCredential(provider: string): Promise<{
    id: string;
    apiKey: string;
    apiSecret?: string;
    scopes: string[];
  } | null> {
    const credentials = await this.storage.getByProvider(provider);
    if (credentials.length === 0) {
      return null;
    }

    // Use the first active credential
    const credential = credentials[0];
    
    // Update last used timestamp
    await this.storage.update(credential.id, { lastUsedAt: new Date() });

    return {
      id: credential.id,
      apiKey: this.decrypt(credential.apiKey),
      apiSecret: credential.apiSecret ? this.decrypt(credential.apiSecret) : undefined,
      scopes: credential.scopes,
    };
  }

  /**
   * List all credentials (public info only)
   */
  async listCredentials(): Promise<ApiCredentialPublic[]> {
    const credentials = await this.storage.list();
    return credentials.map(c => this.toPublic(c));
  }

  /**
   * Update credential
   */
  async updateCredential(
    id: string,
    updates: {
      name?: string;
      apiKey?: string;
      apiSecret?: string;
      scopes?: string[];
      isActive?: boolean;
    }
  ): Promise<ApiCredentialPublic | null> {
    const credential = await this.storage.get(id);
    if (!credential) {
      return null;
    }

    const updateData: Partial<ApiCredential> = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.scopes) updateData.scopes = updates.scopes;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.apiKey) updateData.apiKey = this.encrypt(updates.apiKey);
    if (updates.apiSecret) updateData.apiSecret = this.encrypt(updates.apiSecret);

    await this.storage.update(id, updateData);
    
    const updated = await this.storage.get(id);
    return updated ? this.toPublic(updated) : null;
  }

  /**
   * Deactivate a credential (soft delete)
   */
  async deactivateCredential(id: string): Promise<boolean> {
    const credential = await this.storage.get(id);
    if (!credential) {
      return false;
    }

    await this.storage.update(id, { isActive: false });
    return true;
  }

  /**
   * Hard delete a credential
   */
  async deleteCredential(id: string): Promise<boolean> {
    const credential = await this.storage.get(id);
    if (!credential) {
      return false;
    }

    await this.storage.delete(id);
    return true;
  }

  /**
   * Verify a credential works (does not expose actual key)
   */
  async verifyCredential(id: string): Promise<{
    valid: boolean;
    canDecrypt: boolean;
    provider: string;
    scopes: string[];
  }> {
    const credential = await this.storage.get(id);
    if (!credential) {
      return { valid: false, canDecrypt: false, provider: '', scopes: [] };
    }

    let canDecrypt = false;
    try {
      this.decrypt(credential.apiKey);
      canDecrypt = true;
    } catch {
      canDecrypt = false;
    }

    return {
      valid: credential.isActive && canDecrypt,
      canDecrypt,
      provider: credential.provider,
      scopes: credential.scopes,
    };
  }

  /**
   * Check if a credential has a required scope
   */
  async hasScope(id: string, requiredScope: string): Promise<boolean> {
    const credential = await this.storage.get(id);
    if (!credential || !credential.isActive) {
      return false;
    }

    return credential.scopes.includes(requiredScope) || credential.scopes.includes('*');
  }

  /**
   * Convert to public representation (no secrets)
   */
  private toPublic(credential: ApiCredential): ApiCredentialPublic {
    return {
      id: credential.id,
      name: credential.name,
      provider: credential.provider,
      scopes: credential.scopes,
      isActive: credential.isActive,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      lastUsedAt: credential.lastUsedAt,
    };
  }

  /**
   * Mask an API key for logging (show only last 4 chars)
   */
  static maskKey(key: string): string {
    if (key.length <= 8) {
      return '****' + key.slice(-2);
    }
    return '****' + key.slice(-4);
  }

  /**
   * Generate a new encryption key (for initial setup)
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Factory function
export function createSecretsService(encryptionKey?: string): SecretsService {
  const key = encryptionKey ?? SecretsService.generateEncryptionKey();
  return new SecretsService(new InMemorySecretsStorage(), key);
}
