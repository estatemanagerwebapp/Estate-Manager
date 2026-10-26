/**
 * Resident portal routes (`/resident/*`).
 *
 * Mounted at `/resident` in `app.ts`. Every endpoint is self-scoped: it
 * resolves the acting resident's user id from the session (via
 * `getResidentContext`) and only reads or writes that user's data.
 *
 * The mount is present from S0 (foundation) with a `/ping` probe; steps S1–S11
 * add the per-domain routes (profile, properties, invoices, codes, complaints,
 * messages, community, facilities, bookings, sos, notifications) plus the
 * dashboard aggregate.
 */
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import {
  requireAuth,
  requirePermission,
  getAuth,
  auditContext,
} from '../../middleware/auth-guard.js';
import { requireResident, getResidentContext } from '../../middleware/resident-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { ResidentProfileService } from './profile.service.js';

export interface ResidentRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  /** S1: resident profile (self-scoped view + update). */
  profile?: ResidentProfileService;
}

/** Wrap async handlers so rejections reach the central error handler once. */
function asyncWrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      try {
        await handler(req, res, next);
      } catch (error) {
        if (!res.headersSent) next(error);
      }
    })();
  };
}

export function createResidentRouter(options: ResidentRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);
  const residentGuard = requireResident();

  function makeContext(req: Request, res: Response) {
    const ctx = auditContext(req, res);
    return {
      organizationId: ctx.organizationId ?? organizationId,
      actorId: ctx.actorId,
      requestId: ctx.requestId ?? null,
    };
  }

  // S0 foundation: a health-style probe proving the mount is wired and
  // self-scoping resolves. Kept for parity with the operator dashboard.
  router.get(
    '/ping',
    authGuard,
    residentGuard,
    asyncWrap(async (req, res) => {
      const ctx = getResidentContext(req);
      const auth = getAuth(req);
      if (!ctx || !auth) {
        res.status(200).json({ data: { ok: true, user: null } });
        return;
      }
      const allowed = await permissions.can(auth.role, 'portal.access.self');
      if (!allowed) {
        throw new AppError(403, 'FORBIDDEN', 'Resident portal access not granted');
      }
      res.status(200).json({
        data: { ok: true, user: { id: ctx.userId, organizationId } },
      });
    }),
  );

  // --- S1: Profile ---------------------------------------------------------------
  // GET  /profile  — the acting resident's own profile (user + onboarding + property).
  // PATCH /profile  — update allowed own fields (phone + next-of-kin + id type).
  //
  // The acting user id always comes from the session; a resident can never
  // address another resident. Writes audit `resident.profile_updated`.

  const profileViewGuard = requirePermission((ctx) => permissions.can(ctx.role, 'profile.view'));

  router.get(
    '/profile',
    authGuard,
    residentGuard,
    profileViewGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.profile) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Profile service not wired'));
        return;
      }
      const view = await options.profile.view(organizationId, ctx.userId);
      res.status(200).json({ data: view });
    }),
  );

  router.patch(
    '/profile',
    authGuard,
    residentGuard,
    profileViewGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.profile) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Profile service not wired'));
        return;
      }
      const body = z
        .object({
          phone: z.string().trim().max(40).nullish(),
          nextOfKinName: z.string().trim().max(160).nullish(),
          nextOfKinPhone: z.string().trim().max(40).nullish(),
          nextOfKinEmail: z.string().trim().max(255).nullish(),
          idType: z.string().trim().max(32).nullish(),
          propertyType: z.string().trim().max(48).nullish(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid profile update'));
        return;
      }
      const response = await options.profile.update(
        organizationId,
        ctx.userId,
        body.data,
        makeContext(req, res).requestId,
      );
      res.status(200).json({ data: response });
    }),
  );

  return router;
}

export { requireAuth, requirePermission, getAuth };
