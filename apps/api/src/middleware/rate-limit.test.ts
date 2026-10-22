import request from 'supertest';
import express from 'express';
import { getEnv } from '../config/env.js';
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../middleware/rate-limit.js';

function bareApp(limit: number) {
  const app = express();
  app.use(createRateLimiter({ ...getEnv(), RATE_LIMIT_MAX: limit }));
  return app;
}

describe('rate limiting (via supertest)', () => {
  it('emits the RATE_LIMITED envelope on the fourth request with limit 3', async () => {
    const app = bareApp(3);
    app.get('/api/v1/probe', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i += 1) {
      const ok = await request(app).get('/api/v1/probe');
      expect(ok.status).toBe(200);
    }
    const limited = await request(app).get('/api/v1/probe');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('skips health probes entirely', async () => {
    const app = bareApp(1);
    app.get('/api/v1/health/ready', (_req, res) => res.json({ ok: true }));
    app.get('/api/v1/probe', (_req, res) => res.json({ ok: true }));

    // Health probes are never counted.
    const p1 = await request(app).get('/api/v1/health/ready');
    const p2 = await request(app).get('/api/v1/health/ready');
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);

    // A normal route with limit 1 trips on its second request.
    const first = await request(app).get('/api/v1/probe');
    expect(first.status).toBe(200);
    const probe = await request(app).get('/api/v1/probe');
    expect(probe.status).toBe(429);
    expect(probe.body.error.code).toBe('RATE_LIMITED');
  });
});
