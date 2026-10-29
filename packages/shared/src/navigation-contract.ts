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
