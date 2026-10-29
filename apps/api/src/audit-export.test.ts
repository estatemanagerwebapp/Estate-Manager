import { describe, expect, it } from 'vitest';
import type { AuditEventDto } from '@silverstone/shared';
import { auditExportFilename, escapeCsvCell, toAuditCsv } from './modules/audit/audit-export.js';

function event(overrides: Partial<AuditEventDto> = {}): AuditEventDto {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    eventType: 'estate.created',
    actorId: '00000000-0000-4000-8000-000000000002',
    actorEmail: 'admin@example.com',
    actorName: 'Admin',
    targetType: 'estate',
    targetId: '00000000-0000-4000-8000-000000000003',
    requestId: 'req-1',
    outcome: 'success',
    metadata: { targetName: 'Silverstone Gate A' },
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('audit CSV export', () => {
  it('always quotes cells and doubles embedded quotes', () => {
    expect(escapeCsvCell('plain')).toBe('"plain"');
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
    expect(escapeCsvCell(null)).toBe('""');
    expect(escapeCsvCell(undefined)).toBe('""');
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('neutralizes spreadsheet formula prefixes', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(escapeCsvCell('+1+1')).toBe(`"'+1+1"`);
    expect(escapeCsvCell('-2+3')).toBe(`"'-2+3"`);
    expect(escapeCsvCell('@cmd')).toBe(`"'@cmd"`);
    // Only the first character is dangerous; an inner "=" is left alone.
    expect(escapeCsvCell('safe=value')).toBe('"safe=value"');
  });

  it('serializes a header plus one CRLF-delimited row per event', () => {
    const csv = toAuditCsv([
      event(),
      event({ id: '00000000-0000-4000-8000-000000000009', requestId: '=1+1' }),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('"event_type"');
    expect(lines[0]).toContain('"metadata"');
    expect(lines[1]).toContain('"estate.created"');
    expect(lines[1]).toContain('"Silverstone Gate A"');
    // The dangerous request id is prefixed, then quoted.
    expect(lines[2]).toContain(`"'=1+1"`);
    // Trailing CRLF keeps the file newline-terminated.
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('names the export by UTC date', () => {
    expect(auditExportFilename(new Date('2026-10-29T23:59:59.000Z'))).toBe(
      'audit-log-2026-10-29.csv',
    );
  });
});
