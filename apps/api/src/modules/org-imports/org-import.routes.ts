import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAuth, requirePermission, getAuth } from '../../middleware/auth-guard.js';
import { AppError } from '../../lib/errors.js';
import type { AuthAuditContext } from '../auth/auth.service.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OrgImportService } from './org-import.service.js';

const IMPORT_MANAGE = 'import.manage';
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export interface OrgImportRouteOptions {
  orgImportService: OrgImportService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
}

/**
 * Organization-level import surface, mounted at `/org-imports`.
 *
 * - `GET /template` — generated multi-sheet workbook.
 * - `POST /` — upload + preview.
 * - `GET /` — recent batches.
 * - `GET /:batchId` — batch detail.
 * - `POST /:batchId/commit` — commit a PREVIEWED batch.
 */
export function createOrgImportRouter(options: OrgImportRouteOptions): Router {
  const router = Router();
  const { orgImportService, sessions, permissions, organizationId } = options;

  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const managePermission = requirePermission((ctx) => permissions.can(ctx.role, IMPORT_MANAGE));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      const isXlsx =
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.originalname.toLowerCase().endsWith('.xlsx');
      if (!isXlsx) {
        cb(new AppError(400, 'IMPORT_INVALID_FILE', 'Only .xlsx files are accepted'));
      } else {
        cb(null, true);
      }
    },
  });

  function makeContext(req: Request, res: Response): AuthAuditContext {
    const auth = getAuth(req);
    const rawRequestId = res.getHeader('x-request-id');
    const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId;
    return {
      organizationId: auth?.organizationId ?? organizationId,
      actorId: auth?.userId ?? null,
      requestId: typeof requestId === 'string' ? requestId : null,
    };
  }

  function batchIdParam(req: Request): string {
    const parsed = z.string().uuid().safeParse(req.params.batchId);
    if (!parsed.success) {
      throw new AppError(404, 'NOT_FOUND', 'Import batch not found');
    }
    return parsed.data;
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

  // --- GET /org-imports/template ---------------------------------------------
  router.get(
    '/template',
    authGuard,
    managePermission,
    asyncWrap(async (_req, res) => {
      const context = makeContext(_req, res);
      const template = await orgImportService.template(context.organizationId);
      res
        .status(200)
        .set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${template.filename}"`,
        })
        .send(template.buffer);
    }),
  );

  // --- POST /org-imports -----------------------------------------------------
  router.post(
    '/',
    authGuard,
    managePermission,
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          next(
            err instanceof AppError
              ? err
              : new AppError(400, 'IMPORT_INVALID_FILE', 'File upload failed'),
          );
        } else {
          next();
        }
      });
    },
    asyncWrap(async (req, res) => {
      const file = req.file;
      if (!file) {
        throw new AppError(400, 'IMPORT_INVALID_FILE', 'No file was uploaded');
      }
      const context = makeContext(req, res);
      const tmpPath = path.join(os.tmpdir(), `silverstone-org-import-${randomUUID()}.xlsx`);
      await fs.writeFile(tmpPath, file.buffer);
      try {
        const response = await orgImportService.preview(context, {
          filename: file.originalname,
          filePath: tmpPath,
        });
        res.status(201).json({ data: response });
      } finally {
        await fs.unlink(tmpPath).catch(() => undefined);
      }
    }),
  );

  // --- GET /org-imports ------------------------------------------------------
  router.get(
    '/',
    authGuard,
    managePermission,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const response = await orgImportService.list(context.organizationId);
      res.status(200).json({ data: response });
    }),
  );

  // --- GET /org-imports/:batchId ---------------------------------------------
  router.get(
    '/:batchId',
    authGuard,
    managePermission,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const response = await orgImportService.detail(context.organizationId, batchIdParam(req));
      res.status(200).json({ data: response });
    }),
  );

  // --- POST /org-imports/:batchId/commit -------------------------------------
  router.post(
    '/:batchId/commit',
    authGuard,
    managePermission,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const response = await orgImportService.commit(context, batchIdParam(req));
      res.status(200).json({ data: response });
    }),
  );

  return router;
}
