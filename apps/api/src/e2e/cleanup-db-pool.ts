/**
 * Clear stale pooler sessions left behind by finished test runs.
 *
 * WHY THIS EXISTS
 * ---------------
 * The integration suite runs against a remote Postgres behind Supavisor in
 * *session* mode, which admits only 15 client sessions in total ("max clients
 * reached in session mode ... pool_size: 15"). Vitest tears its workers down
 * when a run finishes, so the pooler can keep seeing those sockets as open for
 * a while; each run therefore leaves a few idle sessions behind. After a few
 * runs the pool fills and the suite starts failing with 503
 * DATABASE_UNAVAILABLE on unrelated assertions.
 *
 * SAFETY CONTRACT
 * ---------------
 * This script only ever ends sessions that are *provably* leftovers:
 *
 *   1. Same database as the configured connection.
 *   2. Owned by the connecting role (`current_user`).
 *   3. Created by the pooler (`application_name = 'Supavisor'`).
 *   4. In state `idle` — an in-flight request is never touched.
 *   5. Idle for longer than the grace period, so a server that has just
 *      finished a query is not disconnected mid-pool.
 *
 * Active sessions, other databases and Supabase's internal roles
 * (`pgbouncer`, `supabase_admin`) are never candidates.
 *
 * Usage:
 *   npm run db:cleanup-pool -w @silverstone/api
 */
import { getPrismaClient, disconnectPrisma } from '../lib/prisma.js';

/** How long a session must have been idle before it is considered stale. */
const IDLE_GRACE = '60 seconds';

async function main(): Promise<void> {
  const prisma = getPrismaClient();

  const candidates = await prisma.$queryRawUnsafe<Array<{ pid: number }>>(
    `SELECT pid
       FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND usename = current_user
        AND application_name = 'Supavisor'
        AND state = 'idle'
        AND state_change < now() - interval '${IDLE_GRACE}'`,
  );

  let terminated = 0;
  for (const session of candidates) {
    const ended = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
      `SELECT pg_terminate_backend(${session.pid}) AS ok`,
    );
    if (ended[0]?.ok) terminated += 1;
  }

  const remaining = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n
       FROM pg_stat_activity
      WHERE datname = current_database()
        AND application_name = 'Supavisor'`,
  );

  console.log(
    `Cleared ${terminated} stale pooler session(s); ${remaining[0]?.n ?? 0} pooler session(s) remain.`,
  );

  await disconnectPrisma();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectPrisma().catch(() => undefined);
  process.exitCode = 1;
});
