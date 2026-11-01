import type { NavCountsDto, ResidentNavCountsDto } from './navigation-contract.js';

/**
 * Live-sync contract.
 *
 * The console does not hold a socket. Both the operator and resident shells
 * poll `/sync` with the previous response's `generatedAt` and receive:
 *
 *   - the current badge counts for the signed-in role, and
 *   - the domains that changed since that cursor.
 *
 * The client invalidates only the changed domains, so an open list updates
 * without a page refresh and without refetching everything on every poll.
 */
export const SYNC_DOMAINS = [
  'bookings',
  'messages',
  'payments',
  'codes',
  'sos',
  'community',
  'notifications',
] as const;

export type SyncDomain = (typeof SYNC_DOMAINS)[number];

/** The resident area an in-app link points at. */
export const RESIDENT_SECTIONS = [
  'bookings',
  'codes',
  'messages',
  'invoices',
  'sos',
  'community',
  'notifications',
] as const;

export type ResidentSection = (typeof RESIDENT_SECTIONS)[number];

/**
 * Map a notification `linkTo` to the resident area it belongs to.
 *
 * One function is shared by the API (to group unread notifications into badge
 * counters) and the web client (to pick the badge on a nav item), so the
 * grouping can never drift from the navigation.
 */
export function residentSectionForLink(linkTo: string | null): ResidentSection {
  if (!linkTo) return 'notifications';
  if (linkTo.startsWith('/resident/app/bookings')) return 'bookings';
  if (linkTo.startsWith('/resident/app/codes')) return 'codes';
  if (linkTo.startsWith('/resident/app/messages')) return 'messages';
  if (linkTo.startsWith('/resident/app/invoices')) return 'invoices';
  if (linkTo.startsWith('/resident/app/sos')) return 'sos';
  if (linkTo.startsWith('/resident/app/community')) return 'community';
  return 'notifications';
}

export interface SyncSnapshotDto {
  /**
   * Server time captured *before* the change queries. The next poll sends this
   * as its cursor, so nothing written during this request can be skipped.
   */
  generatedAt: string;
  /** Domains with at least one change since the previous cursor. */
  changed: SyncDomain[];
  /** Operator queue badges; `null` for residents. */
  staffCounts: NavCountsDto | null;
  /** Resident badges; `null` for staff. */
  residentCounts: ResidentNavCountsDto | null;
}
