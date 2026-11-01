import { Router } from 'express';
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
import type { PropertyService } from './property.service.js';
import { PROPERTY_KINDS } from '@silverstone/shared';

const PROPERTY_READ = 'property.read';
const PROPERTY_MANAGE = 'property.manage';

export interface PropertyRouteOptions {
  propertyService: PropertyService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
}

/**
 * Property registry surface. All routes are cookie-authenticated and gated by
 * `property.read` / `property.manage`.
 *
 * The API is the authority for the address shape: the request carries typed
 * fields, and the service validates them against the property kind and the
 * selected house-type row. There is no runtime type/address configuration.
 */
export function createPropertyRouter(options: PropertyRouteOptions): Router {
  const router = Router();
  const { propertyService, sessions, permissions, organizationId } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);

  const readPermission = requirePermission((ctx) => permissions.can(ctx.role, PROPERTY_READ));
  const managePermission = requirePermission((ctx) => permissions.can(ctx.role, PROPERTY_MANAGE));

  const addressFields = {
    streetName: z.string().trim().max(120).optional(),
    houseNumber: z.string().trim().max(32).optional().nullable(),
    blockName: z.string().trim().max(64).optional().nullable(),
    floorNumber: z.string().trim().max(16).optional().nullable(),
    unitNumber: z.string().trim().max(32).optional().nullable(),
    plotNumber: z.string().trim().max(32).optional().nullable(),
    plotName: z.string().trim().max(64).optional().nullable(),
  };

  // --- GET /properties/house-types ---------------------------------------------
  router.get('/house-types', authGuard, readPermission, async (_req, res) => {
    const response = await propertyService.listHouseTypes();
    res.status(200).json({ data: response });
  });

  // --- GET /properties ---------------------------------------------------------
  router.get('/', authGuard, readPermission, async (req, res, next) => {
    const query = z
      .object({
        estateId: z.string().trim().max(64).optional(),
        kind: z.enum(PROPERTY_KINDS).optional(),
        status: z.string().trim().max(20).optional(),
        identifierContains: z.string().trim().max(200).optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(200).optional(),
      })
      .safeParse(req.query ?? {});
    if (!query.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid filter'));
      return;
    }
    const context = routeAuditContext(req, res, organizationId);
    const response = await propertyService.list(context, query.data);
    res.status(200).json({ data: response });
  });

  // --- POST /properties --------------------------------------------------------
  router.post('/', authGuard, managePermission, async (req, res, next) => {
    const body = z
      .object({
        estateId: z.string().trim().min(1),
        kind: z.enum(PROPERTY_KINDS),
        houseType: z.string().trim().min(1).max(48).optional().nullable(),
        name: z.string().trim().max(120).optional().nullable(),
        ...addressFields,
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid property input'));
      return;
    }
    const context = routeAuditContext(req, res, organizationId);
    const property = await propertyService.create(context, {
      estateId: body.data.estateId,
      kind: body.data.kind,
      houseType: body.data.houseType ?? null,
      name: body.data.name ?? undefined,
      streetName: body.data.streetName ?? '',
      houseNumber: body.data.houseNumber ?? null,
      blockName: body.data.blockName ?? null,
      floorNumber: body.data.floorNumber ?? null,
      unitNumber: body.data.unitNumber ?? null,
      plotNumber: body.data.plotNumber ?? null,
      plotName: body.data.plotName ?? null,
    });
    res.status(201).json({ data: { property } });
  });

  // --- GET /properties/:propertyId ---------------------------------------------
  router.get('/:propertyId', authGuard, readPermission, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await propertyService.detail(context, routeParam(req, 'propertyId'));
    res.status(200).json({ data: response });
  });

  // --- PATCH /properties/:propertyId --------------------------------------------
  router.patch('/:propertyId', authGuard, managePermission, async (req, res, next) => {
    const body = z
      .object({
        status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
        name: z.string().trim().max(120).optional().nullable(),
        ...addressFields,
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid property update'));
      return;
    }
    const context = routeAuditContext(req, res, organizationId);
    const property = await propertyService.update(context, routeParam(req, 'propertyId'), {
      status: body.data.status,
      name: body.data.name,
      streetName: body.data.streetName,
      houseNumber: body.data.houseNumber,
      blockName: body.data.blockName,
      floorNumber: body.data.floorNumber,
      unitNumber: body.data.unitNumber,
      plotNumber: body.data.plotNumber,
      plotName: body.data.plotName,
    });
    res.status(200).json({ data: { property } });
  });

  // --- POST /properties/:propertyId/archive --------------------------------------
  router.post('/:propertyId/archive', authGuard, managePermission, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const property = await propertyService.archive(context, routeParam(req, 'propertyId'));
    res.status(200).json({ data: { property } });
  });

  // --- DELETE /properties/:propertyId --------------------------------------------
  router.delete('/:propertyId', authGuard, managePermission, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    await propertyService.delete(context, routeParam(req, 'propertyId'));
    res.status(200).json({ data: { ok: true } });
  });

  return router;
}
