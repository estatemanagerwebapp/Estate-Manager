import cors from 'cors';
import express, { type Express, type IRouter } from 'express';
import helmet from 'helmet';
import { getEnv } from './config/env.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createSystemRouter } from './modules/system/system.routes.js';
import type { OrganizationConfigService } from './modules/organization/config.service.js';

export interface AppOptions {
  /**
   * Executed by the readiness endpoint to verify database reachability.
   * `createAppDependencies` injects the Prisma-backed implementation; tests
   * inject fakes so the app can be exercised without a live database.
   */
  checkDatabase?: () => Promise<void>;
  configService?: OrganizationConfigService;
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

  // Explicit CORS allowlist; credentials supported for cookie-based sessions
  // in later phases.
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
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(
    env.API_BASE_PATH,
    createRateLimiter({ ...env, RATE_LIMIT_MAX: options.rateLimitMax ?? env.RATE_LIMIT_MAX }),
  );

  // Body parsers with a bounded size; JSON only.
  app.use(express.json({ limit: env.BODY_LIMIT, strict: true }));

  const router = createVersionedRoutes({
    checkDatabase: options.checkDatabase,
    configService: options.configService,
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
}): IRouter {
  const router: IRouter = express.Router();
  const { checkDatabase, configService } = options;

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

  return router;
}
