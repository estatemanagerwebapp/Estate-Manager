import { Router, type Request, type Response, type RequestHandler } from 'express';
import { requireAuth, requirePermission, getAuth } from '../../middleware/auth-guard.js';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { PropertyService, PropertyConfigSnapshot } from './property.service.js';

const PROPERTY_READ = 'property.read';
const PROPERTY_MANAGE = 'property.manage';

export interface PropertyRouteOptions {
  propertyService: PropertyService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  /**
   * Loads the resolved organization configuration (asset types + property
   * options) at request time, pinned to the active version. The service
   * depends on it for type-key validation and identifier derivation.
   */
  loadConfig: () => Promise<PropertyConfigSnapshot>;
}

/**
 * Property registry surface. All routes are cookie-authenticated and gated by
 * `property.read` / `property.manage`. Type keys and address components are
 * always validated against the *resolved* organization configuration, never
 * against a client-supplied list.
 */
export function createPropertyRouter(options: PropertyRouteOptions): Router {
  const router = Router();
  const { propertyService, sessions, permissions, organizationId, loadConfig } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);

  const readPermission = requirePermission((ctx) => permissions.can(ctx.role, PROPERTY_READ));
  const managePermission = requirePermission((ctx) => permissions.can(ctx.role, PROPERTY_MANAGE));

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

  function param(req: Request, name: string): string {
    const value = req.params[name];
    const flat = Array.isArray(value) ? value[0] : value;
    if (typeof flat !== 'string' || flat.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `Missing :${name} parameter`);
    }
    return flat;
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

  // --- GET /properties ---------------------------------------------------------
  router.get(
    '/',
    authGuard,
    readPermission,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          estateId: z.string().trim().max(64).optional(),
          typeKey: z.string().trim().max(48).optional(),
          status: z.string().trim().max(20).optional(),
          identifierContains: z.string().trim().max(200).optional(),
          page: z.coerce.number().int().min(1).optional(),
          pageSize: z.coerce.number().int().min(1).max(200).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid filter'));
        return;
      }
      const context = makeContext(req, res);
      const config = await loadConfig();
      const response = await propertyService.list(context, config, query.data);
      res.status(200).json({ data: response });
    }),
  );

  // --- POST /properties --------------------------------------------------------
  router.post(
    '/',
    authGuard,
    managePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          estateId: z.string().trim().min(1),
          typeKey: z.string().trim().min(1).max(48),
          houseTypeKey: z.string().trim().min(1).max(48).optional().nullable(),
          parentPropertyId: z.string().trim().min(1).optional(),
          name: z.string().trim().min(1).max(120).optional(),
          addressComponents: z.record(z.string(), z.string()).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid property input'));
        return;
      }
      const context = makeContext(req, res);
      const config = await loadConfig();
      const input = {
        estateId: body.data.estateId,
        typeKey: body.data.typeKey,
        houseTypeKey: body.data.houseTypeKey ?? null,
        parentPropertyId: body.data.parentPropertyId,
        name: body.data.name,
        addressComponents: body.data.addressComponents as Record<string, string> | undefined,
      };
      const property = await propertyService.create(context, config, input);
      res.status(201).json({ data: { property } });
    }),
  );

  // --- GET /properties/:propertyId ---------------------------------------------
  router.get(
    '/:propertyId',
    authGuard,
    readPermission,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const config = await loadConfig();
      const response = await propertyService.detail(context, config, param(req, 'propertyId'));
      res.status(200).json({ data: response });
    }),
  );

  // --- PATCH /properties/:propertyId --------------------------------------------
  router.patch(
    '/:propertyId',
    authGuard,
    managePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
          name: z.string().trim().min(1).max(120).optional().nullable(),
          addressComponents: z.record(z.string(), z.string()).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid property update'));
        return;
      }
      const context = makeContext(req, res);
      const config = await loadConfig();
      const update = {
        status: body.data.status,
        name: body.data.name,
        addressComponents: body.data.addressComponents as Record<string, string> | undefined,
      };
      const property = await propertyService.update(
        context,
        config,
        param(req, 'propertyId'),
        update,
      );
      res.status(200).json({ data: { property } });
    }),
  );

  // --- POST /properties/:propertyId/archive --------------------------------------
  router.post(
    '/:propertyId/archive',
    authGuard,
    managePermission,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const config = await loadConfig();
      const property = await propertyService.archive(context, config, param(req, 'propertyId'));
      res.status(200).json({ data: { property } });
    }),
  );

  // --- DELETE /properties/:propertyId --------------------------------------------
  router.delete(
    '/:propertyId',
    authGuard,
    managePermission,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      await propertyService.delete(context, param(req, 'propertyId'));
      res.status(200).json({ data: { ok: true } });
    }),
  );

  return router;
}
