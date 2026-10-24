import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
} from 'express';
import { requireAuth, requirePermission, getAuth } from '../../middleware/auth-guard.js';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { EstateService } from './estate.service.js';

const ESTATE_READ = 'estate.read';
const ESTATE_MANAGE = 'estate.manage';

export interface EstateRouteOptions {
  estateService: EstateService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
}

/**
 * Estate management surface. All routes are cookie-authenticated and gated by
 * `estate.read` / `estate.manage`. The caller's identity is always read from
 * the authenticated session, never from the request.
 */
export function createEstateRouter(options: EstateRouteOptions): Router {
  const router = Router();
  const { estateService, sessions, permissions, organizationId } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);

  const readPermission = requirePermission((ctx) => permissions.can(ctx.role, ESTATE_READ));
  const managePermission = requirePermission((ctx) => permissions.can(ctx.role, ESTATE_MANAGE));

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

  // --- GET /estates ----------------------------------------------------------
  router.get(
    '/',
    authGuard,
    readPermission,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          search: z.string().trim().max(160).optional(),
          status: z.string().trim().max(20).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid filter'));
        return;
      }
      const context = makeContext(req, res);
      const response = await estateService.list(context, query.data);
      res.status(200).json({ data: response });
    }),
  );

  // --- POST /estates ---------------------------------------------------------
  router.post(
    '/',
    authGuard,
    managePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          name: z.string().trim().min(1).max(160),
          slug: z.string().trim().max(64).optional(),
          address: z.string().trim().max(500).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid estate input'));
        return;
      }
      const context = makeContext(req, res);
      const estate = await estateService.create(context, body.data);
      res.status(201).json({ data: { estate } });
    }),
  );

  // --- GET /estates/:estateId ------------------------------------------------
  router.get(
    '/:estateId',
    authGuard,
    readPermission,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const response = await estateService.detail(context, param(req, 'estateId'));
      res.status(200).json({ data: response });
    }),
  );

  // --- PATCH /estates/:estateId ----------------------------------------------
  router.patch(
    '/:estateId',
    authGuard,
    managePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          name: z.string().trim().min(1).max(160).optional(),
          slug: z.string().trim().max(64).optional(),
          address: z.string().trim().max(500).nullish(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid estate update'));
        return;
      }
      const context = makeContext(req, res);
      const estate = await estateService.update(context, param(req, 'estateId'), body.data);
      res.status(200).json({ data: { estate } });
    }),
  );

  // --- POST /estates/:estateId/status -----------------------------------------
  router.post(
    '/:estateId/status',
    authGuard,
    managePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          status: z.enum(['ACTIVE', 'ARCHIVED']),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid status update'));
        return;
      }
      const context = makeContext(req, res);
      const response = await estateService.setStatus(context, param(req, 'estateId'), body.data.status);
      res.status(200).json({ data: response });
    }),
  );

  return router;
}
