import { execFileSync } from 'node:child_process';
import { E2E_API_ORIGIN, E2E_DATABASE_URL, E2E_USERS, REPO_ROOT } from './support/environment';

/**
 * Global setup for the browser suite.
 *
 * Playwright starts the configured web servers *before* this runs, so by the
 * time this file executes:
 *
 *   - the API has already reset and re-seeded the disposable test database
 *     (the reset happens in the API server's own start command), and
 *   - the API is listening on the E2E port.
 *
 * This setup therefore only *verifies* — it never writes. Two checks:
 *
 *   1. The authoritative reset script re-checks the database target with the
 *      same guard that authorises the destructive operation, and confirms the
 *      fixture users exist. This is the same code path that would have
 *      refused to touch a non-test database.
 *   2. Both fixture accounts sign in through the real API login route. This
 *      proves the credentials in `support/environment.ts` still match the
 *      accounts the API workspace seeded — a drift between the two lists
 *      fails the run here rather than halfway through a scenario.
 */
export default async function globalSetup(): Promise<void> {
  const tsx = `${REPO_ROOT}/node_modules/.bin/tsx${process.platform === 'win32' ? '.cmd' : ''}`;
  const resetScript = `${REPO_ROOT}/apps/api/src/e2e/reset-database.ts`;

  execFileSync(tsx, [resetScript, '--verify'], {
    cwd: `${REPO_ROOT}/apps/api`,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      SILVERSTONE_TEST_DATABASE_URL: E2E_DATABASE_URL,
    },
  });

  await assertCanLogIn(E2E_USERS.admin.email, E2E_USERS.admin.password, 'SUPER_ADMIN');
  await assertCanLogIn(E2E_USERS.auditor.email, E2E_USERS.auditor.password, 'AUDITOR');

  console.log('E2E global setup complete: test database verified and fixture users can sign in.');
}

async function assertCanLogIn(
  email: string,
  password: string,
  expectedRole: string,
): Promise<void> {
  const response = await fetch(`${E2E_API_ORIGIN}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(
      `Fixture user "${email}" could not sign in (HTTP ${response.status}). The credentials in ` +
        'apps/web/e2e/support/environment.ts must match apps/api/src/e2e/seed-users.ts.',
    );
  }

  const body = (await response.json()) as {
    data?: { user?: { role?: string } };
  };
  const role = body.data?.user?.role;
  if (role !== expectedRole) {
    throw new Error(`Fixture user "${email}" has role "${role}", expected "${expectedRole}".`);
  }
}
