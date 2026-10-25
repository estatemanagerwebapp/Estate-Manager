/**
 * Shared configuration for the Playwright browser suite.
 *
 * The suite runs entirely against local processes: a dedicated API instance on
 * its own port, backed by the disposable `silverstone_test` database in the
 * Docker Postgres container, and a Vite dev server that proxies `/api` to it.
 * Nothing in this file points at a hosted environment.
 */
import { fileURLToPath } from 'node:url';

/** Port the E2E API instance listens on (kept off 4000 so a dev server can run). */
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 4100);

/** Port the E2E Vite dev server listens on. */
export const E2E_WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5175);

export const E2E_API_ORIGIN = `http://localhost:${E2E_API_PORT}`;
export const E2E_WEB_ORIGIN = `http://localhost:${E2E_WEB_PORT}`;

/** The only database the browser suite may ever touch. */
export const E2E_DATABASE_NAME = 'silverstone_test';

/**
 * Connection string for the disposable test database. Defaults to the local
 * Docker Postgres container (`silverstone-pg`) used by the API integration
 * tests. The destructive reset script refuses to run against anything whose
 * database name is not `silverstone_test`, and refuses any Supabase host.
 */
export const E2E_DATABASE_URL =
  process.env.SILVERSTONE_TEST_DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:5432/${E2E_DATABASE_NAME}`;

/**
 * Fixture accounts. These are ordinary credentials — the browser suite signs
 * in through the real login form, with no test-only authentication hook.
 *
 * The authoritative copy lives in `apps/api/src/e2e/seed-users.ts` (next to
 * the password hashing helper it uses); the global setup verifies that both
 * sides agree before the first test runs.
 */
export const E2E_USERS = {
  admin: {
    email: 'e2e_admin@example.com',
    password: 'E2eAdminPass123',
    role: 'SUPER_ADMIN',
  },
  auditor: {
    email: 'e2e_auditor@example.com',
    password: 'E2eAuditorPass123',
    role: 'AUDITOR',
  },
} as const;

/** Absolute path to the repository root (apps/web/e2e/support -> repo root). */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
