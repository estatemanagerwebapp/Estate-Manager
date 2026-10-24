import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { AuditEventDto, AuditEventType } from '@silverstone/shared';

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
  'admin.bootstrap': 'admin_bootstrap',
  // Phase 2 — estate / property / import events.
  'estate.created': 'estate_created',
  'estate.updated': 'estate_updated',
  'estate.status_changed': 'estate_status_changed',
  'property.created': 'property_created',
  'property.updated': 'property_updated',
  'property.status_changed': 'property_status_changed',
  'import.previewed': 'import_previewed',
  'import.completed': 'import_completed',
  'import.commit_failed': 'import_commit_failed',
  'propertyOptions.updated': 'property_options_updated',
} as const;

export interface RecordAuditEventInput {
  organizationId: string;
  actorId: string | null;
  eventType: AuditEventType;
  targetType: 'user' | 'session' | 'organization' | 'estate' | 'property' | 'import' | null;
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
