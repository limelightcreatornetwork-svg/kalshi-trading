// Prisma Client Singleton with graceful fallback
// If DATABASE_URL is not configured or connection fails, operations will use in-memory fallback

import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | null | undefined;
  prismaInitialized: boolean;
};

// Check if DATABASE_URL looks like a valid PostgreSQL connection string
function isValidPostgresUrl(url: string | undefined): boolean {
  if (!url) return false;
  // Should start with postgres:// or postgresql://
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

function createPrismaClient(): PrismaClient | null {
  const connectionString = process.env.DATABASE_URL;
  
  if (!isValidPostgresUrl(connectionString)) {
    console.warn('[Prisma] DATABASE_URL not configured or not a PostgreSQL URL. Database operations will use in-memory fallback.');
    return null;
  }
  
  try {
    // DATABASE_URL is read automatically by Prisma from the environment
    return new PrismaClient();
  } catch (error) {
    console.error('[Prisma] Failed to initialize PrismaClient:', error);
    return null;
  }
}

// Initialize only once
if (!globalForPrisma.prismaInitialized) {
  globalForPrisma.prisma = createPrismaClient();
  globalForPrisma.prismaInitialized = true;
}

export const prisma: PrismaClient | null = globalForPrisma.prisma ?? null;

if (prisma && process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

/**
 * Helper to ensure prisma is available
 * Throws an error if database is not configured
 */
export function requirePrisma(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not configured. Set DATABASE_URL with a valid PostgreSQL connection string in .env');
  }
  return prisma;
}

/**
 * Check if prisma is available
 */
export function isPrismaAvailable(): boolean {
  return prisma !== null;
}
