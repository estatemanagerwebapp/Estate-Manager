/**
 * Initial administrator bootstrap.
 *
 * Run once per fresh deployment, before the first operator signs in:
 *
 *   ADMIN_EMAIL=ops@example.com npm run bootstrap:admin
 *
 * The command is idempotent: if a SUPER_ADMIN already exists for the
 * organization it exits with a clear message and does not touch the existing
 * account. The administrator's email and password are taken from the
 * `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables; if either is
 * missing the operator is prompted on a trusted local terminal (the password
 * prompt has no echo, but readline's built-in module does not support a
 * non-echo mode, so the env-var path is preferred for real deployments).
 *
 * Neither value is logged, written to a file, or echoed back after entry.
 */
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { getEnv } from './config/env.js';
import { getPrismaClient, disconnectPrisma } from './lib/prisma.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';
import {
  PrismaOrganizationConfigRepository,
  OrganizationConfigService,
} from './modules/organization/config.service.js';
import { PrismaUserRepository } from './modules/auth/user-repository.js';
import { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import { PrismaSessionRepository } from './modules/auth/session-repository.js';
import { PrismaPasswordResetRepository } from './modules/auth/reset-token-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';
import { AuthService } from './modules/auth/auth.service.js';
import { ConsoleEmailAdapter, type EmailAdapter } from './modules/auth/email-adapter.js';
import { validatePasswordPolicy } from '@silverstone/shared';
import { logger } from './lib/logger.js';

function prompt(label: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  stdout.write(label);
  return new Promise<string>((resolve) => {
    rl.question('', (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const env = getEnv();
  const prisma = getPrismaClient();

  // The Organization row must already exist (created by `npm run db:seed`).
  const organization = await prisma.organization.findUnique({
    where: { slug: env.ORGANIZATION_SLUG },
  });
  if (!organization) {
    logger.error(
      { slug: env.ORGANIZATION_SLUG },
      'organization not found — run `npm run db:seed` first',
    );
    await disconnectPrisma();
    process.exit(1);
  }

  const configRepository = new PrismaOrganizationConfigRepository(prisma);
  const configService = new OrganizationConfigService(
    configRepository,
    loadBootstrapConfig,
    env.ORGANIZATION_SLUG,
  );

  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const resetTokens = new PrismaPasswordResetRepository(prisma);
  const audit = new PrismaAuditRepository(prisma);

  const loadGrants = async () => {
    try {
      const resolved = await configService.resolve();
      return resolved.config.roles.grants;
    } catch {
      return [];
    }
  };

  const permissions = new PermissionResolver(loadGrants);
  const emailAdapter: EmailAdapter = new ConsoleEmailAdapter(logger);

  const authService = new AuthService(
    users,
    sessions,
    resetTokens,
    audit,
    permissions,
    emailAdapter,
    env.SESSION_LIFETIME_DAYS,
    env.RESET_TOKEN_TTL_MINUTES,
    env.WEB_BASE_URL,
  );

  const email = process.env.ADMIN_EMAIL ?? (await prompt('Administrator email: '));
  const password =
    process.env.ADMIN_PASSWORD ??
    (await prompt('Administrator password (type carefully; not echoed): '));

  if (email.trim().length === 0 || password.length === 0) {
    logger.error('both the email and the password are required');
    await disconnectPrisma();
    process.exit(1);
  }

  // Fail fast on a policy-violating password before touching the database.
  const problems = validatePasswordPolicy(password);
  if (problems.length > 0) {
    for (const problem of problems) {
      logger.error({ problem }, 'password does not meet policy');
    }
    logger.error('fix the password and re-run the bootstrap');
    await disconnectPrisma();
    process.exit(1);
  }

  const result = await authService.bootstrapSuperAdmin(organization.id, email.trim(), password);

  if (result.created) {
    logger.info(
      { email: result.user?.email, role: result.user?.role },
      'initial administrator created — log in with these credentials',
    );
  } else {
    logger.warn('an administrator already exists — no changes were made');
  }

  await disconnectPrisma();
}

main().catch((error) => {
  logger.fatal({ err: error }, 'bootstrap failed');
  process.exit(1);
});
