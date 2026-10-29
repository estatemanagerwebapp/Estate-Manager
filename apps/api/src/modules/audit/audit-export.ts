import type { AuditEventDto } from '@silverstone/shared';

/** Hard cap for one CSV export. The UI never requests more than this. */
export const AUDIT_EXPORT_LIMIT = 10_000;

const FORMULA_PREFIXES = new Set(['=', '+', '-', '@']);

/**
 * Quote and escape one CSV cell.
 *
 * Cells are always quoted. A leading formula character is prefixed with an
 * apostrophe so a spreadsheet application treats a crafted audit value as
 * text instead of executing it.
 */
export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = FORMULA_PREFIXES.has(raw.charAt(0)) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/** Serialize audit events to a UTF-8 CSV document (newest first). */
export function toAuditCsv(events: readonly AuditEventDto[]): string {
  const header = [
    'id',
    'created_at',
    'event_type',
    'outcome',
    'actor_id',
    'actor_email',
    'target_type',
    'target_id',
    'request_id',
    'metadata',
  ];
  const lines = [header.map(escapeCsvCell).join(',')];
  for (const event of events) {
    lines.push(
      [
        event.id,
        event.createdAt,
        event.eventType,
        event.outcome,
        event.actorId ?? '',
        event.actorEmail ?? '',
        event.targetType ?? '',
        event.targetId ?? '',
        event.requestId ?? '',
        JSON.stringify(event.metadata ?? {}),
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Dated download filename for an export. */
export function auditExportFilename(now = new Date()): string {
  return `audit-log-${now.toISOString().slice(0, 10)}.csv`;
}
