import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../../lib/errors.js';
import type { OrganizationConfigService } from '../organization/config.service.js';
import { getEnv } from '../../config/env.js';

/**
 * Public, read-only projection of the resolved organization configuration.
 * Only safe, non-sensitive values are exposed; fees, custom field
 * definitions and role grants require an authenticated admin surface
 * (Phase 1+).
 */
export function createSystemRouter(service: OrganizationConfigService): Router {
  const router = Router();

  router.get('/info', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await service.resolve();
      res.json({
        data: {
          organization: {
            name: resolved.config.organization.name,
            slug: resolved.config.organization.slug,
          },
          config: {
            source: resolved.source,
            version: resolved.version,
            schemaVersion: resolved.config.schemaVersion,
          },
          environment: getEnv().NODE_ENV,
          api: getEnv().API_BASE_PATH,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export { AppError };
