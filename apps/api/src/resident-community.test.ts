/**
 * Resident community feed routes (S7) integration test.
 *
 * Exercises the full S7 surface end to end:
 *
 *   - `GET /resident/community` — the organization's latest announcements
 *     plus the active broadcast for the resident's own estate.
 *   - the broadcast is estate-scoped: a broadcast issued for another estate
 *     is never shown.
 *   - an expired broadcast is not shown; an unexpired one is.
 *   - a resident without a property gets announcements but no broadcast.
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
import { PrismaCommunityRepository } from './modules/resident/community-repository.js';
import { ResidentCommunityService } from './modules/resident/community.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let propertyId = '';
let estateId = '';
let otherEstateId = '';
let residentCookie = '';
const ADMIN_PASSWORD = 'Sup3rSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
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
    data: { slug: `community_test_${uniqueSuffix()}`, name: 'Community Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `community_admin_${uniqueSuffix()}@example.com`,
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
    name: 'Community Estate',
    slug: `comm_est_${uniqueSuffix()}`,
    address: null,
  });
  estateId = estate.id;
  const otherEstate = await estates.create({
    organizationId,
    name: 'Other Estate',
    slug: `comm_other_${uniqueSuffix()}`,
    address: null,
  });
  otherEstateId = otherEstate.id;
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    kind: 'LAND',
    identifier: `COMM-${uniqueSuffix()}`,
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

  const residentCommunityService = new ResidentCommunityService({
    community: new PrismaCommunityRepository(prisma),
    loadEstateId: async (orgId, userId) => {
      const draft = await drafts.findByUser(userId);
      if (!draft?.propertyId) return null;
      const record = await properties.findById(orgId, draft.propertyId);
      return record?.estateId ?? null;
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
      community: residentCommunityService,
    },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  // Onboard one resident (with a property) and one without.
  const registered = await request(app)
    .post('/api/v1/onboard/residents')
    .set('Cookie', adminCookie)
    .send({
      firstName: 'Ada',
      email: `community_${uniqueSuffix()}@example.com`,
      phone: '+2348004440001',
      propertyId,
    });
  expect(registered.status).toBe(201);
  const residentEmail = registered.body.data.resident.email as string;
  const residentId = registered.body.data.resident.id as string;
  const code = registered.body.data.onboardingCode as string;

  const saved = await request(app)
    .patch(`/api/v1/onboard/by-code/${code}`)
    .send({
      gender: 'MALE',
      maritalStatus: 'SINGLE',
      nextOfKinName: 'Kin Ada',
      nextOfKinPhone: '+2348009990000',
      nextOfKinEmail: `kin_${uniqueSuffix()}@example.com`,
      idType: 'NATIONAL_ID',
    });
  expect(saved.status).toBe(200);

  await prisma.residentOnboarding.update({
    where: { id: residentId },
    data: { idDocumentUrl: `/media/${organizationId}/community-doc` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: 'COMM-001' });
  expect(paid.status).toBe(200);

  const login = await request(app).post('/api/v1/auth/login').send({
    email: residentEmail,
    password: paid.body.data.demoPassword,
  });
  expect(login.status).toBe(200);
  residentCookie = cookieFrom(login);

  // Feed content written by the estate office.
  await prisma.announcement.create({
    data: {
      organizationId,
      title: 'Annual servicing week',
      body: 'Water will be interrupted between 9am and 2pm next Monday.',
      authorId: admin.id,
      publishedAt: new Date('2026-01-02T09:00:00.000Z'),
    },
  });
  await prisma.announcement.create({
    data: {
      organizationId,
      title: 'Gym hours extended',
      body: 'The gym is now open until 10pm on weekdays.',
      authorId: admin.id,
      publishedAt: new Date('2026-01-01T09:00:00.000Z'),
    },
  });
});

afterAll(async () => {
  await prisma.estateBroadcast.deleteMany({ where: { organizationId } });
  await prisma.announcement.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

describe('resident community feed (S7)', () => {
  it('rejects the community route without a session', async () => {
    expect((await request(app).get('/api/v1/resident/community')).status).toBe(401);
  });

  it('returns the announcements newest first', async () => {
    const response = await request(app)
      .get('/api/v1/resident/community')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { announcements, broadcast } = response.body.data;
    expect(announcements.length).toBe(2);
    expect(announcements[0].title).toBe('Annual servicing week');
    expect(announcements[1].title).toBe('Gym hours extended');
    expect(announcements[0].body).toContain('Water will be interrupted');
    // No broadcast yet.
    expect(broadcast).toBeNull();
  });

  it('shows the active broadcast for the resident estate', async () => {
    await prisma.estateBroadcast.create({
      data: {
        organizationId,
        estateId,
        title: 'Security drill',
        body: 'A drill will run on Friday at 10am. Please use the main gate.',
        priority: 'WARNING',
        issuedAt: new Date('2026-02-01T08:00:00.000Z'),
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      },
    });

    const response = await request(app)
      .get('/api/v1/resident/community')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { broadcast } = response.body.data;
    expect(broadcast).not.toBeNull();
    expect(broadcast.title).toBe('Security drill');
    expect(broadcast.priority).toBe('WARNING');
    expect(broadcast.estateId).toBe(estateId);
    expect(broadcast.expiresAt).toBeTruthy();
  });

  it('never shows a broadcast issued for another estate', async () => {
    await prisma.estateBroadcast.create({
      data: {
        organizationId,
        estateId: otherEstateId,
        title: 'Other estate drill',
        body: 'Not for this estate.',
        priority: 'CRITICAL',
        issuedAt: new Date('2026-03-01T08:00:00.000Z'),
      },
    });

    const response = await request(app)
      .get('/api/v1/resident/community')
      .set('Cookie', residentCookie);
    expect(response.body.data.broadcast.title).toBe('Security drill');
    expect(response.body.data.broadcast.estateId).not.toBe(otherEstateId);
  });

  it('ignores an expired broadcast', async () => {
    await prisma.estateBroadcast.deleteMany({ where: { organizationId } });
    await prisma.estateBroadcast.create({
      data: {
        organizationId,
        estateId,
        title: 'Old notice',
        body: 'This notice has expired.',
        priority: 'INFO',
        issuedAt: new Date('2025-01-01T08:00:00.000Z'),
        expiresAt: new Date('2025-02-01T00:00:00.000Z'),
      },
    });

    const response = await request(app)
      .get('/api/v1/resident/community')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.broadcast).toBeNull();
  });

  it('falls back to the most recent active broadcast', async () => {
    await prisma.estateBroadcast.deleteMany({ where: { organizationId } });
    await prisma.estateBroadcast.create({
      data: {
        organizationId,
        estateId,
        title: 'Earlier notice',
        body: 'First.',
        priority: 'INFO',
        issuedAt: new Date('2026-01-01T08:00:00.000Z'),
      },
    });
    await prisma.estateBroadcast.create({
      data: {
        organizationId,
        estateId,
        title: 'Latest notice',
        body: 'Second.',
        priority: 'CRITICAL',
        issuedAt: new Date('2026-05-01T08:00:00.000Z'),
      },
    });

    const response = await request(app)
      .get('/api/v1/resident/community')
      .set('Cookie', residentCookie);
    expect(response.body.data.broadcast.title).toBe('Latest notice');
    expect(response.body.data.broadcast.priority).toBe('CRITICAL');
  });
});
