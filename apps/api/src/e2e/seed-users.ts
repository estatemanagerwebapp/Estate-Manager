/**
 * E2E user fixtures for the Playwright browser suite.
 *
 * The browser suite signs in through the real login form — there is no test
 * hook that bypasses authentication. That means the suite needs two real
 * accounts in the disposable test database:
 *
 *   - a SUPER_ADMIN (every capability) for the happy paths, and
 *   - an AUDITOR (read-only) for the permission-gating scenario.
 *
 * The passwords satisfy the shared password policy (min length, lower, upper
 * and digit). They are hashed with the same `hashPassword` helper the API
 * uses, so the stored hashes are ordinary credentials — no special-casing on
 * the login path.
 *
 * The account list lives here (next to the hashing helper it depends on) and
 * is published to the browser suite through `reset-database.ts --print-users`,
 * so both sides always agree on the credentials.
 */
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password.js';

export type E2eRole = 'SUPER_ADMIN' | 'AUDITOR';

export interface E2eUserSpec {
  email: string;
  password: string;
  role: E2eRole;
}

/**
 * The fixture accounts. `e2e_admin@example.com` owns everything;
 * `e2e_auditor@example.com` can read but never mutate.
 */
export const E2E_USERS: readonly E2eUserSpec[] = [
  {
    email: 'e2e_admin@example.com',
    password: 'E2eAdminPass123',
    role: 'SUPER_ADMIN',
  },
  {
    email: 'e2e_auditor@example.com',
    password: 'E2eAuditorPass123',
    role: 'AUDITOR',
  },
];

/**
 * Create (or repair) the fixture accounts for an organization. Idempotent:
 * re-running updates the password hash, role and status rather than failing,
 * so a repeated test run always starts from a known credential state.
 */
export async function seedE2EUsers(prisma: PrismaClient, organizationId: string): Promise<void> {
  for (const spec of E2E_USERS) {
    const passwordHash = await hashPassword(spec.password);
    await prisma.user.upsert({
      where: {
        organizationId_email: { organizationId, email: spec.email },
      },
      update: {
        passwordHash,
        role: spec.role,
        status: 'ACTIVE',
        lastPasswordChangedAt: new Date(),
      },
      create: {
        organizationId,
        email: spec.email,
        passwordHash,
        role: spec.role,
        status: 'ACTIVE',
        lastPasswordChangedAt: new Date(),
      },
    });
  }
}
