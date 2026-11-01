/**
 * Guarded database reset for the Playwright browser suite.
 *
 * The browser tests run against the disposable `silverstone_test` database in
 * the local Docker Postgres container. This script wipes and re-seeds that
 * database before the API server starts so every run begins from a known
 * state.
 *
 * SAFETY CONTRACT
 * ---------------
 * This script performs a destructive operation. It refuses to run unless the
 * target is provably the disposable test database:
 *
 *   1. The URL must parse as a PostgreSQL URL.
 *   2. The database name must be exactly `silverstone_test`.
 *   3. The host must not look like a Supabase host (pooler or direct).
 *
 * Any other target aborts with a non-zero exit code *before* a connection is
 * opened. The guard is enforced on the URL this script is about to use, not
 * on whatever a `.env` file happens to contain, so the destructive command
 * can never be redirected by ambient configuration.
 *
 * Usage:
 *   npm run e2e:reset -w @silverstone/api     # wipe + migrate + seed
 *   npm run e2e:reset -w @silverstone/api -- --verify   # guard + check, no writes
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { seedE2EUsers } from './seed-users.js';

/** The only database this script is ever allowed to touch. */
const REQUIRED_DATABASE_NAME = 'silverstone_test';

/** Hosts that look like Supabase are never acceptable test targets. */
const SUPABASE_HOST_PATTERN = /supabase/i;

export interface TestDatabaseTarget {
  url: string;
  hostname: string;
  databaseName: string;
}

/**
 * Parse and validate the target database URL.
 *
 * Throws with an actionable message when the target is anything other than
 * the disposable test database. This runs before any connection is opened,
 * so a rejected target is never touched.
 */
export function resolveTestDatabaseTarget(rawUrl: string | undefined): TestDatabaseTarget {
  const url = (rawUrl ?? '').trim();
  if (url.length === 0) {
    throw new Error(
      'No test database URL was provided. Set SILVERSTONE_TEST_DATABASE_URL to the ' +
        `local Docker postgres URL for "${REQUIRED_DATABASE_NAME}".`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `The test database URL is not a valid URL: "${url}". Expected a PostgreSQL URL ` +
        `such as postgresql://postgres:postgres@localhost:5432/${REQUIRED_DATABASE_NAME}.`,
    );
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `The test database URL must use a PostgreSQL protocol, got "${parsed.protocol}".`,
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (databaseName !== REQUIRED_DATABASE_NAME) {
    throw new Error(
      `Refusing to reset database "${databaseName}": the browser test suite may only ` +
        `reset "${REQUIRED_DATABASE_NAME}".`,
    );
  }

  if (SUPABASE_HOST_PATTERN.test(parsed.hostname)) {
    throw new Error(
      `Refusing to reset a Supabase-hosted database ("${parsed.hostname}"): automated ` +
        'test setup must never mutate a hosted environment.',
    );
  }

  return { url, hostname: parsed.hostname, databaseName };
}

function repoRoot(): string {
  // apps/api/src/e2e/reset-database.ts -> repository root
  return fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
}

/**
 * Absolute path to a locally installed CLI. Resolving the path (instead of
 * shelling out to `npx`) guarantees the tool that runs is the one in this
 * repository — `npx` would otherwise be free to download something else.
 */
function localBin(root: string, name: string): string {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return `${root}/node_modules/.bin/${name}${suffix}`;
}

function run(command: string, args: string[], cwd: string, databaseUrl: string): void {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      // The destructive commands read DATABASE_URL from the environment. Pin it
      // to the guarded value so an ambient .env can never redirect them.
      DATABASE_URL: databaseUrl,
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
  });
}

async function verifySeeded(target: TestDatabaseTarget): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    const organization = await prisma.organization.findFirst();
    if (!organization) {
      throw new Error(
        'The test database has no organization. Run `npm run e2e:reset -w @silverstone/api` first.',
      );
    }
    const users = await prisma.user.findMany({
      where: { organizationId: organization.id },
      select: { email: true, role: true, status: true },
    });
    if (users.length === 0) {
      throw new Error(
        'The test database has no fixture users. Run `npm run e2e:reset -w @silverstone/api` first.',
      );
    }
    console.log(
      `Test database "${target.databaseName}" on ${target.hostname} is seeded ` +
        `(${users.length} users: ${users.map((u) => `${u.email} [${u.role}]`).join(', ')}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function reset(target: TestDatabaseTarget): Promise<void> {
  const root = repoRoot();
  const apiDir = `${root}/apps/api`;
  const prismaSchema = `${root}/prisma/schema.prisma`;

  console.log(
    `Resetting test database "${target.databaseName}" on ${target.hostname} (${target.url}).`,
  );

  // 1. Reset the schema to the latest migration. `--skip-seed` keeps the
  //    organisation provisioning in our own hands (step 2) so the fixture
  //    users are created against a known organization id.
  run(
    localBin(root, 'prisma'),
    ['migrate', 'reset', '--force', '--skip-seed', '--schema', prismaSchema],
    apiDir,
    target.url,
  );

  // 2. Provision the organization + active configuration document.
  run(localBin(root, 'tsx'), [`${root}/prisma/seed.ts`], apiDir, target.url);

  // 3. Create the fixture users the browser suite signs in with.
  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!organization) {
      throw new Error('The seeded organization was not found.');
    }
    await seedE2EUsers(prisma, organization.id);
  } finally {
    await prisma.$disconnect();
  }

  console.log('Test database reset complete.');
}

async function main(): Promise<void> {
  const target = resolveTestDatabaseTarget(process.env.SILVERSTONE_TEST_DATABASE_URL);
  if (process.argv.includes('--verify')) {
    await verifySeeded(target);
    return;
  }
  await reset(target);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
