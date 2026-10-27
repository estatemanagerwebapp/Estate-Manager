import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import * as fs from 'node:fs';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermission, getAuth } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { ResidentOnboardingService } from '../auth/resident-onboarding.service.js';
import type { LocalMediaStorage, MediaUploadResult } from './media-storage.js';

/**
 * Media upload + serving routes.
 *
 *   POST /media/uploads   — authenticated + user.manage; stores the file
 *                           locally and records a MediaFile row. The response
 *                           carries a `publicUrl` the client can use.
 *   GET  /media/:org/:id — public static file serving (the file is an ID
 *                           document; access is gated by the database
 *                           unique key + org scoping).
 */

export interface MediaRouteOptions {
  storage: LocalMediaStorage;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  residentOnboarding: ResidentOnboardingService;
}

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function createMediaRouter(options: MediaRouteOptions): Router {
  const router = Router();
  const { storage, sessions, permissions, organizationId, residentOnboarding } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);
  const userManage = requirePermission((ctx) => permissions.can(ctx.role, 'user.manage'));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      const isImage = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
      if (!isImage) {
        cb(new AppError(400, 'MEDIA_INVALID_FILE', 'Only images or PDF files are accepted'));
      } else {
        cb(null, true);
      }
    },
  });

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

  // --- POST /uploads ----------------------------------------------------------

  router.post(
    '/uploads',
    authGuard,
    userManage,
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
    asyncWrap(async (req, res) => {
      const file = req.file;
      if (!file) {
        throw new AppError(400, 'MEDIA_NO_FILE', 'No file uploaded (field name: "file")');
      }
      const auth = getAuth(req);
      if (!auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

      const result: MediaUploadResult = await storage.save({
        organizationId,
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
        uploadedById: auth.userId ?? null,
      });

      // Attach to a resident draft when requested (the admin uploads on
      // behalf of the resident).
      const draftId = (req.body?.draftId as string | undefined) ?? null;
      if (draftId) {
        await residentOnboarding.attachIdDocumentByAdmin(organizationId, draftId, result.publicUrl);
      }

      res.status(201).json({ data: result });
    }),
  );

  // --- GET /:org/:id (public serving) ------------------------------------------

  router.get(
    '/:org/:id',
    asyncWrap(async (req, res) => {
      const orgId = Array.isArray(req.params.org) ? req.params.org[0] : req.params.org;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (typeof orgId !== 'string' || typeof id !== 'string') {
        throw new AppError(400, 'VALIDATION_ERROR', 'Missing media parameters');
      }
      const relativePath = `${orgId}/${id}`;
      const filePath = await storage.resolve(relativePath);
      if (!filePath) {
        throw new AppError(404, 'NOT_FOUND', 'Media file not found');
      }
      const stat = await fs.promises.stat(filePath).catch(() => null);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', stat?.size ?? 0);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    }),
  );

  return router;
}
