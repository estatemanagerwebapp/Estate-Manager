import { ResidentProfileService } from './modules/resident/profile.service.js';
import { ResidentPropertiesService } from './modules/resident/properties.service.js';
import { ResidentDashboardService } from './modules/resident/dashboard.service.js';
import express, { type Express } from 'express';
import { createApp } from './app.js';
import { EnvironmentError, getEnv } from './config/env.js';
import { createAppDependencies } from './dependencies.js';
import { getPasswordHashAlgorithm, getPasswordHashPolicy } from './lib/password.js';
import { logger } from './lib/logger.js';

/**
 * Vercel serverless entry point for the Silverstone API.
 *
 * Mirrors `src/main.ts` exactly (same dependency wiring, same route
 * registration) but instead of `server.listen()` it exports the Express
 * app, which Vercel's Node.js runtime invokes as a request handler.
 *
 * Environment variables must be set in the Vercel project settings
 * (see docs/environment.md); DATABASE_URL is required.
 */

async function buildApp() {
  const env = getEnv();

  // Resolve the hashing backend before serving so a strict policy fails
  // startup loudly instead of surfacing on the first login.
  const passwordAlgorithm = await getPasswordHashAlgorithm();
  logger.info(
    { algorithm: passwordAlgorithm, policy: getPasswordHashPolicy() },
    'password hashing backend selected',
  );
  const deps = await createAppDependencies();

  // The profile and property services are shared: the resident routes use
  // them directly and the dashboard home composes them.
  const residentProfileService = new ResidentProfileService({
    users: deps.users,
    drafts: deps.residentOnboarding,
    audit: deps.audit,
    loadProperty: async (orgId, propertyId) => {
      const detail = await deps.loadPropertyDetail(orgId, propertyId);
      if (!detail) return null;
      return { identifier: detail.identifier, estate: detail.estate };
    },
  });
  const residentPropertiesService = new ResidentPropertiesService({
    drafts: deps.residentOnboarding,
    properties: deps.properties,
    estates: deps.estates,
    loadConfig: deps.loadConfig,
  });
  const residentDashboardService = new ResidentDashboardService({
    profile: residentProfileService,
    properties: residentPropertiesService,
    finance: deps.residentFinanceService,
    codes: deps.residentCodesService,
    complaints: deps.residentComplaintsService,
    community: deps.residentCommunityService,
    bookings: deps.residentBookingsService,
    notifications: deps.residentNotificationsService,
  });

  return createApp({
    checkDatabase: deps.checkDatabase,
    configService: deps.configService,
    auth: {
      ...deps.auth,
      organizationId: deps.organizationId,
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
      profile: residentProfileService,
      properties: residentPropertiesService,
      finance: deps.residentFinanceService,
      codes: deps.residentCodesService,
      complaints: deps.residentComplaintsService,
      messages: deps.residentMessagesService,
      community: deps.residentCommunityService,
      bookings: deps.residentBookingsService,
      sos: deps.residentSosService,
      notifications: deps.residentNotificationsService,
      dashboard: residentDashboardService,
    },
  });
}

/**
 * A misconfigured deployment must not answer every request with an opaque
 * FUNCTION_INVOCATION_FAILED. Build a minimal app that reports the startup
 * problem in the standard error envelope instead. Environment issues are
 * safe to expose (variable names and static messages only); other errors are
 * logged and only a redacted message is returned.
 */
function startupFailureApp(error: unknown): Express {
  const message =
    error instanceof EnvironmentError
      ? error.issues.map((issue) => `${issue.variable}: ${issue.message}`).join('; ')
      : redactStartupMessage(error);

  const failure = express();
  failure.use((_req, res) => {
    res.status(503).json({
      error: {
        code: 'STARTUP_FAILED',
        message,
      },
    });
  });
  return failure;
}

function redactStartupMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[redacted]@')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 1000);
}

const app = await buildApp().catch((error: unknown) => {
  logger.fatal({ err: error }, 'API failed to start');
  return startupFailureApp(error);
});

export default app;
