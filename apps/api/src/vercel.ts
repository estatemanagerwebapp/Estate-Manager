import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Vercel serverless entry point for the Silverstone API.
 *
 * Mirrors `src/main.ts` (same dependency wiring, same route registration) but
 * instead of `server.listen()` it exports a request handler for Vercel's
 * Node.js runtime.
 *
 * This module deliberately has no static imports from the application graph.
 * Every part of the app is loaded inside `buildApp()` so that a failure while
 * loading it (a missing native module, an invalid environment, a broken
 * workspace package) is caught and reported as JSON. A static import failure
 * happens before any handler exists, which the platform can only surface as an
 * opaque FUNCTION_INVOCATION_FAILED response.
 *
 * Environment variables must be set in the Vercel project settings
 * (see docs/environment.md); DATABASE_URL is required.
 */

type HttpHandler = (req: IncomingMessage, res: ServerResponse) => void;

async function buildApp(): Promise<HttpHandler> {
  const { getEnv } = await import('./config/env.js');
  const { createAppDependencies } = await import('./dependencies.js');
  const { getPasswordHashAlgorithm, getPasswordHashPolicy } = await import('./lib/password.js');
  const { logger } = await import('./lib/logger.js');
  const { createApp } = await import('./app.js');
  const { ResidentProfileService } = await import('./modules/resident/profile.service.js');
  const { ResidentPropertiesService } = await import('./modules/resident/properties.service.js');
  const { ResidentDashboardService } = await import('./modules/resident/dashboard.service.js');

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

  const app = createApp({
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

  return app as unknown as HttpHandler;
}

function describeStartupError(error: unknown): string {
  const issues = (error as { issues?: unknown }).issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .map((issue) => {
        const item = issue as { variable?: unknown; message?: unknown };
        const variable = typeof item.variable === 'string' ? item.variable : 'configuration';
        const message = typeof item.message === 'string' ? item.message : '';
        return `${variable}: ${message}`;
      })
      .join('; ');
  }

  const raw = error instanceof Error ? error.message : String(error);
  return (
    raw
      .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[redacted]@')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .slice(0, 1000) || 'The API failed to start.'
  );
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-length', Buffer.byteLength(payload));
  res.end(payload);
}

let appPromise: Promise<HttpHandler> | undefined;

function loadApp(): Promise<HttpHandler> {
  appPromise ??= buildApp().catch((error: unknown) => {
    // Never let the diagnostic path throw. The logger may itself be the part
    // that cannot load.
    void import('./lib/logger.js')
      .then(({ logger }) => logger.fatal({ err: error }, 'API failed to start'))
      .catch(() => undefined);
    throw error;
  });
  return appPromise;
}

/**
 * Vercel invokes this per request. The Express app is built lazily so a
 * startup failure is reported as JSON instead of crashing module evaluation.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: HttpHandler;
  try {
    app = await loadApp();
  } catch (error) {
    sendJson(res, 503, {
      error: {
        code: 'STARTUP_FAILED',
        message: describeStartupError(error),
      },
    });
    return;
  }

  app(req, res);
}
