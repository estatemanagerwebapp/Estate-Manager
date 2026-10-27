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
import type { ResidentPropertiesService } from './properties.service.js';
import type { ResidentFinanceService } from './finance.service.js';
import type { ResidentCodesService } from './codes.service.js';
import type { ResidentComplaintsService } from './complaints.service.js';
import type { ResidentMessagesService } from './messages.service.js';
import type { ResidentCommunityService } from './community.service.js';
import type { ResidentBookingsService } from './bookings.service.js';
import type { ResidentSosService } from './sos.service.js';
import type { ResidentNotificationsService } from './notifications.service.js';
import type { ResidentDashboardService } from './dashboard.service.js';

export interface ResidentRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  /** S1: resident profile (self-scoped view + update). */
  profile?: ResidentProfileService;
  /** S2: the resident's assigned property (self-scoped view). */
  properties?: ResidentPropertiesService;
  /** S3: resident finance — invoices, payments, transactions. */
  finance?: ResidentFinanceService;
  /** S4: resident access codes — generate, extend, deactivate. */
  codes?: ResidentCodesService;
  /** S5: resident complaints — file and read the reply thread. */
  complaints?: ResidentComplaintsService;
  /** S6: resident messages — threads with the estate office. */
  messages?: ResidentMessagesService;
  /** S7: community feed — announcements + estate broadcast (read-only). */
  community?: ResidentCommunityService;
  /** S8: facilities and bookings. */
  bookings?: ResidentBookingsService;
  /** S9: emergency / SOS alerts. */
  sos?: ResidentSosService;
  /** S10: the resident's notification inbox. */
  notifications?: ResidentNotificationsService;
  /** S11: the dashboard home aggregate. */
  dashboard?: ResidentDashboardService;
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

  // --- S2: My Properties -------------------------------------------------------
  // GET /properties — the acting resident's assigned property(ies). One today;
  // the list-shaped response keeps a future multi-property assignment
  // non-breaking. Self-scoped: the property is resolved through the
  // acting user's onboarding draft, never from a path param.

  const propertyViewGuard = requirePermission((ctx) => permissions.can(ctx.role, 'property.view'));

  router.get(
    '/properties',
    authGuard,
    residentGuard,
    propertyViewGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.properties) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Properties service not wired'));
        return;
      }
      const view = await options.properties.list(organizationId, ctx.userId);
      res.status(200).json({ data: view });
    }),
  );

  // --- S3: Invoices & Payments ---------------------------------------------------
  // GET  /finance        — the acting resident's finance view (4 sections).
  // POST /payments       — record a payment against one of the acting
  //                        resident's invoices (ownership verified; 404
  //                        otherwise). Provider is NONE: the payment is
  //                        recorded as a reference and the invoice flips to
  //                        PAID when covered.
  //
  // All endpoints are self-scoped: the acting user id comes from the
  // session; a resident can never address another resident's data.

  const invoiceViewGuard = requirePermission((ctx) => permissions.can(ctx.role, 'invoice.view'));
  const paymentCreateGuard = requirePermission((ctx) =>
    permissions.can(ctx.role, 'payment.create'),
  );

  router.get(
    '/finance',
    authGuard,
    residentGuard,
    invoiceViewGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.finance) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Finance service not wired'));
        return;
      }
      const view = await options.finance.view(organizationId, ctx.userId);
      res.status(200).json({ data: view });
    }),
  );

  router.post(
    '/payments',
    authGuard,
    residentGuard,
    paymentCreateGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.finance) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Finance service not wired'));
        return;
      }
      const body = z
        .object({
          invoiceId: z.string().trim().min(1),
          method: z.string().trim().min(1).max(32).optional(),
          reference: z.string().trim().max(120).nullish(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid payment input'));
        return;
      }
      const response = await options.finance.createPayment(
        organizationId,
        ctx.userId,
        {
          invoiceId: body.data.invoiceId,
          method: body.data.method,
          reference: body.data.reference ?? null,
        },
        makeContext(req, res).requestId,
      );
      res.status(200).json({ data: response });
    }),
  );

  // --- S4: Access Codes -----------------------------------------------------------
  // GET  /codes               — the acting resident's codes (prefix + window).
  // POST /codes               — generate; the full code is returned once.
  // POST /codes/:id/extend    — push the validity window further out.
  // POST /codes/:id/deactivate— revoke a code.
  //
  // Self-scoped: the acting user id comes from the session, and every lookup
  // is filtered by it, so a resident can never address another resident's
  // code (404).

  const codeCreateGuard = requirePermission((ctx) => permissions.can(ctx.role, 'code.create'));
  const codeDeactivateGuard = requirePermission((ctx) =>
    permissions.can(ctx.role, 'code.deactivate'),
  );

  const codeKindSchema = z.enum(['ENTRY', 'EXIT', 'BOTH']);

  router.get(
    '/codes',
    authGuard,
    residentGuard,
    codeCreateGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.codes) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Codes service not wired'));
        return;
      }
      const response = await options.codes.list(organizationId, ctx.userId);
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/codes',
    authGuard,
    residentGuard,
    codeCreateGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.codes) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Codes service not wired'));
        return;
      }
      const body = z
        .object({
          kind: codeKindSchema,
          durationDays: z.number().int().min(1).max(365).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid access code input'));
        return;
      }
      const response = await options.codes.generate(
        organizationId,
        ctx.userId,
        { kind: body.data.kind, durationDays: body.data.durationDays },
        makeContext(req, res).requestId,
      );
      res.status(201).json({ data: response });
    }),
  );

  router.post(
    '/codes/:id/extend',
    authGuard,
    residentGuard,
    codeCreateGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.codes) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Codes service not wired'));
        return;
      }
      const body = z
        .object({ durationDays: z.number().int().min(1).max(365).optional() })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid extend input'));
        return;
      }
      const response = await options.codes.extend(
        organizationId,
        ctx.userId,
        String(req.params.id),
        body.data.durationDays,
        makeContext(req, res).requestId,
      );
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/codes/:id/deactivate',
    authGuard,
    residentGuard,
    codeDeactivateGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.codes) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Codes service not wired'));
        return;
      }
      const response = await options.codes.deactivate(
        organizationId,
        ctx.userId,
        String(req.params.id),
        makeContext(req, res).requestId,
      );
      res.status(200).json({ data: response });
    }),
  );

  // --- S5: Complaints -----------------------------------------------------------
  // GET  /complaints         — the acting resident's complaints (+ replies).
  // POST /complaints         — file a complaint on their own property.
  //
  // Self-scoped: every query is filtered by the session user id.

  const complaintViewGuard = requirePermission((ctx) =>
    permissions.can(ctx.role, 'complaint.view'),
  );
  const complaintCreateGuard = requirePermission((ctx) =>
    permissions.can(ctx.role, 'complaint.create'),
  );

  router.get(
    '/complaints',
    authGuard,
    residentGuard,
    complaintViewGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.complaints) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Complaints service not wired'));
        return;
      }
      const query = z
        .object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional() })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid complaint filter'));
        return;
      }
      const response = await options.complaints.list(organizationId, ctx.userId, query.data.status);
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/complaints',
    authGuard,
    residentGuard,
    complaintCreateGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.complaints) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Complaints service not wired'));
        return;
      }
      const body = z
        .object({
          category: z.string().trim().min(1).max(48),
          subject: z.string().trim().min(1).max(160),
          description: z.string().trim().min(1).max(4000),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid complaint input'));
        return;
      }
      const response = await options.complaints.create(
        organizationId,
        ctx.userId,
        body.data,
        makeContext(req, res).requestId,
      );
      res.status(201).json({ data: response });
    }),
  );

  // --- S6: Messages --------------------------------------------------------------
  // GET  /messages — the acting resident's conversation threads.
  // POST /messages — start a thread or reply into an open one.
  //
  // Self-scoped: the thread id is resolved against the session user, so
  // another resident's thread is invisible (404).

  const messageGuard = requirePermission((ctx) => permissions.can(ctx.role, 'message.view'));

  router.get(
    '/messages',
    authGuard,
    residentGuard,
    messageGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.messages) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Messages service not wired'));
        return;
      }
      const response = await options.messages.list(organizationId, ctx.userId);
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/messages',
    authGuard,
    residentGuard,
    messageGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.messages) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Messages service not wired'));
        return;
      }
      const body = z
        .object({
          threadId: z.string().trim().min(1).optional(),
          subject: z.string().trim().min(1).max(160).optional(),
          body: z.string().trim().min(1).max(4000),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid message input'));
        return;
      }
      const response = await options.messages.send(
        organizationId,
        ctx.userId,
        body.data,
        makeContext(req, res).requestId,
      );
      res.status(201).json({ data: response });
    }),
  );

  // --- S7: Community -------------------------------------------------------------
  // GET /community — the latest announcements and the active broadcast for
  // the resident's own estate. Read-only: residents never publish here.

  router.get(
    '/community',
    authGuard,
    residentGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.community) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Community service not wired'));
        return;
      }
      const response = await options.community.get(organizationId, ctx.userId);
      res.status(200).json({ data: response });
    }),
  );

  // --- S8: Facilities & Bookings ---------------------------------------------------
  // GET  /facilities           — bookable facilities + the resident's bookings.
  // POST /bookings             — request a booking (self scope).
  // POST /bookings/:id/cancel  — cancel one of the resident's own bookings.

  const bookingGuard = requirePermission((ctx) => permissions.can(ctx.role, 'facility.book'));

  router.get(
    '/facilities',
    authGuard,
    residentGuard,
    bookingGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.bookings) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Bookings service not wired'));
        return;
      }
      const response = await options.bookings.list(organizationId, ctx.userId);
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/bookings',
    authGuard,
    residentGuard,
    bookingGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.bookings) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Bookings service not wired'));
        return;
      }
      const body = z
        .object({
          facilityId: z.string().trim().min(1),
          startsAt: z.string().trim().min(1),
          endsAt: z.string().trim().min(1),
          attendees: z.number().int().min(1).max(500).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid booking input'));
        return;
      }
      const response = await options.bookings.create(
        organizationId,
        ctx.userId,
        {
          facilityId: body.data.facilityId,
          startsAt: body.data.startsAt,
          endsAt: body.data.endsAt,
          attendees: body.data.attendees,
        },
        makeContext(req, res).requestId,
      );
      res.status(201).json({ data: response });
    }),
  );

  router.post(
    '/bookings/:id/cancel',
    authGuard,
    residentGuard,
    bookingGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.bookings) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Bookings service not wired'));
        return;
      }
      const response = await options.bookings.cancel(
        organizationId,
        ctx.userId,
        String(req.params.id),
        makeContext(req, res).requestId,
      );
      res.status(200).json({ data: response });
    }),
  );

  // --- S9: Emergency / SOS -----------------------------------------------------------
  // GET  /sos — the acting resident's own SOS history.
  // POST /sos — raise an SOS alert against their own property.
  //
  // Self-scoped: the resident and their property come from the session,
  // never from the request body.

  const sosGuard = requirePermission((ctx) => permissions.can(ctx.role, 'sos.create'));

  router.get(
    '/sos',
    authGuard,
    residentGuard,
    sosGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.sos) {
        next(new AppError(501, 'INTERNAL_ERROR', 'SOS service not wired'));
        return;
      }
      const response = await options.sos.list(organizationId, ctx.userId);
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/sos',
    authGuard,
    residentGuard,
    sosGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.sos) {
        next(new AppError(501, 'INTERNAL_ERROR', 'SOS service not wired'));
        return;
      }
      const body = z
        .object({ note: z.string().trim().max(500).optional() })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid SOS input'));
        return;
      }
      const response = await options.sos.raise(
        organizationId,
        ctx.userId,
        { note: body.data.note },
        makeContext(req, res).requestId,
      );
      res.status(201).json({ data: response });
    }),
  );

  // --- S10: Notifications -----------------------------------------------------------
  // GET  /notifications         — recent notifications, unread count and the
  //                                bookings the resident is waiting on.
  // POST /notifications/:id/read — mark one of the resident's own
  //                                notifications as read.
  //
  // Self-scoped: the notification id is resolved against the session user,
  // so another resident's notification is invisible (404).

  router.get(
    '/notifications',
    authGuard,
    residentGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.notifications) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Notifications service not wired'));
        return;
      }
      const inbox = await options.notifications.list(organizationId, ctx.userId);
      const bookings = options.bookings
        ? await options.bookings.list(organizationId, ctx.userId)
        : { upcoming: [] };
      res.status(200).json({
        data: {
          upcomingBookings: bookings.upcoming,
          recentNotifications: inbox.recentNotifications,
          unreadCount: inbox.unreadCount,
        },
      });
    }),
  );

  router.post(
    '/notifications/:id/read',
    authGuard,
    residentGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.notifications) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Notifications service not wired'));
        return;
      }
      const response = await options.notifications.markRead(
        organizationId,
        ctx.userId,
        String(req.params.id),
      );
      res.status(200).json({ data: response });
    }),
  );

  // --- S11: Dashboard home ---------------------------------------------------------
  // GET /dashboard — one aggregate that composes the sections the resident
  // portal already exposes (profile, property, finance, codes, estate
  // office, notifications) so the home page needs a single request.
  //
  // Self-scoped: every section resolves the acting user from the session.

  const dashboardGuard = requirePermission((ctx) =>
    permissions.can(ctx.role, 'portal.access.self'),
  );

  router.get(
    '/dashboard',
    authGuard,
    residentGuard,
    dashboardGuard,
    asyncWrap(async (req, res, next) => {
      const ctx = getResidentContext(req);
      if (!ctx) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!options.dashboard) {
        next(new AppError(501, 'INTERNAL_ERROR', 'Dashboard service not wired'));
        return;
      }
      const view = await options.dashboard.get(organizationId, ctx.userId);
      res.status(200).json({ data: view });
    }),
  );

  return router;
}

export { requireAuth, requirePermission, getAuth };
