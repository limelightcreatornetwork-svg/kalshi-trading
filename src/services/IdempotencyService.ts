// Idempotency Service
// Implements Tier 1 Feature #14: Idempotent order placement

import crypto from 'crypto';

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody?: unknown;
  orderId?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface IdempotencyCheckResult {
  isNew: boolean;
  existingRecord?: IdempotencyRecord;
}

export interface IdempotencyStorage {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(record: IdempotencyRecord): Promise<void>;
  delete(key: string): Promise<void>;
  cleanup(): Promise<number>; // Returns count of deleted expired records
}

export interface IdempotencyServiceConfig {
  ttlMs: number; // How long idempotency records are valid
  hashAlgorithm: string;
}

const DEFAULT_CONFIG: IdempotencyServiceConfig = {
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  hashAlgorithm: 'sha256',
};

export class IdempotencyService {
  private storage: IdempotencyStorage;
  private config: IdempotencyServiceConfig;

  constructor(storage: IdempotencyStorage, config: Partial<IdempotencyServiceConfig> = {}) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a deterministic idempotency key from request parameters
   * This ensures the same request always gets the same key
   */
  generateKey(
    marketId: string,
    side: string,
    quantity: number,
    price?: number,
    timestamp?: number
  ): string {
    // Include timestamp bucket (1-minute resolution) to allow retries
    const timeBucket = timestamp 
      ? Math.floor(timestamp / 60000) 
      : Math.floor(Date.now() / 60000);
    
    const components = [
      marketId,
      side,
      quantity.toString(),
      price?.toString() ?? 'market',
      timeBucket.toString(),
    ];
    
    return this.hashString(components.join('|'));
  }

  /**
   * Generate a random idempotency key (when caller doesn't provide one)
   */
  generateRandomKey(): string {
    return crypto.randomUUID();
  }

  /**
   * Hash a string for fingerprinting
   */
  hashString(input: string): string {
    return crypto
      .createHash(this.config.hashAlgorithm)
      .update(input)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Hash a request object for comparison
   */
  hashRequest(request: Record<string, unknown>): string {
    // Sort keys for deterministic hashing
    const sortedKeys = Object.keys(request).sort();
    const normalized = sortedKeys.reduce((acc, key) => {
      const value = request[key];
      // Stringify complex values, keep primitives as-is
      acc[key] = typeof value === 'object' ? JSON.stringify(value) : value;
      return acc;
    }, {} as Record<string, unknown>);
    
    return this.hashString(JSON.stringify(normalized));
  }

  /**
   * Check if a request with this key has been processed before
   */
  async check(idempotencyKey: string, requestHash: string): Promise<IdempotencyCheckResult> {
    const existing = await this.storage.get(idempotencyKey);
    
    if (!existing) {
      return { isNew: true };
    }

    // Key exists - verify request hash matches
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyConflictError(
        'Idempotency key already used with different request parameters',
        idempotencyKey
      );
    }

    return {
      isNew: false,
      existingRecord: existing,
    };
  }

  /**
   * Record a successful request
   */
  async record(
    idempotencyKey: string,
    requestHash: string,
    responseStatus: number,
    responseBody?: unknown,
    orderId?: string
  ): Promise<IdempotencyRecord> {
    const record: IdempotencyRecord = {
      key: idempotencyKey,
      requestHash,
      responseStatus,
      responseBody,
      orderId,
      expiresAt: new Date(Date.now() + this.config.ttlMs),
      createdAt: new Date(),
    };

    await this.storage.set(record);
    return record;
  }

  /**
   * Execute a function with idempotency protection
   * If the same key was used before, return the cached result
   */
  async execute<T>(
    idempotencyKey: string,
    request: Record<string, unknown>,
    fn: () => Promise<{ status: number; body: T; orderId?: string }>
  ): Promise<{ status: number; body: T; fromCache: boolean }> {
    const requestHash = this.hashRequest(request);
    
    // Check for existing record
    const checkResult = await this.check(idempotencyKey, requestHash);
    
    if (!checkResult.isNew && checkResult.existingRecord) {
      // Return cached response
      return {
        status: checkResult.existingRecord.responseStatus,
        body: checkResult.existingRecord.responseBody as T,
        fromCache: true,
      };
    }

    // Execute the function
    const result = await fn();
    
    // Record the result
    await this.record(
      idempotencyKey,
      requestHash,
      result.status,
      result.body,
      result.orderId
    );

    return {
      status: result.status,
      body: result.body,
      fromCache: false,
    };
  }

  /**
   * Cleanup expired records
   */
  async cleanup(): Promise<number> {
    return this.storage.cleanup();
  }

  /**
   * Invalidate a specific key (useful for cancellations/amendments)
   */
  async invalidate(idempotencyKey: string): Promise<void> {
    await this.storage.delete(idempotencyKey);
  }
}

// Custom error for idempotency conflicts
export class IdempotencyConflictError extends Error {
  public readonly idempotencyKey: string;

  constructor(message: string, idempotencyKey: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.idempotencyKey = idempotencyKey;
  }
}

