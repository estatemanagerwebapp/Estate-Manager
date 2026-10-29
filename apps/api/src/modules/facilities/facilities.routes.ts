import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import {
  BOOKING_PAYMENT_STATUSES,
  BOOKING_STATUSES,
  OPERATOR_FACILITY_STATUSES,
  OPERATOR_PAYMENT_METHODS,
} from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermission, auditContext } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OperatorFacilitiesService } from './facilities.service.js';
import type { OperatorBookingsService } from './bookings.service.js';
import type { BookingPaymentService } from './booking-payment.service.js';

export interface OperatorFacilityRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  facilities: OperatorFacilitiesService;
}

export interface OperatorBookingRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  bookings: OperatorBookingsService;
  payment: BookingPaymentService;
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const facilityIdSchema = z.string().trim().refine(isUuid, 'Invalid facility id');
const bookingIdSchema = z.string().trim().refine(isUuid, 'Invalid booking id');

/**
 * Operator facility register, mounted at `/facilities`.
 *
 * `facility.read` can inspect the register; `facility.manage` creates, edits
 * and archives facilities.
 */
export function createOperatorFacilityRouter(options: OperatorFacilityRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, facilities } = options;
  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'facility.read'));
  const manageGuard = requirePermission((ctx) => permissions.can(ctx.role, 'facility.manage'));

  router.get(
    '/',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          status: z.enum(OPERATOR_FACILITY_STATUSES).optional(),
          estateId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid facility filter'));
        return;
      }
      const response = await facilities.list(organizationId, query.data);
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
          name: z.string().trim().min(1).max(160),
          description: z.string().trim().min(1).max(2000),
          estateId: z.string().uuid(),
          usageFeeKobo: z.number().int().min(0).optional(),
          bookable: z.boolean().optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid facility input'));
        return;
      }
      const response = await facilities.create(makeContext(req, res, organizationId), body.data);
      res.status(201).json({ data: response });
    }),
  );

  router.patch(
    '/:facilityId',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res, next) => {
      const params = z.object({ facilityId: facilityIdSchema }).safeParse(req.params);
      const body = z
        .object({
          name: z.string().trim().min(1).max(160).optional(),
          description: z.string().trim().min(1).max(2000).optional(),
          estateId: z.string().uuid().optional(),
          usageFeeKobo: z.number().int().min(0).optional(),
          bookable: z.boolean().optional(),
        })
        .refine((value) => Object.keys(value).length > 0)
        .safeParse(req.body ?? {});
      if (!params.success || !body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid facility update'));
        return;
      }
      const response = await facilities.update(
        makeContext(req, res, organizationId),
        params.data.facilityId,
        body.data,
      );
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/:facilityId/archive',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res, next) => {
      const params = z.object({ facilityId: facilityIdSchema }).safeParse(req.params);
      if (!params.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid facility id'));
        return;
      }
      const response = await facilities.archive(
        makeContext(req, res, organizationId),
        params.data.facilityId,
      );
      res.status(200).json({ data: response });
    }),
  );

  return router;
}

/**
 * Operator booking queue and lifecycle, mounted at `/bookings`.
 *
 * `booking.read` can inspect the queue; `booking.manage` confirms, cancels
 * and completes; `payment.verify` verifies the manual payment and creates the
 * paid invoice.
 */
export function createOperatorBookingRouter(options: OperatorBookingRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, bookings, payment } = options;
  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'booking.read'));
  const manageGuard = requirePermission((ctx) => permissions.can(ctx.role, 'booking.manage'));
  const paymentGuard = requirePermission((ctx) => permissions.can(ctx.role, 'payment.verify'));

  router.get(
    '/',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          status: z.enum(BOOKING_STATUSES).optional(),
          paymentStatus: z.enum(BOOKING_PAYMENT_STATUSES).optional(),
          facilityId: z.string().uuid().optional(),
          from: z.string().datetime({ offset: true }).optional(),
          to: z.string().datetime({ offset: true }).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid booking filter'));
        return;
      }
      const from = query.data.from ? new Date(query.data.from) : undefined;
      const to = query.data.to ? new Date(query.data.to) : undefined;
      if (from && to && from > to) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid booking date range'));
        return;
      }
      const response = await bookings.list(organizationId, {
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.paymentStatus ? { paymentStatus: query.data.paymentStatus } : {}),
        ...(query.data.facilityId ? { facilityId: query.data.facilityId } : {}),
        ...(query.data.limit ? { limit: query.data.limit } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/:bookingId/confirm',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res, next) => {
      const params = z.object({ bookingId: bookingIdSchema }).safeParse(req.params);
      if (!params.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid booking id'));
        return;
      }
      const response = await bookings.confirm(
        makeContext(req, res, organizationId),
        params.data.bookingId,
      );
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/:bookingId/payment',
    authGuard,
    paymentGuard,
    asyncWrap(async (req, res, next) => {
      const params = z.object({ bookingId: bookingIdSchema }).safeParse(req.params);
      const body = z
        .object({
          method: z.enum(OPERATOR_PAYMENT_METHODS),
          reference: z.string().trim().max(120).optional(),
          paidAt: z.string().datetime({ offset: true }).optional(),
        })
        .safeParse(req.body ?? {});
      if (!params.success || !body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid booking payment input'));
        return;
      }
      const response = await payment.verify(
        makeContext(req, res, organizationId),
        params.data.bookingId,
        body.data,
      );
      res.status(201).json({ data: response });
    }),
  );

  router.post(
    '/:bookingId/cancel',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res, next) => {
      const params = z.object({ bookingId: bookingIdSchema }).safeParse(req.params);
      if (!params.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid booking id'));
        return;
      }
      const response = await bookings.cancel(
        makeContext(req, res, organizationId),
        params.data.bookingId,
      );
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/:bookingId/complete',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res, next) => {
      const params = z.object({ bookingId: bookingIdSchema }).safeParse(req.params);
      if (!params.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid booking id'));
        return;
      }
      const response = await bookings.complete(
        makeContext(req, res, organizationId),
        params.data.bookingId,
      );
      res.status(200).json({ data: response });
    }),
  );

  return router;
}
