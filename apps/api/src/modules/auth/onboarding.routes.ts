/**
 * Onboarding routes (resident draft model).
 *
 * Admin (auth + user.manage):
 *   POST /onboard/residents               — register a resident draft
 *   GET  /onboard/residents               — list all drafts (pending + completed)
 *   POST /onboard/residents/:id/payment  — mark the draft PAID
 *
 * Guest (public, rate-limited):
 *   GET    /onboard/by-code/:code        — load the draft + property + fee
 *   PATCH  /onboard/by-code/:code        — autosave resident fields
 *   POST   /onboard/by-code/:code/complete — final step: create the User
 *
 * The code is persistent (no TTL, no attempt cap, not single-use) and
 * belongs to the draft record, not to a pre-created user.
 */
import { Router, type Request, type Response, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { createRateLimitedResponse } from '../../lib/rate-limit-response.js';
import {
  requireAuth,
  requirePermission,
  getAuth,
  auditContext,
} from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from './session-repository.js';
import type { PermissionResolver } from './permission-resolver.js';
import type { ResidentOnboardingService } from './resident-onboarding.service.js';
import type { MediaStorage } from '../media/media-storage.js';

export interface OnboardingRouteOptions {
  residentOnboarding: ResidentOnboardingService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  /** When provided, the guest ID-document upload route is mounted. */
  mediaStorage?: MediaStorage;
  rateLimits?: {
    guestPerWindow?: number;
  };
}

export function createOnboardingRouter(options: OnboardingRouteOptions): Router {
  const router = Router();
  const { residentOnboarding, sessions, permissions, organizationId } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);
  const userManage = requirePermission((ctx) => permissions.can(ctx.role, 'user.manage'));

  function makeContext(req: Request, res: Response) {
    const ctx = auditContext(req, res);
    return {
      organizationId: ctx.organizationId ?? organizationId,
      actorId: ctx.actorId,
      requestId: ctx.requestId ?? null,
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

  const guestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.rateLimits?.guestPerWindow ?? 30,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    handler: (_req, res) => {
      createRateLimitedResponse(res);
    },
  });

  // --- Admin: POST /residents ---------------------------------------------------

  router.post(
    '/residents',
    authGuard,
    userManage,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          firstName: z.string().trim().min(1).max(120),
          email: z.string().trim().min(1).max(255).nullish(),
          phone: z.string().trim().min(1).max(40).nullish(),
          propertyId: z.string().trim().min(1),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid register input'));
        return;
      }
      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const context = makeContext(req, res);
      const response = await residentOnboarding.registerResident(context, auth.role, {
        firstName: body.data.firstName,
        email: body.data.email ?? null,
        phone: body.data.phone ?? null,
        propertyId: body.data.propertyId,
      });
      res.status(201).json({ data: response });
    }),
  );

  // --- Admin: GET /residents ----------------------------------------------------

  router.get(
    '/residents',
    authGuard,
    userManage,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const residents = await residentOnboarding.list(context);
      res.status(200).json({ data: { residents } });
    }),
  );

  // --- Admin: POST /residents/:id/payment ---------------------------------------

  router.post(
    '/residents/:id/payment',
    authGuard,
    userManage,
    asyncWrap(async (req, res, next) => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (typeof id !== 'string' || id.length === 0) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Missing resident id'));
        return;
      }
      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const body = z
        .object({
          paymentRef: z.string().trim().min(1).max(120).nullish(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid payment input'));
        return;
      }
      const context = makeContext(req, res);
      const response = await residentOnboarding.markPaid(context, auth.role, id, {
        paymentRef: body.data.paymentRef ?? null,
      });
      res.status(200).json({ data: response });
    }),
  );

  // --- Admin: DELETE /residents/:id --------------------------------------------

  router.delete(
    '/residents/:id',
    authGuard,
    userManage,
    asyncWrap(async (req, res, next) => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (typeof id !== 'string' || id.length === 0) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Missing resident id'));
        return;
      }
      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const context = makeContext(req, res);
      const response = await residentOnboarding.remove(context, auth.role, id);
      res.status(200).json({ data: response });
    }),
  );

  // --- Guest: GET /by-code/:code -------------------------------------------------

  router.get(
    '/by-code/:code',
    guestLimiter,
    asyncWrap(async (req, res, next) => {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      if (typeof code !== 'string' || code.trim().length === 0) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Missing onboarding code'));
        return;
      }
      const view = await residentOnboarding.viewByCode(organizationId, code);
      res.status(200).json({ data: view });
    }),
  );

  // --- Guest: PATCH /by-code/:code ------------------------------------------------

  router.patch(
    '/by-code/:code',
    guestLimiter,
    asyncWrap(async (req, res, next) => {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      if (typeof code !== 'string' || code.trim().length === 0) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Missing onboarding code'));
        return;
      }
      const body = z
        .object({
          gender: z.string().trim().max(16).nullish(),
          maritalStatus: z.string().trim().max(16).nullish(),
          propertyType: z.string().trim().max(48).nullish(),
          nextOfKinName: z.string().trim().max(160).nullish(),
          nextOfKinPhone: z.string().trim().max(40).nullish(),
          nextOfKinEmail: z.string().trim().max(255).nullish(),
          idType: z.string().trim().max(32).nullish(),
          idDocumentUrl: z.string().trim().max(2048).nullish(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid save input'));
        return;
      }
      const response = await residentOnboarding.saveDraft(organizationId, {
        code,
        gender: body.data.gender ?? null,
        maritalStatus: body.data.maritalStatus ?? null,
        propertyType: body.data.propertyType ?? null,
        nextOfKinName: body.data.nextOfKinName ?? null,
        nextOfKinPhone: body.data.nextOfKinPhone ?? null,
        nextOfKinEmail: body.data.nextOfKinEmail ?? null,
        idType: body.data.idType ?? null,
        idDocumentUrl: body.data.idDocumentUrl ?? null,
      });
      res.status(200).json({ data: response });
    }),
  );

  // --- Guest: POST /by-code/:code/payment-note ------------------------------------
  // Temporary walk-through while the payment gateway is not connected: the
  // resident records the reference they paid with. The draft stays UNPAID and
  // the administrator confirms it on the Residents screen.

  router.post(
    '/by-code/:code/payment-note',
    guestLimiter,
    asyncWrap(async (req, res, next) => {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      if (typeof code !== 'string' || code.trim().length === 0) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Missing onboarding code'));
        return;
      }
      const body = z
        .object({
          paymentRef: z.string().trim().min(1).max(120),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid payment reference'));
        return;
      }
      const response = await residentOnboarding.submitPaymentNote(
        organizationId,
        code,
        body.data.paymentRef,
      );
      res.status(200).json({ data: response });
    }),
  );

  // --- Guest: POST /by-code/:code/complete -----------------------------------------

  router.post(
    '/by-code/:code/complete',
    guestLimiter,
    asyncWrap(async (req, res, next) => {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      if (typeof code !== 'string' || code.trim().length === 0) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Missing onboarding code'));
        return;
      }
      const context = makeContext(req, res);
      const response = await residentOnboarding.complete(organizationId, { code }, context);
      res.status(200).json({ data: response });
    }),
  );

  // --- Guest: POST /by-code/:code/id-document (multipart) ---------------------------
  // The resident uploads their own ID document. Only the object key is
  // recorded on the draft; the API issues a short-lived read link when needed.

  if (options.mediaStorage) {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
        if (!ok) cb(new AppError(400, 'MEDIA_INVALID_FILE', 'Only images or PDF are accepted'));
        else cb(null, true);
      },
    });

    router.post(
      '/by-code/:code/id-document',
      guestLimiter,
      (req, res, next) => {
        upload.single('file')(req, res, (err) => {
          if (err) {
            if (err instanceof AppError) next(err);
            else next(new AppError(400, 'MEDIA_UPLOAD_FAILED', String(err.message ?? err)));
            return;
          }
          next();
        });
      },
      asyncWrap(async (req, res, next) => {
        const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
        if (typeof code !== 'string' || code.trim().length === 0) {
          next(new AppError(400, 'VALIDATION_ERROR', 'Missing onboarding code'));
          return;
        }
        const file = req.file;
        if (!file) {
          next(new AppError(400, 'MEDIA_NO_FILE', 'No file uploaded (field: "file")'));
          return;
        }
        const result = await options.mediaStorage!.save({
          organizationId,
          buffer: file.buffer,
          mimeType: file.mimetype,
          originalName: file.originalname,
          uploadedById: null,
        });
        await residentOnboarding.attachIdDocument(organizationId, code, result.publicUrl);
        res.status(201).json({ data: result });
      }),
    );
  }

  return router;
}
