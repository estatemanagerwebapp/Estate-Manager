import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import {
  requireAuth,
  requirePermission,
  routeAuditContext,
  routeParam,
} from '../../middleware/auth-guard.js';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { ImportService } from './import.service.js';

const IMPORT_READ = 'estate.read';
const IMPORT_MANAGE = 'property.manage';

/** Max upload size: 10 MB. */
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export interface ImportRouteOptions {
  importService: ImportService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  /** Active organization-config version, stored as batch provenance. */
  loadConfigVersion: () => Promise<number>;
}

/** Shared request helpers for the estate-scoped and batch-scoped import routers. */
function importHelpers(options: ImportRouteOptions) {
  const { importService, sessions, permissions, loadConfigVersion } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);
  const readPermission = requirePermission((ctx) => permissions.can(ctx.role, IMPORT_READ));
  const managePermission = requirePermission((ctx) => permissions.can(ctx.role, IMPORT_MANAGE));

  // In-memory multer storage; the buffer is passed straight to exceljs.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      const isXlsx =
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.originalname.toLowerCase().endsWith('.xlsx');
      if (!isXlsx) cb(new AppError(400, 'IMPORT_INVALID_FILE', 'Only .xlsx files are accepted'));
      else cb(null, true);
    },
  });

  return {
    importService,
    authGuard,
    readPermission,
    managePermission,
    upload,
    loadConfigVersion,
  };
}

/**
 * Estate-scoped import surface, mounted under `/estates`.
 *
 * - `POST /:estateId/imports` — upload + parse + validate → PREVIEWED batch.
 * - `GET /:estateId/imports` — list batches for an estate.
 * - `GET /:estateId/imports/template` — download a generated .xlsx template.
 */
export function createImportEstateRouter(options: ImportRouteOptions): Router {
  const router = Router();
  const h = importHelpers(options);
  const { organizationId } = options;

  // --- POST /estates/:estateId/imports ---------------------------------------
  router.post(
    '/:estateId/imports',
    h.authGuard,
    h.managePermission,
    (req: Request, _res: Response, next: NextFunction) => {
      h.upload.single('file')(req, _res, (err) => {
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
    async (req, res, next) => {
      const estateId = routeParam(req, 'estateId');
      const body = z
        .object({
          filename: z.string().trim().min(1).max(255).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid import request'));
        return;
      }

      const file = req.file;
      if (!file) {
        next(new AppError(400, 'IMPORT_INVALID_FILE', 'No file was uploaded'));
        return;
      }

      const context = routeAuditContext(req, res, organizationId);
      const configVersion = await h.loadConfigVersion();

      const response = await h.importService.preview(context, configVersion, {
        estateId,
        filename: body.data.filename ?? file.originalname,
        buffer: file.buffer,
      });
      res.status(201).json({ data: response });
    },
  );

  // --- GET /estates/:estateId/imports -----------------------------------------
  router.get('/:estateId/imports', h.authGuard, h.readPermission, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await h.importService.list(context, routeParam(req, 'estateId'));
    res.status(200).json({ data: response });
  });

  // --- GET /estates/:estateId/imports/template --------------------------------
  router.get('/:estateId/imports/template', h.authGuard, h.readPermission, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const configVersion = await h.loadConfigVersion();
    const info = await h.importService.template(
      context,
      configVersion,
      routeParam(req, 'estateId'),
    );
    const { buffer: templateBuffer } = await h.importService.templateWorkbook(
      context,
      info.estateId,
      info.instructions,
    );

    const buf = await templateBuffer;
    res
      .status(200)
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="properties-${info.estateId.slice(0, 8)}.xlsx"`,
      })
      .send(buf);
  });

  return router;
}

/**
 * Batch-level import surface, mounted under `/imports`.
 *
 * - `GET /:batchId` — batch detail with row results.
 * - `POST /:batchId/commit` — commit a PREVIEWED batch in one transaction.
 *
 * Kept separate from the estate-scoped router so `/imports/:batchId` never
 * collides with the estate router's `/:estateId` routes.
 */
export function createImportBatchRouter(options: ImportRouteOptions): Router {
  const router = Router();
  const h = importHelpers(options);
  const { organizationId } = options;

  // --- GET /imports/:batchId -------------------------------------------------
  router.get('/:batchId', h.authGuard, h.readPermission, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await h.importService.detail(context, routeParam(req, 'batchId'));
    res.status(200).json({ data: response });
  });

  // --- POST /imports/:batchId/commit ------------------------------------------
  router.post('/:batchId/commit', h.authGuard, h.managePermission, async (req, res) => {
    // `confirmLegacySampleRows` is accepted for wire compatibility and
    // ignored: new imports no longer carry legacy sample rows.
    const body = z
      .object({ confirmLegacySampleRows: z.boolean().optional() })
      .safeParse(req.body ?? {});
    if (!body.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid import commit request');
    }
    const context = routeAuditContext(req, res, organizationId);
    const response = await h.importService.commit(context, routeParam(req, 'batchId'));
    res.status(200).json({ data: response });
  });

  return router;
}
