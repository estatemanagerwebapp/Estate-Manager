/**
 * Operator dashboard contracts.
 *
 * Every counter is nullable: `null` means "hidden to this role" (the role
 * lacks the matching read permission, or the module is disabled), not "zero".
 * A zero would claim the metric is empty, which is a fact the role may not be
 * allowed to see.
 */
export interface DashboardKpisDto {
  /** Active resident portal accounts. */
  residents: number | null;
  /** Resident onboarding drafts waiting for the resident to finish. */
  pendingInvitations: number | null;
  activeProperties: number | null;
  totalProperties: number | null;
  /** Outstanding invoice total in kobo (UNPAID + OVERDUE). */
  outstandingKobo: number | null;
  outstandingInvoices: number | null;
  /** UNPAID invoices past due plus invoices stored as OVERDUE. */
  overdueInvoices: number | null;
  /** RAISED + ACKNOWLEDGED SOS alerts. */
  activeSos: number | null;
  /** OPEN + IN_PROGRESS complaints. */
  openComplaints: number | null;
  /** Exact audit event count for the trailing 30 days. */
  auditEventsLast30Days: number | null;

  // --- Retained for existing deployments/consumers -------------------------
  estates: number | null;
  users: number | null;
  residentDrafts: number | null;
}

export type DashboardAttentionKey = 'residents' | 'billing' | 'complaints' | 'sos';

/** One "needs attention" row. The server omits items the role cannot read. */
export interface DashboardAttentionItemDto {
  key: DashboardAttentionKey;
  label: string;
  count: number;
  href: string;
}

export interface DashboardSummaryResponse {
  kpis: DashboardKpisDto;
  attention: DashboardAttentionItemDto[];
}
