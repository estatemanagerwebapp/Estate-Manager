import express, { type Request, type Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Vercel serverless entry point for the Silverstone API.
 *
 * Mirrors `src/main.ts` (same dependency wiring, same route registration) but
 * instead of `server.listen()` it exports a request handler for Vercel's
 * Node.js runtime.
 *
 * `express` is the only runtime import at module scope; Vercel's Express
 * framework preset uses it (and the conventional `src/server.ts` file name) to
 * detect the application. Everything else is loaded inside `buildApp()` so a
 * failure while loading the app graph (a missing native module, an invalid
 * environment, a broken workspace package) is caught and reported as JSON. A
 * static app import failure happens before any handler exists, which the
 * platform can only surface as an opaque FUNCTION_INVOCATION_FAILED response.
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
  const { createApp } = await import('./application.js');
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
    },
    imports: {
      importService: deps.importService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      loadConfigVersion: deps.loadConfigVersion,
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
    sos: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      sos: deps.operatorSosService,
    },
    messages: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      messages: deps.operatorMessagesService,
    },
    complaints: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      complaints: deps.operatorComplaintsService,
    },
    billing: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      billing: deps.operatorBillingService,
    },
    gate: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      gate: deps.operatorGateService,
    },
    facilities: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      facilities: deps.operatorFacilitiesService,
    },
    bookings: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      bookings: deps.operatorBookingsService,
      payment: deps.bookingPaymentService,
    },
    settings: {
      settingsService: deps.settingsService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
    },
  });

  return app as unknown as HttpHandler;
}

/**
 * Prisma's own codes are safe to publish: they identify the failure class
 * without disclosing the connection string, host, or credentials.
 */
const DATABASE_ERROR_DETAIL: Record<string, string> = {
  P1000: 'the database rejected the credentials',
  P1001: 'the database server cannot be reached',
  P1002: 'the database connection timed out',
  P1003: 'the database does not exist',
  P1010: 'the database user is not allowed to access it',
  P1011: 'TLS negotiation with the database failed',
  P1013: 'the database connection string is invalid',
  P1017: 'the database closed the connection',
  P2021: 'a required table does not exist',
  P2022: 'a required column does not exist',
};

const NETWORK_ERROR_DETAIL: Record<string, string> = {
  ENOTFOUND: 'the database host could not be resolved',
  ECONNREFUSED: 'the database refused the connection',
  ETIMEDOUT: 'the database connection timed out',
  EHOSTUNREACH: 'the database host is unreachable',
};

/**
 * Prisma does not always attach an error code (connection failures often only
 * carry a message), so fall back to classifying the message. Only a fixed,
 * safe phrase is published — never the original text, which contains the host.
 */
function classifyDatabaseError(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== null && current !== undefined; depth += 1) {
    const candidate = current as {
      code?: unknown;
      errorCode?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    const rawCode = typeof candidate.errorCode === 'string' ? candidate.errorCode : candidate.code;

    if (typeof rawCode === 'string') {
      if (/^P\d{4}$/.test(rawCode)) {
        return `${rawCode}: ${DATABASE_ERROR_DETAIL[rawCode] ?? 'database error'}`;
      }
      if (NETWORK_ERROR_DETAIL[rawCode]) return NETWORK_ERROR_DETAIL[rawCode];
    }

    const message = typeof candidate.message === 'string' ? candidate.message : '';
    if (
      /Authentication failed|password authentication failed|credentials.*not valid/i.test(message)
    ) {
      return 'the database rejected the credentials';
    }
    if (
      /too many clients|max clients|pool_size|connection pool.*(exhausted|timed out)/i.test(message)
    ) {
      return 'the database connection pool is exhausted';
    }
    if (/Timed out|timeout/i.test(message)) return 'the database connection timed out';
    if (/does not exist/i.test(message)) return 'the database does not exist';
    if (/Can't reach database server|ECONNREFUSED|EHOSTUNREACH|ENOTFOUND/i.test(message)) {
      return 'the database server cannot be reached (network, host, or allowlist)';
    }

    current = candidate.cause;
  }
  return undefined;
}

/** Strip connection strings, hosts, IPs and user names from a message. */
function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[redacted]@')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\bpostgres\.[a-z0-9]{6,}\b/gi, '[db-user]')
    .replace(
      /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:supabase\.(?:com|co|net|in)|amazonaws\.com|vercel\.app)\b/gi,
      '[db-host]',
    )
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '[ip]');
}

/**
 * The cause carries the actionable detail (auth vs network vs schema), but
 * Prisma messages can name the host. Publish a redacted, truncated version.
 */
function describeCause(error: unknown): string | undefined {
  let current: unknown = (error as { cause?: unknown } | null)?.cause;
  for (let depth = 0; depth < 4 && current !== null && current !== undefined; depth += 1) {
    if (current instanceof Error) {
      const message = redact(current.message).replace(/\s+/g, ' ').trim().slice(0, 240);
      if (message && message !== 'The database is not available') {
        return `${current.name || 'Error'}: ${message}`;
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function describeStartupError(error: unknown): string {
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
  const message = redact(raw).slice(0, 1000) || 'The API failed to start.';

  const databaseIssue = classifyDatabaseError(error);
  const cause = databaseIssue ? undefined : describeCause(error);
  return [message, databaseIssue, cause].filter(Boolean).join(' — ');
}

/**
 * Vercel detects an Express app by file name (`src/server.ts` is one of the
 * supported locations) and calls the default export per request. The app graph
 * is still loaded lazily so a startup failure is answered with JSON instead of
 * an opaque FUNCTION_INVOCATION_FAILED response.
 */
const app = express();
let initPromise: Promise<HttpHandler> | undefined;
let inner: HttpHandler | undefined;

function init(): Promise<HttpHandler> {
  initPromise ??= buildApp().then((handler) => {
    inner = handler;
    return handler;
  });
  return initPromise;
}

// Begin loading during cold start. A failure is kept for the first request and
// the catch prevents an unhandled rejection.
void init().catch((error: unknown) => {
  // Never let the diagnostic path throw. The logger may itself be the part
  // that cannot load.
  void import('./lib/logger.js')
    .then(({ logger }) => logger.fatal({ err: error }, 'API failed to start'))
    .catch(() => undefined);
});

app.use(async (req: Request, res: Response) => {
  try {
    const handler = inner ?? (await init());
    handler(req, res);
  } catch (error) {
    if (res.headersSent) return;
    res.status(503).json({
      error: {
        code: 'STARTUP_FAILED',
        message: describeStartupError(error),
      },
    });
  }
});

export default app;
