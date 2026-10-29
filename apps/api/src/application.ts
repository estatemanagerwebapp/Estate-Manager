import cors from 'cors';
import express, { type Express, type IRouter } from 'express';
import helmet from 'helmet';
import { getEnv } from './config/env.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createSystemRouter } from './modules/system/system.routes.js';
import { createAuthRouter, type AuthRouteOptions } from './modules/auth/auth.routes.js';
import { createEstateRouter, type EstateRouteOptions } from './modules/estates/estate.routes.js';
import {
  createPropertyRouter,
  type PropertyRouteOptions,
} from './modules/properties/property.routes.js';
import {
  createImportEstateRouter,
  createImportBatchRouter,
  type ImportRouteOptions,
} from './modules/imports/import.routes.js';
import {
  createOnboardingRouter,
  type OnboardingRouteOptions,
} from './modules/auth/onboarding.routes.js';
import { createMediaRouter, type MediaRouteOptions } from './modules/media/media.routes.js';
import {
  createDashboardRouter,
  type DashboardRouteOptions,
} from './modules/dashboard/dashboard.routes.js';
import {
  createResidentRouter,
  type ResidentRouteOptions,
} from './modules/resident/resident.routes.js';
import {
  createOperatorSosRouter,
  type OperatorSosRouteOptions,
} from './modules/sos/operator-sos.routes.js';
import {
  createOperatorMessagesRouter,
  type OperatorMessagesRouteOptions,
} from './modules/messages/operator-messages.routes.js';
import {
  createOperatorComplaintsRouter,
  type OperatorComplaintsRouteOptions,
} from './modules/complaints/operator-complaints.routes.js';
import type { OrganizationConfigService } from './modules/organization/config.service.js';

export interface AppOptions {
  /**
   * Executed by the readiness endpoint to verify database reachability.
   * `createAppDependencies` injects the Prisma-backed implementation; tests
   * inject fakes so the app can be exercised without a live database.
   */
  checkDatabase?: () => Promise<void>;
  configService?: OrganizationConfigService;
  /**
   * Phase 1 auth wiring. When present, the `/auth` router (login, logout,
   * me, change-password, forgot-password, reset-password, and the admin
   * user-management endpoints) is mounted on the versioned router.
   */
  auth?: AuthRouteOptions;
  /** Phase 2 estate wiring. */
  estates?: EstateRouteOptions;
  /** Phase 2 property registry wiring. */
  properties?: PropertyRouteOptions;
  /** Phase 2 bulk import wiring. */
  imports?: ImportRouteOptions;
  /** Phase 2 resident onboarding wiring (persistent code, payment-gated). */
  onboarding?: OnboardingRouteOptions;
  /** Phase 2 local media upload + serving. */
  media?: MediaRouteOptions;
  /** Dashboard KPI + activity aggregates (operator overview). */
  dashboard?: DashboardRouteOptions;
  /** Phase 3 resident portal (`/resident/*`), self-scoped. */
  resident?: ResidentRouteOptions;
  /** Operator SOS queue and acknowledge/resolve actions (`/sos/*`). */
  sos?: OperatorSosRouteOptions;
  /** Operator message inbox and staff replies (`/messages/*`). */
  messages?: OperatorMessagesRouteOptions;
  /** Operator complaint queue, replies and status changes (`/complaints/*`). */
  complaints?: OperatorComplaintsRouteOptions;
  /** Override the max requests per window (tests use a small limit). */
  rateLimitMax?: number;
}

