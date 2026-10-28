import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { AuditEventDto, AuditEventType, AuditTargetType } from '@silverstone/shared';

/**
 * Append-only security audit log.
 *
 * Rows are insert-only from application code; there is deliberately no
 * `update` or `delete` method here (ADR-0001 keeps data access at this
 * boundary, and the audit model's append orientation is enforced at the
 * repository layer so a later caller cannot reach for the wrong primitive).
 */

/**
 * The shared wire contract uses dotted event names (e.g. `login.succeeded`);
 * the database enum uses underscored values (e.g. `login_succeeded`). This
 * map is the single translation point.
 */
const AUDIT_EVENT_DB_MAP = {
  'login.succeeded': 'login_succeeded',
  'login.failed': 'login_failed',
  logout: 'logout',
  'password.changed': 'password_changed',
  'password.reset_requested': 'password_reset_requested',
  'password.reset_completed': 'password_reset_completed',
  'account.suspended': 'account_suspended',
  'account.reactivated': 'account_reactivated',
  'account.disabled': 'account_disabled',
  'user.role_changed': 'user_role_changed',
  'user.deleted': 'user_deleted',
  'admin.bootstrap': 'admin_bootstrap',
  'user.registered': 'user_registered',
  'user.onboarding_completed': 'user_onboarding_completed',
  // Phase 2 — estate / property / import events.
  'estate.created': 'estate_created',
  'estate.updated': 'estate_updated',
  'estate.status_changed': 'estate_status_changed',
  'estate.deleted': 'estate_deleted',
  'property.created': 'property_created',
  'property.updated': 'property_updated',
  'property.status_changed': 'property_status_changed',
  'property.deleted': 'property_deleted',
  'import.previewed': 'import_previewed',
  'import.completed': 'import_completed',
  'import.commit_failed': 'import_commit_failed',
  'propertyOptions.updated': 'property_options_updated',
  // Phase 2 — resident onboarding (persistent code, payment-gated).
  'resident.registered': 'resident_registered',
  'resident.onboarding_completed': 'resident_onboarding_completed',
  'resident.payment_recorded': 'resident_payment_recorded',
  'resident.payment_submitted': 'resident_payment_submitted',
  'resident.deleted': 'resident_deleted',
  // Phase 3 — resident dashboard.
  'resident.profile_updated': 'resident_profile_updated',
  'resident.invoice_created': 'resident_invoice_created',
  'resident.code_generated': 'resident_code_generated',
  'resident.code_extended': 'resident_code_extended',
  'resident.code_deactivated': 'resident_code_deactivated',
  'resident.complaint_created': 'resident_complaint_created',
  'resident.message_sent': 'resident_message_sent',
  'resident.booking_created': 'resident_booking_created',
  'resident.booking_cancelled': 'resident_booking_cancelled',
  'resident.sos_raised': 'resident_sos_raised',
  // Operator console — Phase 0 catalogue (emitted by later phases).
  'resident.updated': 'resident_updated',
  'resident.archived': 'resident_archived',
  'resident.restored': 'resident_restored',
  'resident.access_disabled': 'resident_access_disabled',
  'resident.access_enabled': 'resident_access_enabled',
  'user.created': 'user_created',
  'user.sessions_revoked': 'user_sessions_revoked',
  'message.replied': 'message_replied',
  'message.thread_closed': 'message_thread_closed',
  'message.thread_reopened': 'message_thread_reopened',
  'complaint.replied': 'complaint_replied',
  'complaint.status_changed': 'complaint_status_changed',
  'invoice.created': 'invoice_created',
  'invoice.voided': 'invoice_voided',
  'payment.recorded': 'payment_recorded',
  'access_code.revoked': 'access_code_revoked',
  'access_code.extended': 'access_code_extended',
  'verification.recorded': 'verification_recorded',
  'facility.created': 'facility_created',
  'facility.updated': 'facility_updated',
  'facility.archived': 'facility_archived',
  'booking.confirmed': 'booking_confirmed',
  'booking.cancelled': 'booking_cancelled',
  'booking.completed': 'booking_completed',
  'sos.acknowledged': 'sos_acknowledged',
  'sos.resolved': 'sos_resolved',
  'settings.updated': 'settings_updated',
  'audit.exported': 'audit_exported',
} as const;

export { AUDIT_EVENT_DB_MAP };

export interface RecordAuditEventInput {
  organizationId: string;
  actorId: string | null;
  eventType: AuditEventType;
  targetType: AuditTargetType | null;
  targetId: string | null;
  requestId: string | null;
  outcome: 'success' | 'failure';
  /** Only safe, non-secret key/value pairs. Never passwords, tokens,
   *  reset links or full request bodies. */
  metadata?: Record<string, unknown>;
}

export class PrismaAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    const dbEventType = AUDIT_EVENT_DB_MAP[input.eventType];
    if (!dbEventType) {
      // An event type that the shared package allows but the database enum
      // does not yet know about: fail closed rather than drop the event.
      throw new Error(`Audit event type "${input.eventType}" has no database mapping`);
    }

    await this.prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        eventType: dbEventType as 'login_succeeded',
        targetType: input.targetType,
        targetId: input.targetId,
        requestId: input.requestId,
        outcome: input.outcome,
        metadata: sanitizeMetadata(input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async listForAuditReadonly(filter: {
    organizationId: string;
    limit?: number;
    cursor?: string;
  }): Promise<AuditEventDto[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { organizationId: filter.organizationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 100, 500),
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    return rows.map(toAuditEventDto);
  }
}

function toAuditEventDto(row: {
  id: string;
  eventType: string;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  outcome: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}): AuditEventDto {
  const reverse: Record<string, AuditEventType> = {};
  for (const [wire, db] of Object.entries(AUDIT_EVENT_DB_MAP)) {
    reverse[db] = wire as AuditEventType;
  }
  return {
    id: row.id,
    eventType: reverse[row.eventType] ?? (row.eventType as AuditEventType),
    actorId: row.actorId,
    targetType: row.targetType as AuditEventDto['targetType'],
    targetId: row.targetId,
    requestId: row.requestId,
    outcome: row.outcome as AuditEventDto['outcome'],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Defense-in-depth: strip keys that must never reach the audit store even if
 * a caller accidentally puts them in `metadata`.
 */
function sanitizeMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const FORBIDDEN = new Set([
    'password',
    'passwordHash',
    'currentPassword',
    'newPassword',
    'token',
    'resetToken',
    'tokenHash',
    'session',
    'sessionId',
    'cookie',
    'resetUrl',
    'resetLink',
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN.has(key) || FORBIDDEN.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}
