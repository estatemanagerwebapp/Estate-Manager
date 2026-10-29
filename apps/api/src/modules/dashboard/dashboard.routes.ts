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
import type { PrismaFinanceRepository } from '../resident/finance-repository.js';
import type { PrismaComplaintRepository } from '../resident/complaints-repository.js';
import type { PrismaSosRepository } from '../resident/sos-repository.js';
import {
  DEFAULT_MODULE_FLAGS,
  type AuditEventDto,
  type DashboardAttentionItemDto,
  type DashboardKpisDto,
  type ModuleFlags,
} from '@silverstone/shared';

export interface DashboardRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  audit: PrismaAuditRepository;
  users: PrismaUserRepository;
  residentOnboarding: PrismaResidentOnboardingRepository;
  estates: PrismaEstateRepository;
  properties: PrismaPropertyRepository;
  finance: PrismaFinanceRepository;
  complaints: PrismaComplaintRepository;
  sos: PrismaSosRepository;
  organizationId: string;
  /** Reads the live module flags; omitted in tests means all defaults. */
  loadModules?: () => Promise<ModuleFlags>;
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
/** Retained alias for consumers that imported the local name. */
export type DashboardKpis = DashboardKpisDto;

export interface DashboardSummary {
  kpis: DashboardKpisDto;
  attention: DashboardAttentionItemDto[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Loads the dashboard KPIs and the "needs attention" list. Counters gated on
 * a permission the role does not hold — or on a disabled module — resolve to
 * `null`.
 *
 * This function only uses count/aggregate repositories; it never fetches a
 * capped list to derive a number.
 */
export async function loadDashboardSummary(
  organizationId: string,
  held: ReadonlySet<string>,
  options: Pick<
    DashboardRouteOptions,
    | 'users'
    | 'residentOnboarding'
    | 'estates'
    | 'properties'
    | 'finance'
    | 'complaints'
    | 'sos'
    | 'audit'
    | 'loadModules'
  >,
): Promise<DashboardSummary> {
  const { users, residentOnboarding, estates, properties, finance, complaints, sos, audit } =
    options;

  const modules = options.loadModules ? await options.loadModules() : DEFAULT_MODULE_FLAGS;
  const cutoff = new Date(Date.now() - 30 * DAY_MS);

  const residentsEnabled = modules.residents;
  const propertiesEnabled = modules.properties;
  const billingEnabled = modules.billing;
  const estatesEnabled = modules.estates;

  const [
    estateCount,
    propertyStats,
    residentCount,
    pendingInvitations,
    userCount,
    residentDraftCount,
    financeSummary,
    activeSos,
    openComplaints,
    auditCount,
  ] = await Promise.all([
    held.has('estate.read') && estatesEnabled
      ? estates.count(organizationId)
      : Promise.resolve(null),
    held.has('property.read') && propertiesEnabled
      ? (async () => {
          const [total, active] = await Promise.all([
            properties.count(organizationId),
            properties.count(organizationId, 'ACTIVE'),
          ]);
          return { total, active };
        })()
      : Promise.resolve(null),
    held.has('user.manage') && residentsEnabled
      ? users.countActiveByRole(organizationId, 'RESIDENT')
      : Promise.resolve(null),
    held.has('resident.manage') && residentsEnabled
      ? residentOnboarding.countPending(organizationId)
      : Promise.resolve(null),
    held.has('user.manage') ? users.countAll(organizationId) : Promise.resolve(null),
    held.has('resident.manage')
      ? residentOnboarding.countActive(organizationId)
      : Promise.resolve(null),
    held.has('billing.read') && billingEnabled
      ? finance.summarizeOutstanding(organizationId)
      : Promise.resolve(null),
    held.has('sos.read') ? sos.countActive(organizationId) : Promise.resolve(null),
    held.has('complaint.read') ? complaints.countOpen(organizationId) : Promise.resolve(null),
    held.has('audit.read')
      ? audit.countForOrganization({ organizationId, since: cutoff })
      : Promise.resolve(null),
  ]);

  const attention: DashboardAttentionItemDto[] = [];
  if (pendingInvitations !== null && pendingInvitations > 0) {
    attention.push({
      key: 'residents',
      label: 'Pending resident invitations',
      count: pendingInvitations,
      href: '/app/residents',
    });
  }
  if (financeSummary && financeSummary.overdueInvoices > 0) {
    attention.push({
      key: 'billing',
      label: 'Overdue invoices',
      count: financeSummary.overdueInvoices,
      href: '/app/billing',
    });
  }
  if (openComplaints !== null && openComplaints > 0) {
    attention.push({
      key: 'complaints',
      label: 'Open complaints',
      count: openComplaints,
      href: '/app/complaints',
    });
  }
  if (activeSos !== null && activeSos > 0) {
    attention.push({
      key: 'sos',
      label: 'Active SOS alerts',
      count: activeSos,
      href: '/app/sos',
    });
  }

  return {
    kpis: {
      residents: residentCount,
      pendingInvitations,
      totalProperties: propertyStats?.total ?? null,
      activeProperties: propertyStats?.active ?? null,
      outstandingKobo: financeSummary?.outstandingKobo ?? null,
      outstandingInvoices: financeSummary?.outstandingInvoices ?? null,
      overdueInvoices: financeSummary?.overdueInvoices ?? null,
      activeSos,
      openComplaints,
      auditEventsLast30Days: auditCount,
      estates: estateCount,
      users: userCount,
      residentDrafts: residentDraftCount,
    },
    attention,
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
  const page = hasMore ? events.slice(0, max) : events;
  return {
    events: page,
    // The cursor is the last *returned* event, so the next page resumes after
    // it and never skips the look-ahead row.
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
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
      const summary = await loadDashboardSummary(organizationId, held, {
        users: options.users,
        residentOnboarding: options.residentOnboarding,
        estates: options.estates,
        properties: options.properties,
        finance: options.finance,
        complaints: options.complaints,
        sos: options.sos,
        audit,
        loadModules: options.loadModules,
      });
      res.status(200).json({ data: summary });
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
