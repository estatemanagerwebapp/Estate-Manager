import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import {
  ACCESS_CODE_KINDS,
  ACCESS_CODE_STATUSES,
  ACCESS_VERIFICATION_GATES,
  ACCESS_VERIFICATION_OUTCOMES,
} from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermission, auditContext } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OperatorGateService } from './gate.service.js';

export interface OperatorGateRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  gate: OperatorGateService;
}

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

function makeContext(req: Request, res: Response, fallbackOrganizationId: string) {
  const ctx = auditContext(req, res);
  return {
    organizationId: ctx.organizationId ?? fallbackOrganizationId,
    actorId: ctx.actorId,
    requestId: ctx.requestId ?? null,
  };
}

/**
 * Organization-wide access-code register, mounted at `/access-codes`.
 *
 * Read-only: residents still create, extend and deactivate their own codes.
 * `gate.read` is enough to inspect prefixes and validity windows; the full
 * code is never available to staff.
 */
export function createOperatorAccessCodeRouter(options: OperatorGateRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, gate } = options;
  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'gate.read'));

  router.get(
    '/',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          status: z.enum(ACCESS_CODE_STATUSES).optional(),
          kind: z.enum(ACCESS_CODE_KINDS).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid access-code filter'));
        return;
      }
      const response = await gate.listAccessCodes(organizationId, query.data);
      res.status(200).json({ data: response });
    }),
  );

  return router;
}

/**
 * Gate verification attempts, mounted at `/verifications`.
 *
 * `POST /` is the guard workflow: verify a presented code and append the
 * outcome to history. `GET /` is the read-only history surfaced to auditors.
 */
export function createOperatorVerificationRouter(options: OperatorGateRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, gate } = options;
  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'verification.read'));
  const manageGuard = requirePermission((ctx) => permissions.can(ctx.role, 'gate.manage'));

  router.get(
    '/',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          outcome: z.enum(ACCESS_VERIFICATION_OUTCOMES).optional(),
          gate: z.enum(ACCESS_VERIFICATION_GATES).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid verification filter'));
        return;
      }
      const response = await gate.listVerifications(organizationId, query.data);
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          code: z.string().trim().min(1).max(32),
          gate: z.enum(ACCESS_VERIFICATION_GATES),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid verification input'));
        return;
      }
      const response = await gate.verify(makeContext(req, res, organizationId), body.data);
      res.status(201).json({ data: response });
    }),
  );

  return router;
}
