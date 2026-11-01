import { Router, type Request } from 'express';
import { z } from 'zod';
import { OPERATOR_PAYMENT_METHODS, RESIDENT_INVOICE_STATUSES } from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import {
  requireAuth,
  requirePermission,
  routeAuditContext,
  routeParam,
} from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OperatorBillingService } from './operator-billing.service.js';

export interface OperatorBillingRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  billing: OperatorBillingService;
}

function uuidParam(req: Request, name: string, label: string): string {
  const value = routeParam(req, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid ${label} id`);
  }
  return value;
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

  router.get('/', authGuard, readGuard, async (req, res, next) => {
    const query = z
      .object({
        status: z.enum(RESIDENT_INVOICE_STATUSES).optional(),
        estateId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .safeParse(req.query ?? {});
    if (!query.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid invoice filter'));
      return;
    }
    const response = await billing.listInvoices(organizationId, {
      status: query.data.status,
      estateId: query.data.estateId,
      limit: query.data.limit,
    });
    res.status(200).json({ data: response });
  });

  router.post('/', authGuard, manageGuard, async (req, res, next) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(160),
        residentId: z.string().uuid(),
        estateId: z.string().uuid().optional(),
        propertyId: z.string().uuid().optional(),
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
      routeAuditContext(req, res, organizationId),
      body.data,
    );
    res.status(201).json({ data: response });
  });

  router.post('/:invoiceId/void', authGuard, manageGuard, async (req, res) => {
    const response = await billing.voidInvoice(
      routeAuditContext(req, res, organizationId),
      uuidParam(req, 'invoiceId', 'invoice'),
    );
    res.status(200).json({ data: response });
  });

  router.post('/:invoiceId/payments', authGuard, paymentGuard, async (req, res, next) => {
    const body = z
      .object({
        amountKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
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
      routeAuditContext(req, res, organizationId),
      uuidParam(req, 'invoiceId', 'invoice'),
      {
        amountKobo: body.data.amountKobo,
        method: body.data.method,
        reference: body.data.reference ?? undefined,
        paidAt: body.data.paidAt,
      },
    );
    res.status(201).json({ data: response });
  });

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

  router.get('/', authGuard, readGuard, async (req, res, next) => {
    const query = z
      .object({
        estateId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .safeParse(req.query ?? {});
    if (!query.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid payment filter'));
      return;
    }
    const response = await billing.listPayments(organizationId, {
      estateId: query.data.estateId,
      limit: query.data.limit,
    });
    res.status(200).json({ data: response });
  });

  return router;
}
