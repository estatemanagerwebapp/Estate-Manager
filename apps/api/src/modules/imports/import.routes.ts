import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { requireAuth, requirePermission, getAuth } from '../../middleware/auth-guard.js';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { ImportService, ImportServiceContext } from './import.service.js';
import type { PropertyConfigSnapshot } from '../properties/property.service.js';

const IMPORT_READ = 'estate.read';
const IMPORT_MANAGE = 'property.manage';

/** Max upload size: 10 MB. */
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export interface ImportRouteOptions {
  importService: ImportService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  loadConfig: () => Promise<PropertyConfigSnapshot>;
}

/** Shared request helpers for the estate-scoped and batch-scoped import routers. */
function importHelpers(options: ImportRouteOptions) {
  const { importService, sessions, permissions, organizationId, loadConfig } = options;

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

  function makeContext(req: Request, res: Response): ImportServiceContext {
    const auth = getAuth(req);
    const rawRequestId = res.getHeader('x-request-id');
    const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId;
    return {
      organizationId: auth?.organizationId ?? organizationId,
      actorId: auth?.userId ?? null,
      requestId: typeof requestId === 'string' ? requestId : null,
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

  return {
    importService,
    authGuard,
    readPermission,
    managePermission,
    upload,
    makeContext,
    param,
    asyncWrap,
    loadConfig,
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
    h.asyncWrap(async (req, res, next) => {
      const estateId = h.param(req, 'estateId');
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

      const context = h.makeContext(req, res);
      const config = await h.loadConfig();

      // Write the in-memory buffer to a temp file so exceljs can stream it.
      const tmpPath = `/tmp/silverstone-import-${Date.now()}-${file.originalname}`;
      await fs.writeFile(tmpPath, file.buffer);
      try {
        const response = await h.importService.preview(context, config, {
          estateId,
          filename: body.data.filename ?? file.originalname,
          filePath: tmpPath,
        });
        res.status(201).json({ data: response });
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
      }
    }),
  );

  // --- GET /estates/:estateId/imports -----------------------------------------
  router.get(
    '/:estateId/imports',
    h.authGuard,
    h.readPermission,
    h.asyncWrap(async (req, res) => {
      const context = h.makeContext(req, res);
      const response = await h.importService.list(context, h.param(req, 'estateId'));
      res.status(200).json({ data: response });
    }),
  );

  // --- GET /estates/:estateId/imports/template --------------------------------
  router.get(
    '/:estateId/imports/template',
    h.authGuard,
    h.readPermission,
    h.asyncWrap(async (req, res) => {
      const context = h.makeContext(req, res);
      const config = await h.loadConfig();
      const info = await h.importService.template(context, config, h.param(req, 'estateId'));

      const { buildTemplate } = await import('./excel-parser.js');
      const { buffer: templateBuffer } = buildTemplate(
        { id: info.estateId, slug: '', name: info.estateName },
        config.assetTypes.map((type) => ({
          key: type.key,
          label: type.label,
          active: type.active,
          detailKind: type.detailKind,
        })),
        config.propertyOptions,
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
    }),
  );

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

  // --- GET /imports/:batchId -------------------------------------------------
  router.get(
    '/:batchId',
    h.authGuard,
    h.readPermission,
    h.asyncWrap(async (req, res) => {
      const context = h.makeContext(req, res);
      const response = await h.importService.detail(context, h.param(req, 'batchId'));
      res.status(200).json({ data: response });
    }),
  );

  // --- POST /imports/:batchId/commit ------------------------------------------
  router.post(
    '/:batchId/commit',
    h.authGuard,
    h.managePermission,
    h.asyncWrap(async (req, res) => {
      const context = h.makeContext(req, res);
      const config = await h.loadConfig();
      const response = await h.importService.commit(
        context,
        h.param(req, 'batchId'),
        config.configVersion,
      );
      res.status(200).json({ data: response });
    }),
  );

  return router;
}
