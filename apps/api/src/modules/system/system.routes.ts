import { Router, type Response, type NextFunction } from 'express';
import type { OrganizationConfigService } from '../organization/config.service.js';
import { getEnv } from '../../config/env.js';
import type { SystemInfo } from '@silverstone/shared';

/**
 * Public, read-only projection of the resolved organization configuration.
 * Only safe, non-sensitive values are exposed; fees, custom field
 * definitions and role grants require an authenticated admin surface
 * (Phase 1+).
 */
export function createSystemRouter(service: OrganizationConfigService): Router {
  const router = Router();

  router.get('/info', async (_req, res: Response, next: NextFunction) => {
    try {
      const resolved = await service.resolve();
      const env = getEnv();
      const body: SystemInfo = {
        organization: {
          name: resolved.config.organization.name,
          slug: resolved.config.organization.slug,
        },
        config: {
          source: resolved.source,
          version: resolved.version,
          schemaVersion: resolved.config.schemaVersion,
        },
        modules: Object.keys(resolved.config.modules)
          .filter((key) => (resolved.config.modules as Record<string, unknown>)[key])
          .sort(),
        branding: {
          primaryColor: resolved.config.branding.primaryColor,
          portalName: resolved.config.branding.portalName,
        },
      };
      res.status(200).json({ data: body, environment: env.NODE_ENV, api: env.API_BASE_PATH });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
