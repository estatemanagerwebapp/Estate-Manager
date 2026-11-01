import type {
  AuditEventType,
  ResidentNavCounterKey,
  ResidentNavCountsDto,
  ResidentSection,
  SyncDomain,
  SyncSnapshotDto,
} from '@silverstone/shared';
import { RESIDENT_NAV_COUNTER_KEYS, residentSectionForLink } from '@silverstone/shared';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { PrismaCommunityRepository } from '../resident/community-repository.js';
import type { PrismaNotificationRepository } from '../resident/notifications-repository.js';
import {
  loadNavigationCounts,
  type NavigationRouteOptions,
} from '../navigation/navigation.routes.js';

/** The repositories the sync snapshot reads; the navigation counters share
 *  the same dependencies as the sidebar endpoint. */
export type SyncNavigationDeps = Pick<
  NavigationRouteOptions,
  'residentOnboarding' | 'finance' | 'complaints' | 'messages' | 'bookings' | 'sos' | 'loadModules'
>;

export interface SyncServiceOptions {
  audit: PrismaAuditRepository;
  notifications: PrismaNotificationRepository;
  community: PrismaCommunityRepository;
  navigation: SyncNavigationDeps;
}

export interface SyncQuery {
  organizationId: string;
  userId: string;
  role: string;
  /** Effective permissions, resolved server-side. */
  held: ReadonlySet<string>;
  /** Changes at or after this instant are reported. */
  since: Date;
}

/**
 * Which audit event types move which screen.
 *
 * The sync endpoint returns domains, not events, so the client can invalidate
 * one TanStack Query key per changed area without downloading the log.
 */
const EVENT_DOMAINS: Partial<Record<AuditEventType, SyncDomain>> = {
  'resident.booking_created': 'bookings',
  'resident.booking_cancelled': 'bookings',
  'booking.confirmed': 'bookings',
  'booking.cancelled': 'bookings',
  'booking.completed': 'bookings',
  'facility.created': 'bookings',
  'facility.updated': 'bookings',
  'facility.archived': 'bookings',

  'resident.message_sent': 'messages',
  'message.replied': 'messages',
  'message.sent': 'messages',
  'message.thread_closed': 'messages',
  'message.thread_reopened': 'messages',

  'resident.payment_submitted': 'payments',
  'resident.payment_recorded': 'payments',
  'invoice.created': 'payments',
  'invoice.voided': 'payments',
  'payment.recorded': 'payments',

  'resident.code_generated': 'codes',
  'resident.code_extended': 'codes',
  'resident.code_deactivated': 'codes',
  'access_code.revoked': 'codes',
  'access_code.extended': 'codes',
  'verification.recorded': 'codes',

  'resident.sos_raised': 'sos',
  'sos.acknowledged': 'sos',
  'sos.resolved': 'sos',
};

const SECTION_COUNTER: Record<ResidentSection, ResidentNavCounterKey> = {
  bookings: 'bookingUpdates',
  codes: 'codeUpdates',
  messages: 'messageUpdates',
  invoices: 'invoiceUpdates',
  sos: 'sosUpdates',
  community: 'communityUpdates',
  notifications: 'unreadNotifications',
};

const SECTION_DOMAIN: Record<ResidentSection, SyncDomain> = {
  bookings: 'bookings',
  codes: 'codes',
  messages: 'messages',
  invoices: 'payments',
  sos: 'sos',
  community: 'community',
  notifications: 'notifications',
};

/** Zero-filled resident counters; every key is always present. */
export function emptyResidentCounts(): ResidentNavCountsDto {
  return Object.fromEntries(
    RESIDENT_NAV_COUNTER_KEYS.map((key) => [key, 0]),
  ) as ResidentNavCountsDto;
}

/** Map audit event types to the screens they change. */
export function domainsForEventTypes(eventTypes: readonly AuditEventType[]): SyncDomain[] {
  const domains = new Set<SyncDomain>();
  for (const eventType of eventTypes) {
    const domain = EVENT_DOMAINS[eventType];
    if (domain) domains.add(domain);
  }
  return [...domains];
}

/**
 * Resident badges from unread notifications.
 *
 * A notification carries the in-app route it points at; that route decides the
 * nav badge. `unreadNotifications` is the total, the others are per-area
 * subsets, so the bell and the section badges always agree.
 */
export function residentCountsFromLinks(
  groups: ReadonlyArray<{ linkTo: string | null; count: number }>,
): ResidentNavCountsDto {
  const counts = emptyResidentCounts();
  let total = 0;
  for (const group of groups) {
    total += group.count;
    const section = residentSectionForLink(group.linkTo);
    if (section === 'notifications') continue;
    const key = SECTION_COUNTER[section];
    counts[key] = (counts[key] ?? 0) + group.count;
  }
  counts.unreadNotifications = total;
  return counts;
}

/**
 * Build one live-sync snapshot.
 *
 * `generatedAt` is captured **before** the reads: the next poll sends it as the
 * cursor, so an event written while this request runs is still reported next
 * time instead of being skipped.
 */
export async function loadSyncSnapshot(
  query: SyncQuery,
  options: SyncServiceOptions,
): Promise<SyncSnapshotDto> {
  const generatedAt = new Date();

  if (query.role === 'RESIDENT') {
    const [groups, links, communityChanged] = await Promise.all([
      options.notifications.unreadGroupsByLink(query.organizationId, query.userId),
      options.notifications.linksSince(query.organizationId, query.userId, query.since),
      options.community.hasChangeSince(query.organizationId, query.since),
    ]);

    const sections = new Set<ResidentSection>(links.map(residentSectionForLink));
    if (communityChanged) sections.add('community');
    const changed = [...new Set([...sections].map((section) => SECTION_DOMAIN[section]))];

    return {
      generatedAt: generatedAt.toISOString(),
      changed,
      staffCounts: null,
      residentCounts: residentCountsFromLinks(groups),
    };
  }

  const [staffCounts, eventTypes] = await Promise.all([
    loadNavigationCounts(query.organizationId, query.held, options.navigation),
    options.audit.eventTypesSince(query.organizationId, query.since),
  ]);

  return {
    generatedAt: generatedAt.toISOString(),
    changed: domainsForEventTypes(eventTypes),
    staffCounts,
    residentCounts: null,
  };
}
