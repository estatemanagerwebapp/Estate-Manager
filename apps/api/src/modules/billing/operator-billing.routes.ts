import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { OPERATOR_PAYMENT_METHODS, RESIDENT_INVOICE_STATUSES } from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermission, auditContext } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OperatorBillingService } from './operator-billing.service.js';

export interface OperatorBillingRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  billing: OperatorBillingService;
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

function param(req: Request, name: string): string {
  const value = req.params[name];
  const flat = Array.isArray(value) ? value[0] : value;
  if (typeof flat !== 'string' || flat.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `Missing :${name} parameter`);
  }
  return flat;
}

function uuidParam(req: Request, name: string, label: string): string {
  const value = param(req, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid ${label} id`);
  }
  return value;
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
 * Operator invoice routes, mounted at `/invoices`.
 *
 * `billing.read` reads the queue; `billing.manage` issues and voids invoices;
 * `payment.verify` records a payment received out of band. There is no
 * provider integration in this phase.
 */
export function createOperatorInvoiceRouter(options: OperatorBillingRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, billing } = options;

  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'billing.read'));
  const manageGuard = requirePermission((ctx) => permissions.can(ctx.role, 'billing.manage'));
  const paymentGuard = requirePermission((ctx) => permissions.can(ctx.role, 'payment.verify'));

  router.get(
    '/',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          status: z.enum(RESIDENT_INVOICE_STATUSES).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid invoice filter'));
        return;
      }
      const response = await billing.listInvoices(organizationId, {
        status: query.data.status,
        limit: query.data.limit,
      });
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
          residentId: z.string().uuid(),
          period: z.string().trim().min(1).max(48),
          amountKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          dueAt: z.string().trim().min(1).max(40),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid invoice input'));
        return;
      }
      const response = await billing.createInvoice(
        makeContext(req, res, organizationId),
        body.data,
      );
      res.status(201).json({ data: response });
    }),
  );

  router.post(
    '/:invoiceId/void',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res) => {
      const response = await billing.voidInvoice(
        makeContext(req, res, organizationId),
        uuidParam(req, 'invoiceId', 'invoice'),
      );
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/:invoiceId/payments',
    authGuard,
    paymentGuard,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          method: z.enum(OPERATOR_PAYMENT_METHODS),
          reference: z.string().trim().max(120).nullish(),
          paidAt: z.string().trim().min(1).max(40).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid payment input'));
        return;
      }
      const response = await billing.recordPayment(
        makeContext(req, res, organizationId),
        uuidParam(req, 'invoiceId', 'invoice'),
        {
          method: body.data.method,
          reference: body.data.reference ?? undefined,
          paidAt: body.data.paidAt,
        },
      );
      res.status(201).json({ data: response });
    }),
  );

  return router;
}

/**
 * Operator payment history, mounted at `/payments`.
 *
 * Reads reuse `billing.read`. Recording happens under
 * `POST /invoices/:id/payments` because the invoice owns the outstanding
 * amount.
 */
export function createOperatorPaymentRouter(options: OperatorBillingRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, billing } = options;

  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'billing.read'));

  router.get(
    '/',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid payment filter'));
        return;
      }
      const response = await billing.listPayments(organizationId, {
        limit: query.data.limit,
      });
      res.status(200).json({ data: response });
    }),
  );

  return router;
}
