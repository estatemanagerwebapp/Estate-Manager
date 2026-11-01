/**
 * Database error classification.
 *
 * The old handler answered every Prisma failure with
 * `503 DATABASE_UNAVAILABLE / "The database is not available"`, which hid a
 * missing enum value behind a connectivity message. These tests pin the
 * classification so a schema problem stays distinguishable from an outage.
 */
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { describePrismaError } from './middleware/error-handler.js';

function known(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('database error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('describePrismaError', () => {
  it('reports a missing enum/table/column as a schema problem, not an outage', () => {
    const enumError = describePrismaError(
      known('P2010', { code: '22P02', message: 'invalid input value for enum' }),
    );
    expect(enumError).toMatchObject({
      status: 503,
      code: 'SCHEMA_MIGRATION_REQUIRED',
    });
    expect(enumError?.message).toContain('Prisma P2010');
    expect(enumError?.message).toContain('PostgreSQL 22P02');
    expect(enumError?.message).not.toContain('not available');

    expect(describePrismaError(known('P2021'))?.code).toBe('SCHEMA_MIGRATION_REQUIRED');
    expect(describePrismaError(known('P2022'))?.code).toBe('SCHEMA_MIGRATION_REQUIRED');
  });

  it('keeps other raw-query failures generic but identifies the codes', () => {
    const raw = describePrismaError(known('P2010', { code: 'XX000' }));
    expect(raw?.code).toBe('DATABASE_ERROR');
    expect(raw?.message).toContain('Prisma P2010');
    expect(raw?.message).toContain('PostgreSQL XX000');
  });

  it('maps constraint errors to their HTTP semantics', () => {
    expect(describePrismaError(known('P2002'))).toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
    expect(describePrismaError(known('P2003'))).toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
    expect(describePrismaError(known('P2025'))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(describePrismaError(known('P2028'))).toMatchObject({
      status: 503,
      code: 'DATABASE_BUSY',
    });
    expect(describePrismaError(known('P2034'))).toMatchObject({
      status: 503,
      code: 'DATABASE_BUSY',
    });
  });

  it('returns null for non-Prisma errors', () => {
    expect(describePrismaError(new Error('boom'))).toBeNull();
    expect(describePrismaError('not an error')).toBeNull();
  });
});
