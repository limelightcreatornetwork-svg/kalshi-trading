// Prisma Utility Tests
// Tests for URL validation, fallback behavior, and error paths

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  })),
}));

describe('Prisma Utility', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    const g = globalThis as Record<string, unknown>;
    g.prismaInitialized = false;
    g.prisma = undefined;
    process.env = { ...originalEnv };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('isPrismaAvailable - no DB configured', () => {
    it('should return false when DATABASE_URL is not set', async () => {
      delete process.env.DATABASE_URL;
      const { isPrismaAvailable } = await import('../lib/prisma');
      expect(isPrismaAvailable()).toBe(false);
    });

    it('should return false for empty DATABASE_URL', async () => {
      process.env.DATABASE_URL = '';
      const { isPrismaAvailable } = await import('../lib/prisma');
      expect(isPrismaAvailable()).toBe(false);
    });

    it('should return false for mysql URL', async () => {
      process.env.DATABASE_URL = 'mysql://localhost:3306/test';
      const { isPrismaAvailable } = await import('../lib/prisma');
      expect(isPrismaAvailable()).toBe(false);
    });

    it('should return false for sqlite URL', async () => {
      process.env.DATABASE_URL = 'file:./dev.db';
      const { isPrismaAvailable } = await import('../lib/prisma');
      expect(isPrismaAvailable()).toBe(false);
    });

    it('should return false for random string', async () => {
      process.env.DATABASE_URL = 'not-a-database-url';
      const { isPrismaAvailable } = await import('../lib/prisma');
      expect(isPrismaAvailable()).toBe(false);
    });
  });

  describe('prisma export - no DB', () => {
    it('should export null when no DATABASE_URL', async () => {
      delete process.env.DATABASE_URL;
      const { prisma } = await import('../lib/prisma');
      expect(prisma).toBeNull();
    });

    it('should warn about missing DATABASE_URL', async () => {
      delete process.env.DATABASE_URL;
      await import('../lib/prisma');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL not configured')
      );
    });
  });

  describe('requirePrisma', () => {
    it('should throw when database is not configured', async () => {
      delete process.env.DATABASE_URL;
      const { requirePrisma } = await import('../lib/prisma');
      expect(() => requirePrisma()).toThrow('Database not configured');
    });

    it('should throw with helpful error message', async () => {
      delete process.env.DATABASE_URL;
      const { requirePrisma } = await import('../lib/prisma');
      expect(() => requirePrisma()).toThrow('Set DATABASE_URL');
    });
  });
});
