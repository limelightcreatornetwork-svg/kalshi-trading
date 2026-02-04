// Prisma Utility Tests
// Tests for URL validation, fallback behavior, and error paths

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function () {
    return { $connect: vi.fn(), $disconnect: vi.fn() };
  }),
}));

// We test module-level behavior by manipulating globalThis state
// since prisma.ts uses globalForPrisma.prismaInitialized to gate initialization
const g = globalThis as Record<string, unknown>;

describe('Prisma Utility', () => {
  const originalEnv = { ...process.env };
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    g.prismaInitialized = false;
    g.prisma = undefined;
    process.env = { ...originalEnv };
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ─── No DB configured ──────────────────────────────────────────────

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

  // ─── Valid DATABASE_URL ─────────────────────────────────────────────

  describe('valid DATABASE_URL', () => {
    it('should create PrismaClient and requirePrisma should return it', async () => {
      vi.doMock('@prisma/client', () => ({
        PrismaClient: vi.fn().mockImplementation(function () {
          return { $connect: vi.fn(), $disconnect: vi.fn() };
        }),
      }));
      process.env.DATABASE_URL = 'postgresql://localhost:5432/testdb';
      const { prisma, isPrismaAvailable, requirePrisma } = await import('../lib/prisma');
      expect(prisma).not.toBeNull();
      expect(isPrismaAvailable()).toBe(true);
      const result = requirePrisma();
      expect(result).toBe(prisma);
    });

    it('should accept postgres:// scheme and assign to global in non-prod', async () => {
      vi.doMock('@prisma/client', () => ({
        PrismaClient: vi.fn().mockImplementation(function () {
          return { $connect: vi.fn(), $disconnect: vi.fn() };
        }),
      }));
      process.env.DATABASE_URL = 'postgres://localhost:5432/testdb';
      process.env.NODE_ENV = 'development';
      const { prisma, isPrismaAvailable } = await import('../lib/prisma');
      expect(isPrismaAvailable()).toBe(true);
      expect(prisma).not.toBeNull();
      expect(g.prisma).toBe(prisma);
    });
  });

  // ─── Constructor error ──────────────────────────────────────────────

  describe('PrismaClient constructor error', () => {
    it('should return null and log error when PrismaClient constructor throws', async () => {
      vi.doMock('@prisma/client', () => ({
        PrismaClient: vi.fn().mockImplementation(function () {
          throw new Error('Connection failed');
        }),
      }));
      process.env.DATABASE_URL = 'postgresql://localhost:5432/testdb';
      const { prisma, isPrismaAvailable } = await import('../lib/prisma');
      expect(prisma).toBeNull();
      expect(isPrismaAvailable()).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize PrismaClient'),
        expect.any(Error)
      );
    });
  });
});
