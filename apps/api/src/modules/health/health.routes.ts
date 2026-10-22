import { Router, type Request, type Response, type NextFunction } from 'express';
import type { HealthResponse, LivenessResponse } from '@silverstone/shared';
import { getEnv } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface HealthRouterOptions {
  /**
   * Executed once per readiness call. `createApp` injects a Prisma-backed
   * implementation; tests and previews inject fakes, so this router has no
   * hidden dependency on the database.
   */
  checkDatabase: () => Promise<void>;
}

export function createHealthRouter({ checkDatabase }: HealthRouterOptions): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get('/live', (_req: Request, res: Response) => {
    const env = getEnv();
    const body: LivenessResponse = {
      status: 'ok',
      service: env.APP_NAME,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(body);
  });

  const ready = async (_req: Request, res: Response, _next: NextFunction) => {
    const env = getEnv();
    const startedAtHr = process.hrtime.bigint();

    let database: HealthResponse['checks']['database'];
    try {
      await checkDatabase();
      const latencyMs = Number(process.hrtime.bigint() - startedAtHr) / 1_000_000;
      database = { status: 'ok', latencyMs: Math.round(latencyMs * 100) / 100 };
    } catch (error) {
      // Availability check: log details server-side, keep the body generic.
      logger.warn({ err: error }, 'database readiness check failed');
      database = { status: 'error', message: 'database unreachable' };
    }

    const body: HealthResponse = {
      status: database.status === 'ok' ? 'ok' : 'degraded',
      service: env.APP_NAME,
      version: '0.1.0',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        app: { status: 'ok' },
        database,
      },
    };

    res.status(database.status === 'ok' ? 200 : 503).json(body);
  };

  router.get('/ready', ready);
  router.get('/', ready);

  return router;
}