export function createApp(options: AppOptions = {}): Express {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  // Security headers.
  app.use(helmet());

  // Explicit CORS allowlist; credentials supported for cookie-based sessions.
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    }),
  );

  // Structured request logging with request-id propagation.
  app.use(requestIdMiddleware());

  // Rate limiting (skip health probes so orchestrators are not throttled).
  app.use(
    env.API_BASE_PATH,
    createRateLimiter({ ...env, RATE_LIMIT_MAX: options.rateLimitMax ?? env.RATE_LIMIT_MAX }),
  );

  // Body parsers with a bounded size; JSON only.
  app.use(express.json({ limit: env.BODY_LIMIT, strict: true }));

  const router = createVersionedRoutes({
    checkDatabase: options.checkDatabase,
    configService: options.configService,
    auth: options.auth,
    estates: options.estates,
    properties: options.properties,
    imports: options.imports,
    onboarding: options.onboarding,
    media: options.media,
    dashboard: options.dashboard,
    resident: options.resident,
    sos: options.sos,
    messages: options.messages,
    complaints: options.complaints,
  });
  app.use(env.API_BASE_PATH, router);

  // Anything that fell through: 404 in the standard envelope.
  app.use(notFoundHandler);

  // Terminal error handler (AppError → 4xx/503; Zod → 400; Prisma → 503;
  // everything else → 500).
  app.use(errorHandler);

  return app;
}

function createVersionedRoutes(options: {
  checkDatabase?: () => Promise<void>;
  configService?: OrganizationConfigService;
  auth?: AuthRouteOptions;
  estates?: EstateRouteOptions;
  properties?: PropertyRouteOptions;
  imports?: ImportRouteOptions;
  onboarding?: OnboardingRouteOptions;
  media?: MediaRouteOptions;
  dashboard?: DashboardRouteOptions;
  resident?: ResidentRouteOptions;
  sos?: OperatorSosRouteOptions;
  messages?: OperatorMessagesRouteOptions;
  complaints?: OperatorComplaintsRouteOptions;
}): IRouter {
  const router: IRouter = express.Router();
  const {
    checkDatabase,
    configService,
    auth,
    estates,
    properties,
    imports,
    onboarding,
    media,
    dashboard,
    resident,
    sos,
    messages,
    complaints,
  } = options;

  router.use(
    '/health',
    createHealthRouter({
      checkDatabase:
        checkDatabase ??
        (async () => {
          // Default: no database check. Production wiring passes a real one.
          // Fails closed by throwing so readiness degrades to 503.
          throw new Error('checkDatabase was not provided to createApp');
        }),
    }),
  );

  if (configService) {
    router.use('/system', createSystemRouter(configService));
  }

  if (auth) {
    router.use('/auth', createAuthRouter(auth));
  }

  if (estates) {
    router.use('/estates', createEstateRouter(estates));
  }

  if (properties) {
    router.use('/properties', createPropertyRouter(properties));
  }

  if (imports) {
    // Estate-scoped import routes (upload, list, template) live under
    // /estates/:estateId/imports, so mount under /estates.
    router.use('/estates', createImportEstateRouter(imports));
    // Batch-level routes (detail, commit) live under /imports/:batchId,
    // so they never collide with the estate router's /:estateId routes.
    router.use('/imports', createImportBatchRouter(imports));
  }

  if (onboarding) {
    // Admin registration + guest onboarding, mounted at /onboard.
    router.use('/onboard', createOnboardingRouter(onboarding));
  }

  if (media) {
    router.use('/media', createMediaRouter(media));
  }

  if (dashboard) {
    router.use('/dashboard', createDashboardRouter(dashboard));
  }

  if (resident) {
    // Phase 3: resident portal (self-scoped), mounted at /resident.
    router.use('/resident', createResidentRouter(resident));
  }

  if (sos) {
    // Operator SOS queue (staff-scoped), mounted at /sos.
    router.use('/sos', createOperatorSosRouter(sos));
  }

  if (messages) {
    // Operator message inbox (staff-scoped), mounted at /messages.
    router.use('/messages', createOperatorMessagesRouter(messages));
  }

  if (complaints) {
    // Operator complaint queue (staff-scoped), mounted at /complaints.
    router.use('/complaints', createOperatorComplaintsRouter(complaints));
  }

  return router;
}
