/**
 * Unit test for the shared API client's error handling: the client must expose
 * structured `details` and `status` on `ApiRequestError` so forms can render
 * field-level validation errors without parsing the prose message.
 */
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, api, buildAuditQuery } from './client';
import type { EstateFilter } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiRequestError', () => {
  it('carries structured details and status from a 400 envelope', async () => {
    const details = [{ path: 'body.name', message: 'Required' }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, {
          error: { code: 'VALIDATION_ERROR', message: 'Invalid', requestId: 'r1', details },
        }),
      ),
    );

    await expect(api.listEstates({} as EstateFilter)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      details,
    });
  });

  it('serializes audit filters without empty values', () => {
    expect(buildAuditQuery({})).toBe('');
    expect(
      buildAuditQuery({
        eventType: 'estate.created',
        outcome: 'failure',
        targetType: 'estate',
        actorId: '00000000-0000-4000-8000-000000000001',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.999Z',
        limit: 25,
      }),
    ).toBe(
      'limit=25&eventType=estate.created&outcome=failure&targetType=estate&actorId=00000000-0000-4000-8000-000000000001&from=2026-10-01T00%3A00%3A00.000Z&to=2026-10-31T23%3A59%3A59.999Z',
    );
    // The export omits the page limit; the server applies its own cap.
    expect(buildAuditQuery({ limit: 25, eventType: 'login.failed' }, false)).toBe(
      'eventType=login.failed',
    );
  });

  it('is constructable with the options bag (requestId/status/details)', () => {
    const err = new ApiRequestError('CONFLICT', 'stale', {
      requestId: 'r2',
      status: 409,
      details: [{ path: 'baseVersion', message: 'out of date' }],
    });
    expect(err.status).toBe(409);
    expect(err.requestId).toBe('r2');
    expect(err.details?.[0]?.path).toBe('baseVersion');
  });
});
