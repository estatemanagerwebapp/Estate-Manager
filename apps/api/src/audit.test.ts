/**
 * Audit log API integration tests.
 *
 * Real Prisma repositories, real Express router, disposable test database and
 * one dedicated organization. The suite covers the filters, cursor
 * pagination, organization scoping, permission gate, invalid input and the
 * CSV export (including the hard cap and the `audit.exported` trail).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createApp, type Express } from './application.js';
import { AuthService } from './modules/auth/auth.service.js';
import { UserService } from './modules/auth/user.service.js';
import { PrismaUserRepository } from './modules/auth/user-repository.js';
import { PrismaSessionRepository } from './modules/auth/session-repository.js';
import { PrismaPasswordResetRepository } from './modules/auth/reset-token-repository.js';
import { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';
import { MockEmailAdapter } from './modules/auth/email-adapter.js';
import { getPrismaClient, disconnectPrisma } from './lib/prisma.js';
import { hashPassword } from './lib/password.js';

let prisma: PrismaClient;
let app: Express;
let cappedApp: Express;
let users: PrismaUserRepository;
let sessions: PrismaSessionRepository;
let resetTokens: PrismaPasswordResetRepository;
let audit: PrismaAuditRepository;
let email: MockEmailAdapter;
let organizationId = '';
let otherOrganizationId = '';

const ADMIN_PASSWORD = 'Aud1tSecretXyz';
const GUARD_PASSWORD = 'Gu4rdSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildApp(exportLimit?: number): Express {
  const permissions = new PermissionResolver(async () => []);
  const authService = new AuthService(
    users,
    sessions,
    resetTokens,
    audit,
    permissions,
    email,
    7,
    60,
    'http://localhost:5173',
  );
  const userService = new UserService(users, sessions, audit, permissions);
  return createApp({
    checkDatabase: async () => {},
    rateLimitMax: 1000,
    auth: {
      authService,
      userService,
      sessions,
      permissions,
      organizationId,
      rateLimits: { loginPerWindow: 1000, forgotPerWindow: 1000, resetPerWindow: 1000 },
    },
    audit: {
      sessions,
      permissions,
      audit,
      organizationId,
      ...(exportLimit !== undefined ? { exportLimit } : {}),
    },
  });
}

async function createTestUser(input: {
  email?: string;
  password?: string;
  role?: string;
}): Promise<{ id: string; email: string; role: string }> {
  const suffix = uniqueSuffix();
  const row = await prisma.user.create({
    data: {
      organizationId,
      email: input.email ?? `${(input.role ?? 'GUARD').toLowerCase()}_${suffix}@example.com`,
      passwordHash: await hashPassword(input.password ?? ADMIN_PASSWORD),
      role: input.role ?? 'GUARD',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  return { id: row.id, email: row.email, role: row.role };
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

interface SeedEvent {
  eventType?: 'estate_created' | 'property_created' | 'login_failed' | 'settings_updated';
  outcome?: 'success' | 'failure';
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  createdAt?: Date;
  organization?: string;
  metadata?: Prisma.InputJsonValue;
}

async function createEvent(input: SeedEvent = {}): Promise<string> {
  const row = await prisma.auditEvent.create({
    data: {
      organizationId: input.organization ?? organizationId,
      eventType: input.eventType ?? 'estate_created',
      outcome: input.outcome ?? 'success',
      actorId: input.actorId ?? null,
      targetType: input.targetType ?? 'settings',
      targetId: input.targetId ?? randomUUID(),
      requestId: input.requestId ?? `req-${randomUUID()}`,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt ?? new Date(),
    },
  });
  return row.id;
}

async function login(email: string, password: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

beforeAll(async () => {
  prisma = getPrismaClient();
  email = new MockEmailAdapter();
  users = new PrismaUserRepository(prisma);
  sessions = new PrismaSessionRepository(prisma);
  resetTokens = new PrismaPasswordResetRepository(prisma);
  audit = new PrismaAuditRepository(prisma);

  const org = await prisma.organization.create({
    data: { slug: `audit_test_${uniqueSuffix()}`, name: 'Audit Test' },
  });
  organizationId = org.id;
  const other = await prisma.organization.create({
    data: { slug: `audit_other_${uniqueSuffix()}`, name: 'Audit Other' },
  });
  otherOrganizationId = other.id;

  app = buildApp();
  cappedApp = buildApp(1);
});

beforeEach(async () => {
  // Each test starts from a clean audit table (including the previous test's
  // login events) so cursor windows and export counts are deterministic.
  await prisma.auditEvent.deleteMany({
    where: { organizationId: { in: [organizationId, otherOrganizationId] } },
  });
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({
    where: { organizationId: { in: [organizationId, otherOrganizationId] } },
  });
  await prisma.session.deleteMany({
    where: { user: { organizationId: { in: [organizationId, otherOrganizationId] } } },
  });
  await prisma.user.deleteMany({
    where: { organizationId: { in: [organizationId, otherOrganizationId] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [organizationId, otherOrganizationId] } },
  });
  await disconnectPrisma();
});

describe('audit log API', () => {
  it('returns 401 without a session', async () => {
    const response = await request(app).get('/api/v1/audit/events');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('forbids roles without audit.read', async () => {
    const guard = await createTestUser({ role: 'GUARD', password: GUARD_PASSWORD });
    const cookie = await login(guard.email, GUARD_PASSWORD);
    const response = await request(app).get('/api/v1/audit/events').set('Cookie', cookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('filters by event type, outcome, target and actor', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD);

    const first = await createEvent({
      eventType: 'estate_created',
      outcome: 'success',
      actorId: admin.id,
    });
    const second = await createEvent({
      eventType: 'property_created',
      outcome: 'failure',
      actorId: admin.id,
      targetType: 'property',
    });
    await createEvent({
      eventType: 'login_failed',
      outcome: 'failure',
      targetType: null,
      actorId: null,
    });

    const byType = await request(app)
      .get('/api/v1/audit/events?eventType=estate.created')
      .set('Cookie', cookie);
    expect(byType.status).toBe(200);
    expect(byType.body.data.events.map((e: { id: string }) => e.id)).toEqual([first]);

    const byFailure = await request(app)
      .get('/api/v1/audit/events?outcome=failure&targetType=property')
      .set('Cookie', cookie);
    expect(byFailure.body.data.events.map((e: { id: string }) => e.id)).toEqual([second]);

    const byActor = await request(app)
      .get(`/api/v1/audit/events?actorId=${admin.id}`)
      .set('Cookie', cookie);
    expect(byActor.body.data.events.map((e: { id: string }) => e.id)).toEqual(
      expect.arrayContaining([first, second]),
    );

    const byTarget = await request(app)
      .get('/api/v1/audit/events?targetType=settings')
      .set('Cookie', cookie);
    expect(byTarget.body.data.events.map((e: { id: string }) => e.id)).toContain(first);
    expect(byTarget.body.data.events.map((e: { id: string }) => e.id)).not.toContain(second);
  });

  it('applies inclusive from/to bounds', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD);

    const early = await createEvent({
      eventType: 'estate_created',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const middle = await createEvent({
      eventType: 'estate_created',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const late = await createEvent({
      eventType: 'estate_created',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    const response = await request(app)
      .get(
        '/api/v1/audit/events?targetType=settings&from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z',
      )
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data.events.map((e: { id: string }) => e.id)).toEqual([middle, early]);
    expect(response.body.data.events.map((e: { id: string }) => e.id)).not.toContain(late);
  });

  it('pages with an id cursor and returns null when exhausted', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD);

    const first = await createEvent({ createdAt: new Date('2026-04-01T00:00:00.000Z') });
    const second = await createEvent({ createdAt: new Date('2026-04-02T00:00:00.000Z') });
    const third = await createEvent({ createdAt: new Date('2026-04-03T00:00:00.000Z') });

    const pageOne = await request(app)
      .get('/api/v1/audit/events?targetType=settings&limit=2')
      .set('Cookie', cookie);
    expect(pageOne.status).toBe(200);
    expect(pageOne.body.data.events.map((e: { id: string }) => e.id)).toEqual([third, second]);
    expect(pageOne.body.data.nextCursor).toBe(second);

    const pageTwo = await request(app)
      .get(`/api/v1/audit/events?targetType=settings&limit=2&after=${pageOne.body.data.nextCursor}`)
      .set('Cookie', cookie);
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body.data.events.map((e: { id: string }) => e.id)).toEqual([first]);
    expect(pageTwo.body.data.nextCursor).toBeNull();
  });

  it('does not leak another organization’s events', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD);

    const mine = await createEvent();
    const theirs = await createEvent({ organization: otherOrganizationId });

    const response = await request(app)
      .get('/api/v1/audit/events?targetType=settings')
      .set('Cookie', cookie);
    const ids = response.body.data.events.map((e: { id: string }) => e.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it('rejects malformed filters with 400', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD);

    const badEvent = await request(app)
      .get('/api/v1/audit/events?eventType=not.an.event')
      .set('Cookie', cookie);
    expect(badEvent.status).toBe(400);

    const badActor = await request(app)
      .get('/api/v1/audit/events?actorId=not-a-uuid')
      .set('Cookie', cookie);
    expect(badActor.status).toBe(400);

    const badDate = await request(app)
      .get('/api/v1/audit/events?from=not-a-date')
      .set('Cookie', cookie);
    expect(badDate.status).toBe(400);

    const reversed = await request(app)
      .get('/api/v1/audit/events?from=2026-05-02T00:00:00.000Z&to=2026-05-01T00:00:00.000Z')
      .set('Cookie', cookie);
    expect(reversed.status).toBe(400);

    const badLimit = await request(app).get('/api/v1/audit/events?limit=51').set('Cookie', cookie);
    expect(badLimit.status).toBe(400);

    const badCursor = await request(app)
      .get('/api/v1/audit/events?after=not-a-uuid')
      .set('Cookie', cookie);
    expect(badCursor.status).toBe(400);
  });

  it('exports filtered CSV with download headers and an audit trail', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD);

    await createEvent({
      eventType: 'estate_created',
      requestId: "=cmd|' /C calc'!A0",
    });
    await createEvent({ eventType: 'property_created', targetType: 'property' });

    const response = await request(app)
      .get('/api/v1/audit/export?targetType=settings')
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.headers['content-disposition']).toMatch(
      /attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.text).toContain('"estate.created"');
    expect(response.text).not.toContain('"property.created"');
    // The crafted request id is neutralized: apostrophe prefix, then quotes.
    expect(response.text).toContain(`"'=cmd|' /C calc'!A0"`);

    const trail = await prisma.auditEvent.findFirst({
      where: { organizationId, eventType: 'audit_exported' },
      orderBy: { createdAt: 'desc' },
    });
    expect(trail).not.toBeNull();
    expect(trail?.targetType).toBe('organization');
    expect(trail?.targetId).toBe(organizationId);
    expect(trail?.metadata).toMatchObject({
      rowCount: expect.any(Number),
      capped: false,
    });
  });

  it('caps an export and records that the cap was hit', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD);

    await createEvent();
    await createEvent();

    const response = await request(cappedApp)
      .get('/api/v1/audit/export?targetType=settings')
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    // Header + one capped row, with a trailing CRLF.
    expect(response.text.split('\r\n').filter(Boolean)).toHaveLength(2);

    const trail = await prisma.auditEvent.findFirst({
      where: { organizationId, eventType: 'audit_exported' },
      orderBy: { createdAt: 'desc' },
    });
    expect(trail?.metadata).toMatchObject({ rowCount: 1, capped: true });
  });
});
