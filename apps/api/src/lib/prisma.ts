import { PrismaClient } from '@prisma/client';
import { applyServerlessConnectionLimit, getEnv, normalizeDatabaseUrl } from '../config/env.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';

let client: PrismaClient | undefined;

/**
 * The database sits behind a session-mode pooler that accepts only 15 client
 * connections in total (`max clients reached in session mode ... pool_size:
 * 15`). A test run opens one Prisma client per worker, so the pool is
 * narrowed for tests: three connections per client with a generous wait.
 * That keeps two workers (six connections) comfortably inside the budget,
 * even while a development server holds its own connections against the
 * same database. Production keeps the URL as configured.
 */
function testDatabaseUrl(): string | undefined {
  if (process.env.VITEST !== 'true') return undefined;
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const separator = url.indexOf('?');
  const base = separator === -1 ? url : url.slice(0, separator);
  const query = separator === -1 ? '' : url.slice(separator + 1);
  const params = new URLSearchParams(query);
  params.set('connection_limit', '3');
  params.set('pool_timeout', '30');
  return `${base}?${params.toString()}`;
}

/**
 * Prisma validates the raw `process.env.DATABASE_URL` itself, so it never sees
 * the quoting/whitespace normalisation applied by `parseEnv`. Pass the
 * validated URL explicitly to keep both consumers on the same value.
 */
function databaseUrl(): string {
  const url = testDatabaseUrl() ?? getEnv().DATABASE_URL;
  return applyServerlessConnectionLimit(normalizeDatabaseUrl(url));
}

export function getPrismaClient(): PrismaClient {
  if (client) return client;
  client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: databaseUrl() } },
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
