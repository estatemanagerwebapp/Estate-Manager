import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('security and error envelopes', () => {
  it('serves 404 in the standard envelope with a request id', async () => {
    const app = createApp({ checkDatabase: async () => {} });
    const response = await request(app).get('/api/v1/nope');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(typeof response.body.error.requestId).toBe('string');
    expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
  });

  it('rejects malformed JSON with a BAD_REQUEST envelope', async () => {
    const app = createApp({ checkDatabase: async () => {} });
    const response = await request(app)
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send('{not json');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects oversized payloads with PAYLOAD_TOO_LARGE', async () => {
    const app = createApp({ checkDatabase: async () => {} });
    const bigPayload = JSON.stringify({ filler: 'x'.repeat(1_200_000) });
    const response = await request(app)
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send(bigPayload);
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('strips x-powered-by and sets security headers', async () => {
    const app = createApp({ checkDatabase: async () => {} });
    const response = await request(app).get('/api/v1/health/live');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('enforces the CORS allowlist', async () => {
    const app = createApp({ checkDatabase: async () => {} });
    const allowed = await request(app)
      .get('/api/v1/health/live')
      .set('origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const rejected = await request(app)
      .get('/api/v1/health/live')
      .set('origin', 'https://evil.example');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limits non-health routes with the RATE_LIMITED envelope', async () => {
    const app = createApp({ checkDatabase: async () => {} });
    // Test env sets RATE_LIMIT_MAX=1000; hit /system/info (no config service → 404 is fine)
    // until the limiter trips. Use a scratch path via a low-limit override:
    // instead, directly assert the 429 body shape with a small-limit app.
    const tiny = createAppWithLimit(3);
    for (let i = 0; i < 3; i += 1) {
      await request(tiny).get('/api/v1/probe');
    }
    const limited = await request(tiny).get('/api/v1/probe');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});

function createAppWithLimit(limit: number) {
  process.env.RATE_LIMIT_MAX = String(limit);
  // Rebuild env cache for the new limit.
  const { resetEnvForTests } = envModule;
  resetEnvForTests();
  return createApp({ checkDatabase: async () => {} });
}

import * as envModule from './config/env.js';
