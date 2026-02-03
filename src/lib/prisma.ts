// Prisma Client Singleton with Neon Adapter (Prisma 7+)
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Only initialize PrismaClient if DATABASE_URL is configured
const isDatabaseConfigured = !!process.env.DATABASE_URL;

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient | null = isDatabaseConfigured
  ? globalForPrisma.prisma ?? createPrismaClient()
  : null;

if (isDatabaseConfigured && process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma!;
}

export default prisma;

/**
 * Helper to ensure prisma is available
 * Throws an error if database is not configured
 */
export function requirePrisma(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not configured. Set DATABASE_URL in .env');
  }
  return prisma;
}
