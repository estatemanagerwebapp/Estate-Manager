import http from 'node:http';
import { ResidentProfileService } from './modules/resident/profile.service.js';
import { ResidentPropertiesService } from './modules/resident/properties.service.js';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { createAppDependencies } from './dependencies.js';
import { getPasswordHashAlgorithm, getPasswordHashPolicy } from './lib/password.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma } from './lib/prisma.js';

async function main(): Promise<void> {
  const env = getEnv();
  // Resolve the hashing backend before listening so a strict policy fails
  // startup loudly instead of surfacing on the first login.
  const passwordAlgorithm = await getPasswordHashAlgorithm();
  logger.info(
    { algorithm: passwordAlgorithm, policy: getPasswordHashPolicy() },
    'password hashing backend selected',
  );
  const deps = await createAppDependencies();
  const app = createApp({
    checkDatabase: deps.checkDatabase,
    configService: deps.configService,
    auth: {
      ...deps.auth,
      organizationId: deps.organizationId,
      // The auth router carries its own, much stricter limiter for the
      // credential-guessing surface. It is configured from the environment so
      // disposable test harnesses can raise it without touching the
      // production default.
      rateLimits: { loginPerWindow: env.AUTH_LOGIN_RATE_LIMIT_MAX },
    },
    estates: {
      estateService: deps.estateService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
    },
    properties: {
      propertyService: deps.propertyService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      loadConfig: deps.loadConfig,
    },
    imports: {
      importService: deps.importService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      loadConfig: deps.loadConfig,
    },
    propertyOptions: {
      propertyOptionsService: deps.propertyOptionsService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
    },
    onboarding: {
      residentOnboarding: deps.residentOnboardingService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      mediaStorage: deps.mediaStorage,
    },
    media: {
      storage: deps.mediaStorage,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      residentOnboarding: deps.residentOnboardingService,
    },
    dashboard: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      audit: deps.audit,
      users: deps.users,
      residentOnboarding: deps.residentOnboarding,
      estates: deps.estates,
      properties: deps.properties,
      organizationId: deps.organizationId,
    },
    resident: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      profile: new ResidentProfileService({
        users: deps.users,
        drafts: deps.residentOnboarding,
        audit: deps.audit,
        loadProperty: async (orgId, propertyId) => {
          const detail = await deps.loadPropertyDetail(orgId, propertyId);
          if (!detail) return null;
          return { identifier: detail.identifier, estate: detail.estate };
        },
      }),
      properties: new ResidentPropertiesService({
        drafts: deps.residentOnboarding,
        properties: deps.properties,
        estates: deps.estates,
        loadConfig: deps.loadConfig,
      }),
      finance: deps.residentFinanceService,
      codes: deps.residentCodesService,
      complaints: deps.residentComplaintsService,
      messages: deps.residentMessagesService,
      community: deps.residentCommunityService,
    },
  });

  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, basePath: env.API_BASE_PATH },
      'API listening',
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close();
    const forceExit = setTimeout(() => {
      logger.warn({ timeoutMs: env.SHUTDOWN_TIMEOUT_MS }, 'forced shutdown after timeout');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();
    server.on('close', async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
