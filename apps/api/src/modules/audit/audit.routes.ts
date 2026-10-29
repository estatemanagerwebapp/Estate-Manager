import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import {
  AUDIT_EVENT_OUTCOMES,
  AUDIT_EVENT_TYPES,
  AUDIT_TARGET_TYPES,
  type AuditEventType,
  type AuditTargetType,
} from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermission, auditContext } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { PrismaAuditRepository } from './audit-repository.js';
import { AUDIT_EXPORT_LIMIT, auditExportFilename, toAuditCsv } from './audit-export.js';

export interface AuditRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  audit: PrismaAuditRepository;
  organizationId: string;
  /** Test seam; production uses the documented 10,000-row cap. */
  exportLimit?: number;
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  after: z.string().uuid().optional(),
  eventType: z.enum(AUDIT_EVENT_TYPES).optional(),
  outcome: z.enum(AUDIT_EVENT_OUTCOMES).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const exportQuerySchema = listQuerySchema.omit({ limit: true });

type ParsedFilter = {
  after?: string;
  eventType?: AuditEventType;
  outcome?: 'success' | 'failure';
  targetType?: AuditTargetType;
  actorId?: string;
  from?: Date;
  to?: Date;
};

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

function parseFilter(parsed: {
  after?: string;
  eventType?: AuditEventType;
  outcome?: 'success' | 'failure';
  targetType?: AuditTargetType;
  actorId?: string;
  from?: string;
  to?: string;
}): ParsedFilter {
  const from = parsed.from ? new Date(parsed.from) : undefined;
  const to = parsed.to ? new Date(parsed.to) : undefined;
  if (from && to && from.getTime() > to.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'from must be before or equal to to');
  }
  return {
    after: parsed.after,
    eventType: parsed.eventType,
    outcome: parsed.outcome,
    targetType: parsed.targetType,
    actorId: parsed.actorId,
    from,
    to,
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

/**
 * Organization-wide audit log, mounted at `/audit`.
 *
 * Reads and CSV export both require `audit.read`; the log stays append-only
 * and organisation-scoped. The export records its own `audit.exported` event
 * (filters + row count only — never event metadata or request bodies).
 */
export function createAuditRouter(options: AuditRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, audit, organizationId } = options;
  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'audit.read'));
  const exportLimit = options.exportLimit ?? AUDIT_EXPORT_LIMIT;

  router.get(
    '/events',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = listQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid audit filter'));
        return;
      }
      const filter = parseFilter(query.data);
      const limit = query.data.limit ?? 25;
      // Read one extra row so the caller knows whether another page exists.
      const rows = await audit.listForAuditReadonly({
        organizationId,
        limit: limit + 1,
        cursor: filter.after,
        eventType: filter.eventType,
        outcome: filter.outcome,
        targetType: filter.targetType,
        actorId: filter.actorId,
        from: filter.from,
        to: filter.to,
      });
      const hasMore = rows.length > limit;
      const events = hasMore ? rows.slice(0, limit) : rows;
      res.status(200).json({
        data: {
          events,
          nextCursor: hasMore ? (events[events.length - 1]?.id ?? null) : null,
          limit,
        },
      });
    }),
  );

  router.get(
    '/export',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = exportQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid audit filter'));
        return;
      }
      const filter = parseFilter(query.data);
      const { events, capped } = await audit.listForExport(
        {
          organizationId,
          cursor: filter.after,
          eventType: filter.eventType,
          outcome: filter.outcome,
          targetType: filter.targetType,
          actorId: filter.actorId,
          from: filter.from,
          to: filter.to,
        },
        exportLimit,
      );

      await audit.record({
        ...makeContext(req, res, organizationId),
        eventType: 'audit.exported',
        targetType: 'organization',
        targetId: organizationId,
        outcome: 'success',
        metadata: {
          filters: {
            eventType: filter.eventType ?? null,
            outcome: filter.outcome ?? null,
            targetType: filter.targetType ?? null,
            actorId: filter.actorId ?? null,
            from: filter.from?.toISOString() ?? null,
            to: filter.to?.toISOString() ?? null,
            after: filter.after ?? null,
          },
          rowCount: events.length,
          capped,
        },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${auditExportFilename()}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).send(toAuditCsv(events));
    }),
  );

  return router;
}
