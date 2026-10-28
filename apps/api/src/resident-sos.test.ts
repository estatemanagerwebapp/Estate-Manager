/**
 * Resident emergency / SOS routes (S9) integration test.
 *
 * Exercises the full S9 surface end to end:
 *
 *   - `POST /resident/sos` — raise an alert against the resident's own
 *     property; audits `resident.sos_raised`.
 *   - `GET /resident/sos` — the resident's own alert history.
 *   - the event is always linked to the session user and their property —
 *     never to an id in the request body.
 *   - validation: a note longer than 500 characters is rejected (400).
 *   - self-scoping: one resident never sees another's alerts.
 *   - unauthenticated callers get 401.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from './application.js';
import { getPrismaClient, disconnectPrisma } from './lib/prisma.js';
import { hashPassword } from './lib/password.js';
import { PrismaUserRepository } from './modules/auth/user-repository.js';
import { PrismaSessionRepository } from './modules/auth/session-repository.js';
import { PrismaPasswordResetRepository } from './modules/auth/reset-token-repository.js';
import { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';
import { MockEmailAdapter } from './modules/auth/email-adapter.js';
import { AuthService } from './modules/auth/auth.service.js';
import { UserService } from './modules/auth/user.service.js';
import { PrismaResidentOnboardingRepository } from './modules/auth/resident-onboarding-repository.js';
import { ResidentOnboardingService } from './modules/auth/resident-onboarding.service.js';
import { PrismaSosRepository } from './modules/resident/sos-repository.js';
import { ResidentSosService } from './modules/resident/sos.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let propertyId = '';
let residentCookie = '';
let residentUserId = '';
let secondResidentCookie = '';
const ADMIN_PASSWORD = 'Sup3rSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

/** Run the resident onboarding flow end to end and return a session cookie. */
async function onboardResident(
  firstName: string,
  phone: string,
): Promise<{ cookie: string; userId: string }> {
  const registered = await request(app)
    .post('/api/v1/onboard/residents')
    .set('Cookie', adminCookie)
    .send({
      firstName,
      email: `sos_${firstName.toLowerCase()}_${uniqueSuffix()}@example.com`,
      phone,
      propertyId,
    });
  expect(registered.status).toBe(201);
  const residentEmail = registered.body.data.resident.email as string;
  const residentId = registered.body.data.resident.id as string;
  const code = registered.body.data.onboardingCode as string;

  const saved = await request(app)
    .patch(`/api/v1/onboard/by-code/${code}`)
    .send({
      gender: 'FEMALE',
      maritalStatus: 'SINGLE',
      nextOfKinName: `Kin ${firstName}`,
      nextOfKinPhone: '+2348009990000',
      nextOfKinEmail: `kin_${firstName.toLowerCase()}@example.com`,
      idType: 'NATIONAL_ID',
    });
  expect(saved.status).toBe(200);

  await prisma.residentOnboarding.update({
    where: { id: residentId },
    data: { idDocumentUrl: `/media/${organizationId}/sos-doc-${firstName}` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: `SOS-${firstName}-001` });
  expect(paid.status).toBe(200);

  const login = await request(app).post('/api/v1/auth/login').send({
    email: residentEmail,
    password: paid.body.data.demoPassword,
  });
  expect(login.status).toBe(200);

  return {
    cookie: cookieFrom(login),
    userId: paid.body.data.user.id as string,
  };
}

beforeAll(async () => {
  prisma = getPrismaClient();

  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const resetTokens = new PrismaPasswordResetRepository(prisma);
  const audit = new PrismaAuditRepository(prisma);
  const permissions = new PermissionResolver(async () => []);
  const email = new MockEmailAdapter();

  const org = await prisma.organization.create({
    data: { slug: `sos_test_${uniqueSuffix()}`, name: 'SOS Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `sos_admin_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });

  const estates = new PrismaEstateRepository(prisma);
  const properties = new PrismaPropertyRepository(prisma);
  const estate = await estates.create({
    organizationId,
    name: 'SOS Estate',
    slug: `sos_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    kind: 'LAND',
    identifier: `SOS-${uniqueSuffix()}`,
    streetName: 'Test Street',
    plotNumber: '1',
    plotName: 'Test plot',
    name: null,
  });
  propertyId = property.id;

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

  const drafts = new PrismaResidentOnboardingRepository(prisma);
  const residentOnboarding = new ResidentOnboardingService(
    users,
    drafts,
    audit,
    permissions,
    async () => loadBootstrapConfig(),
    async (orgId, id) => {
      const record = await properties.findById(orgId, id);
      if (!record) return null;
      const parent = record.estateId ? await estates.findById(orgId, record.estateId) : null;
      return {
        identifier: record.identifier,
        name: null,
        estate: {
          name: parent?.name ?? '—',
          slug: parent?.slug ?? '',
        },
      };
    },
  );

  const residentSosService = new ResidentSosService({
    sos: new PrismaSosRepository(prisma),
    audit,
    loadPropertyId: async (_organizationId, userId) => {
      const draft = await drafts.findByUser(userId);
      return draft?.propertyId ?? null;
    },
  });

  app = createApp({
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
    onboarding: {
      residentOnboarding,
      sessions,
      permissions,
      organizationId,
      rateLimits: { guestPerWindow: 1000 },
    },
    resident: {
      sessions,
      permissions,
      organizationId,
      sos: residentSosService,
    },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  const first = await onboardResident('Ada', '+2348006660001');
  residentCookie = first.cookie;
  residentUserId = first.userId;

  const second = await onboardResident('Bode', '+2348006660002');
  secondResidentCookie = second.cookie;
});

afterAll(async () => {
  await prisma.sosEvent.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

describe('resident emergency / SOS (S9)', () => {
  it('rejects the SOS routes without a session', async () => {
    expect((await request(app).get('/api/v1/resident/sos')).status).toBe(401);
    expect((await request(app).post('/api/v1/resident/sos').send({ note: 'Help' })).status).toBe(
      401,
    );
  });

  it('raises an SOS against the resident property and audits it', async () => {
    const response = await request(app)
      .post('/api/v1/resident/sos')
      .set('Cookie', residentCookie)
      .send({ note: 'There is smoke on the third floor.' });
    expect(response.status).toBe(201);
    expect(response.body.data.ok).toBe(true);

    const event = response.body.data.event;
    expect(event.id).toBeDefined();
    expect(event.status).toBe('RAISED');
    expect(event.note).toBe('There is smoke on the third floor.');
    expect(event.raisedAt).toBeTruthy();
    expect(event.acknowledgedAt).toBeNull();
    expect(event.resolvedAt).toBeNull();

    // The row is linked to the session user and their property.
    const row = await prisma.sosEvent.findUnique({ where: { id: event.id } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(residentUserId);
    expect(row!.propertyId).toBe(propertyId);
    expect(row!.status).toBe('RAISED');

    // The audit event was written.
    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_sos_raised' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('lists the resident own alert history', async () => {
    const response = await request(app).get('/api/v1/resident/sos').set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { events } = response.body.data;
    expect(events.length).toBe(1);
    expect(events[0].note).toBe('There is smoke on the third floor.');
    expect(events[0].status).toBe('RAISED');
  });

  it('raises an alert without a note', async () => {
    const response = await request(app)
      .post('/api/v1/resident/sos')
      .set('Cookie', residentCookie)
      .send({});
    expect(response.status).toBe(201);
    expect(response.body.data.event.note).toBeNull();
  });

  it('rejects an over-long note', async () => {
    const response = await request(app)
      .post('/api/v1/resident/sos')
      .set('Cookie', residentCookie)
      .send({ note: 'x'.repeat(501) });
    expect(response.status).toBe(400);
  });

  it('keeps each resident alerts independent', async () => {
    const created = await request(app)
      .post('/api/v1/resident/sos')
      .set('Cookie', secondResidentCookie)
      .send({ note: 'Fallen gate.' });
    expect(created.status).toBe(201);

    const first = await request(app).get('/api/v1/resident/sos').set('Cookie', residentCookie);
    expect(first.body.data.events.length).toBe(2);
    expect(
      first.body.data.events.some(
        (event: { note: string | null }) => event.note === 'Fallen gate.',
      ),
    ).toBe(false);

    const second = await request(app)
      .get('/api/v1/resident/sos')
      .set('Cookie', secondResidentCookie);
    expect(second.body.data.events.length).toBe(1);
    expect(second.body.data.events[0].note).toBe('Fallen gate.');
  });
});
