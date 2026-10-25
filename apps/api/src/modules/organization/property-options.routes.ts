import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
} from 'express';
import { requireAuth, requirePermission, getAuth } from '../../middleware/auth-guard.js';
import { z } from 'zod';
import { PropertyOptionsSchema } from '@silverstone/config-schema';
import { AppError } from '../../lib/errors.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { PropertyOptionsService } from './property-options.service.js';

const CONFIG_MANAGE = 'config.manage';

export interface PropertyOptionsRouteOptions {
  propertyOptionsService: PropertyOptionsService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
}

/**
 * Property-options surface. The GET view returns the active block plus the
 * config version; the PUT update implements optimistic concurrency via
 * `baseVersion` — a stale version is refused with 409.
 */
export function createPropertyOptionsRouter(options: PropertyOptionsRouteOptions): Router {
  const router = Router();
  const { propertyOptionsService, sessions, permissions, organizationId } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);

  const readPermission = requirePermission((ctx) => permissions.can(ctx.role, 'property.read'));
  const managePermission = requirePermission((ctx) => permissions.can(ctx.role, CONFIG_MANAGE));

  function makeContext(req: Request, res: Response) {
    const auth = getAuth(req);
    const rawRequestId = res.getHeader('x-request-id');
    const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId;
    return {
      organizationId: auth?.organizationId ?? organizationId,
      actorId: auth?.userId ?? null,
      requestId: typeof requestId === 'string' ? requestId : null,
    };
  }

  const asyncWrap =
    (handler: RequestHandler): RequestHandler =>
    (req, res, next) => {
      void (async () => {
        try {
          await handler(req, res, next);
        } catch (error) {
          if (!res.headersSent) next(error);
        }
      })();
    };

  // --- GET /property-options ----------------------------------------------------
  router.get(
    '/',
    authGuard,
    readPermission,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const view = await propertyOptionsService.view(context);
      res.status(200).json({ data: view });
    }),
  );

  // --- PUT /property-options ----------------------------------------------------
  router.put(
    '/',
    authGuard,
    managePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          baseVersion: z.number().int().min(0),
          propertyOptions: PropertyOptionsSchema,
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid property options update'));
        return;
      }
      const context = makeContext(req, res);
      const view = await propertyOptionsService.update(context, {
        baseVersion: body.data.baseVersion,
        propertyOptions: body.data.propertyOptions,
      });
      res.status(200).json({ data: view });
    }),
  );

  return router;
}
