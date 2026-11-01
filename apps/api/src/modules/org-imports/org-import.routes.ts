import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  requireAuth,
  requirePermission,
  routeAuditContext,
  getAuth,
} from '../../middleware/auth-guard.js';
import { AppError } from '../../lib/errors.js';
import type {} from '../auth/auth.service.js';
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
  const superAdminOnly = (req: Request, _res: Response, next: NextFunction) => {
    if (getAuth(req)?.role !== 'SUPER_ADMIN') {
      next(
        new AppError(
          403,
          'FORBIDDEN',
          'Only a super administrator can run organization-wide imports',
        ),
      );
      return;
    }
    next();
  };

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

  function batchIdParam(req: Request): string {
    const parsed = z.string().uuid().safeParse(req.params.batchId);
    if (!parsed.success) {
      throw new AppError(404, 'NOT_FOUND', 'Import batch not found');
    }
    return parsed.data;
  }

  // --- GET /org-imports/template ---------------------------------------------
  router.get('/template', authGuard, managePermission, superAdminOnly, async (_req, res) => {
    const context = routeAuditContext(_req, res, organizationId);
    const template = await orgImportService.template(context.organizationId);
    res
      .status(200)
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${template.filename}"`,
      })
      .send(template.buffer);
  });

  // --- POST /org-imports -----------------------------------------------------
  router.post(
    '/',
    authGuard,
    managePermission,
    superAdminOnly,
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
    async (req, res) => {
      const file = req.file;
      if (!file) {
        throw new AppError(400, 'IMPORT_INVALID_FILE', 'No file was uploaded');
      }
      const context = routeAuditContext(req, res, organizationId);
      const response = await orgImportService.preview(context, {
        filename: file.originalname,
        buffer: file.buffer,
      });
      res.status(201).json({ data: response });
    },
  );

  // --- GET /org-imports ------------------------------------------------------
  router.get('/', authGuard, managePermission, superAdminOnly, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await orgImportService.list(context.organizationId);
    res.status(200).json({ data: response });
  });

  // --- GET /org-imports/:batchId ---------------------------------------------
  router.get('/:batchId', authGuard, managePermission, superAdminOnly, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await orgImportService.detail(context.organizationId, batchIdParam(req));
    res.status(200).json({ data: response });
  });

  // --- POST /org-imports/:batchId/commit -------------------------------------
  router.post('/:batchId/commit', authGuard, managePermission, superAdminOnly, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await orgImportService.commit(context, batchIdParam(req));
    res.status(200).json({ data: response });
  });

  return router;
}
