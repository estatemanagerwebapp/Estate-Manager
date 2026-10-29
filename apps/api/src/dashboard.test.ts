/**
 * Dashboard route integration tests.
 *
 * Same discipline as the auth-flow suite: real Prisma repositories, the real
 * Express router, a disposable test database and one dedicated organization
 * per run. The KPI endpoint is exercised through two real accounts — a
 * SUPER_ADMIN (every counter populated) and a GUARD (most counters hidden) —
 * so the null-vs-zero contract is asserted end to end.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createApp, type Express } from './application.js';
import { AuthService } from './modules/auth/auth.service.js';
import { UserService } from './modules/auth/user.service.js';
import { PrismaUserRepository } from './modules/auth/user-repository.js';
import { PrismaSessionRepository } from './modules/auth/session-repository.js';
import { PrismaPasswordResetRepository } from './modules/auth/reset-token-repository.js';
import { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { PrismaResidentOnboardingRepository } from './modules/auth/resident-onboarding-repository.js';
import { PrismaFinanceRepository } from './modules/resident/finance-repository.js';
import { PrismaComplaintRepository } from './modules/resident/complaints-repository.js';
import { PrismaSosRepository } from './modules/resident/sos-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';
import { MockEmailAdapter } from './modules/auth/email-adapter.js';
import { DEFAULT_MODULE_FLAGS, type ModuleFlags } from '@silverstone/shared';
import { getPrismaClient, disconnectPrisma } from './lib/prisma.js';
import { hashPassword } from './lib/password.js';

let prisma: PrismaClient;
let app: Express;
let users: PrismaUserRepository;
let sessions: PrismaSessionRepository;
let resetTokens: PrismaPasswordResetRepository;
let audit: PrismaAuditRepository;
let estates: PrismaEstateRepository;
let properties: PrismaPropertyRepository;
let residentOnboarding: PrismaResidentOnboardingRepository;
let finance: PrismaFinanceRepository;
let complaints: PrismaComplaintRepository;
let sos: PrismaSosRepository;
let email: MockEmailAdapter;
let organizationId = '';

const SUPER_ADMIN_PASSWORD = 'Sup3rSecretXyz';
const GUARD_PASSWORD = 'Gu3rdSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildApp(loadModules?: () => Promise<ModuleFlags>): Express {
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
    dashboard: {
      sessions,
      permissions,
      audit,
      users,
      residentOnboarding,
      estates,
      properties,
      finance,
      complaints,
      sos,
      organizationId,
      ...(loadModules ? { loadModules } : {}),
    },
  });
}

async function createTestUser(input: {
  email?: string;
  password?: string;
  role?: string;
  status?: string;
}): Promise<{ id: string; email: string; role: string; status: string }> {
  const suffix = uniqueSuffix();
  const email = input.email ?? `${input.role?.toLowerCase() ?? 'user'}_${suffix}@example.com`;
  const password = input.password ?? SUPER_ADMIN_PASSWORD;
  const role = input.role ?? 'GUARD';
  const status = input.status ?? 'ACTIVE';
  const row = await prisma.user.create({
    data: {
      organizationId,
      email,
      passwordHash: await hashPassword(password),
      role,
      status,
      lastPasswordChangedAt: new Date(),
    },
  });
  return { id: row.id, email, role, status };
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

beforeAll(async () => {
  prisma = getPrismaClient();
  email = new MockEmailAdapter();
  users = new PrismaUserRepository(prisma);
  sessions = new PrismaSessionRepository(prisma);
  resetTokens = new PrismaPasswordResetRepository(prisma);
  audit = new PrismaAuditRepository(prisma);
  estates = new PrismaEstateRepository(prisma);
  properties = new PrismaPropertyRepository(prisma);
  residentOnboarding = new PrismaResidentOnboardingRepository(prisma);
  finance = new PrismaFinanceRepository(prisma);
  complaints = new PrismaComplaintRepository(prisma);
  sos = new PrismaSosRepository(prisma);

  const org = await prisma.organization.create({
    data: { slug: `dash_test_${uniqueSuffix()}`, name: 'Dashboard Test' },
  });
  organizationId = org.id;

  app = buildApp();
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

/**
 * Seeding helper: one estate with two properties (one active, one archived)
 * and one resident onboarding draft. This is the "full data" state the
 * SUPER_ADMIN assertions expect; the GUARD assertions are the same state read
 * through a restricted role, so no second seed is needed.
 */
