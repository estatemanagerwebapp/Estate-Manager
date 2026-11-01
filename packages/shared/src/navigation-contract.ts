/**
 * Operator sidebar counters.
 *
 * Every counter is nullable: `null` means the signed-in role cannot read that
 * queue (missing permission or disabled module), not that the queue is empty.
 * The client hides a counter instead of rendering a misleading zero.
 */
export const NAV_COUNTER_KEYS = [
  'sosAlerts',
  'unreadMessages',
  'openComplaints',
  'requestedBookings',
  'overdueInvoices',
  'pendingResidents',
  'facilityWaitlist',
] as const;

export type NavCounterKey = (typeof NAV_COUNTER_KEYS)[number];

export type NavCountsDto = Record<NavCounterKey, number | null>;

/**
 * Resident sidebar counters.
 *
 * Resident badges are derived from **unread notifications** addressed to the
 * acting user, grouped by the in-app route they point at. That keeps one write
 * ("notify the resident") responsible for both the inbox and the badge, and it
 * means a badge clears when the resident reads the notification.
 */
export const RESIDENT_NAV_COUNTER_KEYS = [
  'unreadNotifications',
  'bookingUpdates',
  'codeUpdates',
  'messageUpdates',
  'invoiceUpdates',
  'sosUpdates',
  'communityUpdates',
] as const;

export type ResidentNavCounterKey = (typeof RESIDENT_NAV_COUNTER_KEYS)[number];

export type ResidentNavCountsDto = Record<ResidentNavCounterKey, number | null>;
