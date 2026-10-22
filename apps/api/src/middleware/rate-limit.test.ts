import type { Request, Response } from 'express';
import { createRateLimitedResponse } from '../lib/rate-limit-response.js';
import { getEnv } from '../config/env.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { describe, expect, it } from 'vitest';

/**
 * Minimal in-memory stand-ins so the limiter middleware can be driven
 * directly without a running HTTP server.
 */
function makeReq(res: Record<string, unknown>): Request {
  return {
    method: 'GET',
    path: '/api/v1/probe',
    headers: {},
    url: '/api/v1/probe',
    originalUrl: '/api/v1/probe',
    ip: '127.0.0.1',
    get: (name: string) => (res.headers as Record<string, string>)[name.toLowerCase()] ?? '',
    res: res as unknown as Response,
  } as unknown as Request;
}

function makeRes(): { res: Record<string, unknown>; next: () => void; called: () => boolean } {
  let sent = false;
  const res: Record<string, unknown> = {
    statusCode: 200,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      sent = true;
      return this;
    },
    header(name: string, value?: string) {
      const key = name.toLowerCase();
      if (value !== undefined) this.headers[key] = value;
      return (this.headers as Record<string, string>)[key] ?? '';
    },
  };
  return { res, next: () => {}, called: () => sent };
}

describe('rate limiting', () => {
  it('emits the RATE_LIMITED envelope on the fourth request with limit 3', () => {
    const env = getEnv();
    const limiter = createRateLimiter({ ...env, RATE_LIMIT_MAX: 3 });

    const requests = [makeRes(), makeRes(), makeRes(), makeRes()];
    for (const item of requests) {
      limiter(makeReq(item.res), item.res as unknown as Response, item.next);
    }

    const limited = requests[3];
    expect(limited?.called()).toBe(true);
    expect(limited?.res.statusCode).toBe(429);
    const body = limited?.res.payload as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('skips health probes entirely', () => {
    const env = getEnv();
    const limiter = createRateLimiter({ ...env, RATE_LIMIT_MAX: 1 });

    const probe = makeRes();
    const probeReq = {
      ...makeReq(probe.res),
      path: `${env.API_BASE_PATH}/health/ready`,
    } as Request;
    limiter(probeReq, probe.res as unknown as Response, probe.next);
    // The probe must never be counted, so even the second call passes.
    const probe2 = makeRes();
    const probeReq2 = {
      ...makeReq(probe2.res),
      path: `${env.API_BASE_PATH}/health/ready`,
    } as Request;
    limiter(probeReq2, probe2.res as unknown as Response, probe2.next);

    expect(probe.called()).toBe(false);
    expect(probe2.called()).toBe(false);

    // A normal route with the same limit does trip.
    const normal = makeRes();
    limiter(makeReq(normal.res), normal.res as unknown as Response, normal.next);
    expect(normal.called()).toBe(true);
  });

  it('builds the 429 body with the request id from the response', () => {
    const res = makeRes();
    (res.res.headers as Record<string, string>)['x-request-id'] = 'req-9';
    createRateLimitedResponse({} as never, res.res as never);
    expect(res.res.statusCode).toBe(429);
    expect(res.res.payload).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Retry after the indicated delay.',
        requestId: 'req-9',
      },
    });
  });
});
