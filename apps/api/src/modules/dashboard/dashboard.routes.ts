import { Router, type RequestHandler } from 'express';
import { requireAuth, requirePermission, getAuth } from '../../middleware/auth-guard.js';
import { AppError } from '../../lib/errors.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { PrismaUserRepository } from '../auth/user-repository.js';
import type { PrismaResidentOnboardingRepository } from '../auth/resident-onboarding-repository.js';
import type { PrismaEstateRepository } from '../estates/estate-repository.js';
import type { PrismaPropertyRepository } from '../properties/property-repository.js';
import type { AuditEventDto } from '@silverstone/shared';

export interface DashboardRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  audit: PrismaAuditRepository;
  users: PrismaUserRepository;
  residentOnboarding: PrismaResidentOnboardingRepository;
  estates: PrismaEstateRepository;
  properties: PrismaPropertyRepository;
  organizationId: string;
}

/**
 * Dashboard aggregates for the operator overview.
 *
 * Every counter is scoped to what the *signed-in user's role* is allowed to
 * read (the shared permission catalogue decides). A counter the role cannot
 * see is reported as `null` (the client renders "n/a") rather than a zero —
 * a zero would claim "no estates exist", a fact the role is not permitted to
 * see. The server is the authority: the client never trusts a value it cannot
 * verify.
 */

/**
 * Counters the dashboard renders as KPI cards.
 *
 * `null` means "hidden to this role", not "zero". The client distinguishes the
 * two so a restricted role (e.g. GUARD) does not see a misleading 0 next to a
 * metric they are not allowed to read.
 */
export interface DashboardKpis {
  estates: number | null;
  activeProperties: number | null;
  totalProperties: number | null;
  users: number | null;
  residentDrafts: number | null;
  /** Audit events recorded in the trailing 30 days; `null` when hidden. */
  auditEventsLast30Days: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Loads the dashboard KPIs. Counters gated on a permission the role does not
 * hold resolve to `null`.
 *
 * The estate, property, user, onboarding and audit repositories are used
 * only for their *count* / *list-length* surfaces, so the service does not
 * reach into a module's write path.
 */
export async function loadDashboardKpis(
  organizationId: string,
  held: ReadonlySet<string>,
  options: Pick<
    DashboardRouteOptions,
    'users' | 'residentOnboarding' | 'estates' | 'properties' | 'audit'
  >,
): Promise<DashboardKpis> {
  const { users, residentOnboarding, estates, properties, audit } = options;

  const cutoff = new Date(Date.now() - 30 * DAY_MS);

  const [estateCount, propertyStats, userCount, residentCount, auditCount] = await Promise.all([
    held.has('estate.read')
      ? estates.list({ organizationId }).then((rows) => rows.length)
      : Promise.resolve(null),
    held.has('property.read')
      ? (async () => {
          const total = await properties.list({
            organizationId,
            page: 1,
            pageSize: 1,
          });
          const active = await properties.list({
            organizationId,
            status: 'ACTIVE',
            page: 1,
            pageSize: 1,
          });
          return { total: total.total, active: active.total };
        })()
      : Promise.resolve(null),
    held.has('user.manage') ? users.countAll(organizationId) : Promise.resolve(null),
    held.has('resident.manage')
      ? residentOnboarding.listByOrganization(organizationId).then((rows) => rows.length)
      : Promise.resolve(null),
    held.has('audit.read')
      ? audit
          .listForAuditReadonly({ organizationId, limit: 500 })
          .then((events) => events.filter((e) => new Date(e.createdAt) >= cutoff).length)
      : Promise.resolve(null),
  ]);

  return {
    estates: estateCount,
    totalProperties: propertyStats?.total ?? null,
    activeProperties: propertyStats?.active ?? null,
    users: userCount,
    residentDrafts: residentCount,
    auditEventsLast30Days: auditCount,
  };
}

/**
 * The dashboard activity feed: the most recent audit events (capped at `max`),
 * most-recent-first.
 */
export interface DashboardActivityPage {
  events: AuditEventDto[];
  /**
   * Opaque cursor for the next page: the last event's id, or `null` when the
   * feed is exhausted. The activity page passes it back as `?after=` to walk
   * the audit log without re-reading pages already shown.
   */
  nextCursor: string | null;
}

export async function loadDashboardActivity(
  organizationId: string,
  max: number,
  audit: PrismaAuditRepository,
  after?: string,
): Promise<DashboardActivityPage> {
  // `max + 1` so the caller can tell whether more pages remain without a
  // separate count query. The returned slice is trimmed back to `max`.
  const events = await audit.listForAuditReadonly({
    organizationId,
    limit: max + 1,
    cursor: after,
  });
  const hasMore = events.length > max;
  return {
    events: hasMore ? events.slice(0, max) : events,
    nextCursor: hasMore ? (events[events.length - 1]?.id ?? null) : null,
  };
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

export function createDashboardRouter(options: DashboardRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, audit, organizationId } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);

  router.get(
    '/kpis',
    authGuard,
    asyncWrap(async (req, res, next) => {
      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      // Resolve the role's effective permissions server-side; the dashboard
      // exposes only counters the role is granted to read.
      const held = new Set<string>(await permissions.effectivePermissions(auth.role));
      const kpis = await loadDashboardKpis(organizationId, held, {
        users: options.users,
        residentOnboarding: options.residentOnboarding,
        estates: options.estates,
        properties: options.properties,
        audit,
      });
      res.status(200).json({ data: { kpis } });
    }),
  );

  router.get(
    '/activity',
    authGuard,
    requirePermission((ctx) => permissions.can(ctx.role, 'audit.read')),
    asyncWrap(async (req, res) => {
      const query = req.query;
      const rawLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : 20;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
      const after =
        typeof query.after === 'string' && query.after.length > 0 ? query.after : undefined;
      const page = await loadDashboardActivity(organizationId, limit, audit, after);
      res.status(200).json({ data: { ...page, limit } });
    }),
  );

  return router;
}