async function seedData(): Promise<void> {
  const estate = await prisma.estate.create({
    data: { organizationId, slug: `dash_${uniqueSuffix()}`, name: 'Dash Estate' },
  });
  const activeProperty = await prisma.property.create({
    data: {
      estateId: estate.id,
      organizationId,
      identifier: 'BLK-A-1',
      kind: 'LAND',
      streetName: 'Test Street',
      plotNumber: '1',
      plotName: 'Test plot',
    },
  });
  await prisma.property.create({
    data: {
      estateId: estate.id,
      organizationId,
      identifier: 'BLK-A-2',
      kind: 'LAND',
      streetName: 'Test Street',
      plotNumber: '1',
      plotName: 'Test plot',
      status: 'ARCHIVED',
    },
  });
  await prisma.residentOnboarding.create({
    data: {
      organizationId,
      propertyId: activeProperty.id,
      codeHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      onboardingCode: 'ABC2345678',
      firstName: 'Seed',
      email: null,
      phone: null,
    },
  });

  const resident = await prisma.user.create({
    data: {
      organizationId,
      email: `seed_resident_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword('Res1dentSecretXyz'),
      role: 'RESIDENT',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  await prisma.invoice.create({
    data: {
      organizationId,
      userId: resident.id,
      propertyId: activeProperty.id,
      period: '2026-11',
      amountKobo: 5_000_000,
      status: 'UNPAID',
      dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });
  await prisma.complaint.create({
    data: {
      organizationId,
      userId: resident.id,
      propertyId: activeProperty.id,
      category: 'security',
      subject: 'Gate light out',
      description: 'The gate light has been out for two nights.',
      status: 'OPEN',
    },
  });
  await prisma.sosEvent.create({
    data: {
      organizationId,
      userId: resident.id,
      propertyId: activeProperty.id,
      status: 'RAISED',
      note: 'Test alert',
    },
  });
}

describe('dashboard KPIs', () => {
  it('returns 401 when unauthenticated', async () => {
    const response = await request(app).get('/api/v1/dashboard/kpis');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('SUPER_ADMIN sees every counter populated', async () => {
    await seedData();
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: SUPER_ADMIN_PASSWORD });
    const cookie = cookieFrom(login);
    expect(login.status).toBe(200);

    const response = await request(app).get('/api/v1/dashboard/kpis').set('Cookie', cookie);
    expect(response.status).toBe(200);

    const kpis = response.body.data.kpis;
    expect(kpis.estates).toBe(1);
    expect(kpis.totalProperties).toBe(2);
    expect(kpis.activeProperties).toBe(1);
    expect(kpis.users).toBe(2); // the admin + the seeded resident
    expect(kpis.residentDrafts).toBe(1);
    expect(kpis.residents).toBe(1);
    expect(kpis.pendingInvitations).toBe(1);
    expect(kpis.outstandingKobo).toBe(5_000_000);
    expect(kpis.outstandingInvoices).toBe(1);
    expect(kpis.overdueInvoices).toBe(1);
    expect(kpis.activeSos).toBe(1);
    expect(kpis.openComplaints).toBe(1);
    expect(kpis.auditEventsLast30Days).toBeGreaterThanOrEqual(1); // login.succeeded

    const attention = response.body.data.attention;
    expect(attention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'residents', count: 1 }),
        expect.objectContaining({ key: 'billing', count: 1 }),
        expect.objectContaining({ key: 'complaints', count: 1 }),
        expect.objectContaining({ key: 'sos', count: 1 }),
      ]),
    );
  });

  it('GUARD sees only the counters its role permits (null, not zero)', async () => {
    const guard = await createTestUser({ role: 'GUARD', password: GUARD_PASSWORD });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: guard.email, password: GUARD_PASSWORD });
    expect(login.status).toBe(200);
    const cookie = cookieFrom(login);

    const response = await request(app).get('/api/v1/dashboard/kpis').set('Cookie', cookie);
    expect(response.status).toBe(200);

    const kpis = response.body.data.kpis;
    // GUARD's baseline holds gate/resident/sos read but none of the
    // estate/property/billing/user/audit permissions the other KPIs need.
    expect(kpis.estates).toBeNull();
    expect(kpis.totalProperties).toBeNull();
    expect(kpis.activeProperties).toBeNull();
    expect(kpis.users).toBeNull();
    expect(kpis.residentDrafts).toBeNull();
    expect(kpis.residents).toBeNull();
    expect(kpis.pendingInvitations).toBeNull();
    expect(kpis.outstandingKobo).toBeNull();
    expect(kpis.outstandingInvoices).toBeNull();
    expect(kpis.overdueInvoices).toBeNull();
    expect(kpis.activeSos).toBe(1);
    expect(kpis.openComplaints).toBeNull();
    expect(kpis.auditEventsLast30Days).toBeNull();
    expect(response.body.data.attention).toEqual([
      expect.objectContaining({ key: 'sos', count: 1 }),
    ]);
  });

  it('AUDITOR sees the read-only counters but not user/resident management', async () => {
    const auditor = await createTestUser({ role: 'AUDITOR', password: SUPER_ADMIN_PASSWORD });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: auditor.email, password: SUPER_ADMIN_PASSWORD });
    const cookie = cookieFrom(login);

    const response = await request(app).get('/api/v1/dashboard/kpis').set('Cookie', cookie);
    expect(response.status).toBe(200);

    const kpis = response.body.data.kpis;
    // AUDITOR's baseline includes estate.read, property.read, audit.read but
    // not user.manage / resident.manage.
    expect(kpis.estates).toBe(1);
    expect(kpis.totalProperties).toBe(2);
    expect(kpis.auditEventsLast30Days).toBeGreaterThanOrEqual(1);
    expect(kpis.users).toBeNull();
    expect(kpis.residentDrafts).toBeNull();
    expect(kpis.residents).toBeNull();
    expect(kpis.pendingInvitations).toBeNull();
    // AUDITOR holds billing/sos/complaint read, so those counters are visible.
    expect(kpis.outstandingKobo).toBe(5_000_000);
    expect(kpis.outstandingInvoices).toBe(1);
    expect(kpis.overdueInvoices).toBe(1);
    expect(kpis.activeSos).toBe(1);
    expect(kpis.openComplaints).toBe(1);
    const keys = response.body.data.attention.map((item: { key: string }) => item.key);
    expect(keys).toEqual(expect.arrayContaining(['billing', 'complaints', 'sos']));
    expect(keys).not.toContain('residents');
  });

  it('hides disabled modules even when the role holds the read permission', async () => {
    const disabledApp = buildApp(async () => ({
      ...DEFAULT_MODULE_FLAGS,
      residents: false,
      billing: false,
    }));
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const login = await request(disabledApp)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: SUPER_ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    const cookie = cookieFrom(login);

    const response = await request(disabledApp).get('/api/v1/dashboard/kpis').set('Cookie', cookie);
    expect(response.status).toBe(200);
    const kpis = response.body.data.kpis;
    expect(kpis.residents).toBeNull();
    expect(kpis.pendingInvitations).toBeNull();
    expect(kpis.outstandingKobo).toBeNull();
    expect(kpis.outstandingInvoices).toBeNull();
    expect(kpis.overdueInvoices).toBeNull();
    // SOS and complaints have no module flag; they remain permission-gated.
    expect(kpis.activeSos).toBe(1);
    expect(kpis.openComplaints).toBe(1);
    const keys = response.body.data.attention.map((item: { key: string }) => item.key);
    expect(keys).not.toContain('residents');
    expect(keys).not.toContain('billing');
  });
});

describe('dashboard activity', () => {
  it('returns 401 when unauthenticated', async () => {
    const response = await request(app).get('/api/v1/dashboard/activity');
    expect(response.status).toBe(401);
  });

  it('SUPER_ADMIN can read the feed; GUARD is 403', async () => {
    // Seed a couple of audited mutations so the feed is non-trivial.
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: SUPER_ADMIN_PASSWORD });
    const adminCookie = cookieFrom(adminLogin);

    const guard = await createTestUser({ role: 'GUARD', password: GUARD_PASSWORD });
    const guardLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: guard.email, password: GUARD_PASSWORD });
    const guardCookie = cookieFrom(guardLogin);

    const adminFeed = await request(app)
      .get('/api/v1/dashboard/activity?limit=5')
      .set('Cookie', adminCookie);
    expect(adminFeed.status).toBe(200);
    const events = adminFeed.body.data.events;
    // The org has a handful of login events by now (admin + guard logins),
    // so the capped feed is the whole tail.
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.length).toBeLessThanOrEqual(5);
    // Most-recent-first: the newest event comes first.
    expect(events[0].eventType).toBe('login.succeeded');
    expect(new Date(events[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(events[events.length - 1].createdAt).getTime(),
    );
    // A cursor is returned for the next page, or null when the feed is exhausted.
    expect(
      adminFeed.body.data.nextCursor === null || typeof adminFeed.body.data.nextCursor === 'string',
    ).toBe(true);

    const guardFeed = await request(app)
      .get('/api/v1/dashboard/activity')
      .set('Cookie', guardCookie);
    expect(guardFeed.status).toBe(403);
    expect(guardFeed.body.error.code).toBe('FORBIDDEN');
  });

  it('clamps the limit to the documented [1, 50] window', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: SUPER_ADMIN_PASSWORD });
    const cookie = cookieFrom(login);

    const oversized = await request(app)
      .get('/api/v1/dashboard/activity?limit=999')
      .set('Cookie', cookie);
    expect(oversized.status).toBe(200);
    expect(oversized.body.data.limit).toBe(50);

    const zero = await request(app).get('/api/v1/dashboard/activity?limit=0').set('Cookie', cookie);
    expect(zero.status).toBe(200);
    expect(zero.body.data.limit).toBe(1);
  });

  it('resumes after the last returned event without skipping the look-ahead row', async () => {
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: SUPER_ADMIN_PASSWORD });
    const cookie = cookieFrom(login);

    // There are at least three login audit events by now; use a larger read
    // as the reference order, then check that limit=2 + cursor lands exactly
    // on the third event rather than skipping to the fourth.
    const reference = await request(app)
      .get('/api/v1/dashboard/activity?limit=5')
      .set('Cookie', cookie);
    expect(reference.status).toBe(200);
    const referenceIds = reference.body.data.events.map((event: { id: string }) => event.id);
    expect(referenceIds.length).toBeGreaterThanOrEqual(3);

    const firstPage = await request(app)
      .get('/api/v1/dashboard/activity?limit=2')
      .set('Cookie', cookie);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.events.map((event: { id: string }) => event.id)).toEqual(
      referenceIds.slice(0, 2),
    );
    expect(firstPage.body.data.nextCursor).toBe(referenceIds[1]);

    const secondPage = await request(app)
      .get(`/api/v1/dashboard/activity?limit=2&after=${firstPage.body.data.nextCursor}`)
      .set('Cookie', cookie);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.events[0].id).toBe(referenceIds[2]);
  });
});
