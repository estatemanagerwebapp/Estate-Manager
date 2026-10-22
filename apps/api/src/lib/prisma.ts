import { PrismaClient } from '@prisma/client';
import { AppError } from './errors.js';
import { logger } from './logger.js';

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (client) return client;
  client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  return client;
}

export async function checkDatabaseHealth(): Promise<void> {
  const prisma = getPrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.error({ err: error }, 'database health check failed');
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is not available', {
      cause: error,
    });
  }
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
