import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { SOS_CONTACT_CATEGORIES, type OrganizationSettingsUpdateInput } from '@silverstone/shared';
import { getAuth, requireAuth, requirePermission } from '../../middleware/auth-guard.js';
import { AppError, ValidationError } from '../../lib/errors.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OrganizationSettingsService } from './settings.service.js';

const CONFIG_MANAGE = 'config.manage';

export interface SettingsRouteOptions {
  settingsService: OrganizationSettingsService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
}

const nullableString = (max: number) => z.string().trim().max(max).nullable().optional();

const contactSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[+0-9()\-\s]+$/, 'Phone number contains invalid characters'),
  category: z.enum(SOS_CONTACT_CATEGORIES).default('OTHER'),
  notes: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100).default(0),
});

const updateSchema = z
  .object({
    expectedVersion: z.number().int().min(0).optional(),
    onboarding: z
      .object({
        registrationFee: z
          .object({
            amountKobo: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
            description: nullableString(160),
            refundable: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    accessCodes: z
      .object({
        defaultDurationDays: z.number().int().min(1).max(365).optional(),
      })
      .strict()
      .optional(),
    payments: z
      .object({
        bankTransfer: z
          .object({
            bankName: nullableString(120),
            accountName: nullableString(120),
            accountNumber: z
              .string()
              .trim()
              .regex(/^\d{10,20}$/, 'Account number must be 10–20 digits')
              .nullable()
              .optional(),
            sortCode: nullableString(20),
            instructions: nullableString(500),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    sos: z
      .object({
        contacts: z.array(contactSchema).max(12).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Operational settings surface.
 *
 * Deliberately curated: this route can change the onboarding fee, access-code
 * duration, bank-transfer instructions and emergency contacts. Structural
 * configuration (asset model, property options, module switches, role grants)
 * is not reachable from here.
 */
export function createSettingsRouter(options: SettingsRouteOptions): Router {
  const router = Router();
  const { settingsService, sessions, permissions, organizationId } = options;

  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const configManage = requirePermission((context) => permissions.can(context.role, CONFIG_MANAGE));
  const guards = [authGuard, configManage];

  router.get('/', ...guards, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);
      if (!auth || auth.organizationId !== organizationId) {
        throw new AppError(403, 'FORBIDDEN', 'Organization mismatch');
      }
      const settings = await settingsService.get();
      res.status(200).json({ data: settings });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/', ...guards, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);
      if (!auth || auth.organizationId !== organizationId) {
        throw new AppError(403, 'FORBIDDEN', 'Organization mismatch');
      }

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues.map((issue) => ({
            path: issue.path.map((segment) => String(segment)).join('.'),
            message: issue.message,
          })),
        );
      }

      const requestIdHeader = res.getHeader('x-request-id');
      const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;

      const settings = await settingsService.update(
        {
          organizationId,
          actorId: auth.userId,
          requestId: typeof requestId === 'string' ? requestId : null,
        },
        parsed.data as OrganizationSettingsUpdateInput,
      );
      res.status(200).json({ data: settings });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
