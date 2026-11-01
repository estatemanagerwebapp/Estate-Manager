import { Router } from 'express';
import { getAuth, requireAuth } from '../../middleware/auth-guard.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { PrismaResidentOnboardingRepository } from '../auth/resident-onboarding-repository.js';
import type { PrismaFinanceRepository } from '../resident/finance-repository.js';
import type { PrismaComplaintRepository } from '../resident/complaints-repository.js';
import type { PrismaMessageRepository } from '../resident/messages-repository.js';
import type { PrismaBookingRepository } from '../resident/bookings-repository.js';
import type { PrismaSosRepository } from '../resident/sos-repository.js';
import {
  DEFAULT_MODULE_FLAGS,
  type ModuleFlags,
  type NavCounterKey,
  type NavCountsDto,
} from '@silverstone/shared';

export interface NavigationRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  residentOnboarding: PrismaResidentOnboardingRepository;
  finance: PrismaFinanceRepository;
  complaints: PrismaComplaintRepository;
  messages: PrismaMessageRepository;
  bookings: PrismaBookingRepository;
  sos: PrismaSosRepository;
  organizationId: string;
  /** Reads the live module flags; omitted in tests means all defaults. */
  loadModules?: () => Promise<ModuleFlags>;
}

type CounterLoader = (() => Promise<number>) | null;

/**
 * Loads only the counters the signed-in role is allowed to read.
 *
 * A failed count hides that one badge instead of failing the whole sidebar;
 * the other counters remain available and the failure is logged for the
 * operator. `null` is reserved for "not readable", exactly like the dashboard
 * contract, so the client never renders a misleading zero.
 */
export async function loadNavigationCounts(
  organizationId: string,
  held: ReadonlySet<string>,
  options: Pick<
    NavigationRouteOptions,
    | 'residentOnboarding'
    | 'finance'
    | 'complaints'
    | 'messages'
    | 'bookings'
    | 'sos'
    | 'loadModules'
  >,
): Promise<NavCountsDto> {
  const modules = options.loadModules ? await options.loadModules() : DEFAULT_MODULE_FLAGS;
  const facilitiesEnabled = modules.facilities === true;
  const billingEnabled = modules.billing === true;
  const residentsEnabled = modules.residents === true;

  const readCounter = async (key: NavCounterKey, loader: CounterLoader): Promise<number | null> => {
    if (loader === null) return null;
    try {
      return await loader();
    } catch (error) {
      logger.warn({ err: error, counter: key }, 'navigation counter failed');
      return null;
    }
  };

  const [
    sosAlerts,
    unreadMessages,
    openComplaints,
    requestedBookings,
    overdueInvoices,
    pendingResidents,
    facilityWaitlist,
  ] = await Promise.all([
    readCounter(
      'sosAlerts',
      held.has('sos.read') ? () => options.sos.countActive(organizationId) : null,
    ),
    readCounter(
      'unreadMessages',
      held.has('message.read') ? () => options.messages.countUnreadThreads(organizationId) : null,
    ),
    readCounter(
      'openComplaints',
      held.has('complaint.read') ? () => options.complaints.countOpen(organizationId) : null,
    ),
    readCounter(
      'requestedBookings',
      held.has('booking.read') && facilitiesEnabled
        ? () => options.bookings.countRequestedBookings(organizationId)
        : null,
    ),
    readCounter(
      'overdueInvoices',
      held.has('billing.read') && billingEnabled
        ? () => options.finance.countOverdueInvoices(organizationId)
        : null,
    ),
    readCounter(
      'pendingResidents',
      held.has('resident.manage') && residentsEnabled
        ? () => options.residentOnboarding.countPending(organizationId)
        : null,
    ),
    readCounter(
      'facilityWaitlist',
      held.has('facility.read') && facilitiesEnabled
        ? () => options.bookings.countUpcomingWaitingWatches(organizationId, new Date())
        : null,
    ),
  ]);

  return {
    sosAlerts,
    unreadMessages,
    openComplaints,
    requestedBookings,
    overdueInvoices,
    pendingResidents,
    facilityWaitlist,
  };
}

export function createNavigationRouter(options: NavigationRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId } = options;

  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));

  router.get('/counts', authGuard, async (req, res, next) => {
    const auth = getAuth(req);
    if (!auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    // Resolve the role's effective permissions server-side. The endpoint is
    // intentionally readable by every signed-in role; each field is nulled
    // individually when the role cannot see that queue.
    const held = new Set<string>(await permissions.effectivePermissions(auth.role));
    const counts = await loadNavigationCounts(organizationId, held, options);
    res.status(200).json({ data: counts });
  });

  return router;
}
