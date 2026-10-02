require('../config/env');
const { PrismaClient } = require('@prisma/client');

/**
 * Ensures the database URL uses Supabase's transaction pooler (port 6543)
 * with pgbouncer=true and connection_limit=1 in serverless environments (Vercel).
 * This prevents: FATAL: (EMAXCONNSESSION) max clients reached in session mode.
 */
function getSafeDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;
  
  let clean = rawUrl;
  if (clean.includes('pooler.supabase.com:5432')) {
    clean = clean.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
  }
  if (clean.includes(':6543')) {
    if (!clean.includes('pgbouncer=true')) {
      clean += (clean.includes('?') ? '&' : '?') + 'pgbouncer=true';
    }
  }
  return clean;
}

const safeUrl = getSafeDatabaseUrl();
if (safeUrl) {
  process.env.DATABASE_URL = safeUrl;
}

// Preserve PrismaClient across serverless function re-invocations on Vercel
const globalForPrisma = globalThis;

if (!globalForPrisma.__prismaInstance) {
  globalForPrisma.__prismaInstance = new PrismaClient({
    datasources: safeUrl ? { db: { url: safeUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });
}

const prisma = globalForPrisma.__prismaInstance;

module.exports = prisma;
