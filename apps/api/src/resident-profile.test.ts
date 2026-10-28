/**
 * Resident profile routes (S1) integration test.
 *
 * Exercises `GET /resident/profile` and `PATCH /resident/profile` end to
 * end: a resident is registered, completes onboarding (account created),
 * logs in with the demo password, and then reads + updates their own
 * profile. Asserts:
 *
 *   - the profile view returns user + onboarding draft + assigned property
 *   - a PATCH writes phone (user row) and next-of-kin / ID type (draft row)
 *   - the update is audited as `resident.profile_updated`
 *   - unauthenticated callers get 401
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
import { ResidentProfileService } from './modules/resident/profile.service.js';
import { ResidentPropertiesService } from './modules/resident/properties.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let propertyId = '';
let residentCookie = '';
const ADMIN_EMAIL = 'profile_admin@example.com';
const ADMIN_PASSWORD = 'Sup3rSecretXyz';
const RESIDENT_EMAIL = 'profile_resident@example.com';

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
    data: { slug: `profile_test_${uniqueSuffix()}`, name: 'Profile Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `${ADMIN_EMAIL.split('@')[0]}_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });

  // Estate + property to assign the resident to.
  const estates = new PrismaEstateRepository(prisma);
  const properties = new PrismaPropertyRepository(prisma);
  const estate = await estates.create({
    organizationId,
    name: 'Profile Estate',
    slug: `pf_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    kind: 'LAND',
    identifier: `PF-${uniqueSuffix()}`,
    streetName: 'Test Street',
    plotNumber: '1',
    plotName: 'Test plot',
    name: null,
  });
  propertyId = property.id;

  // Fake property config snapshot (asset types + address component labels),
  // matching the bootstrap shape the services consume.

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
      profile: new ResidentProfileService({
        users,
        drafts,
        audit,
        loadProperty: async (orgId, id) => {
          const detail = await (async () => {
            const record = await properties.findById(orgId, id);
            if (!record) return null;
            const parent = record.estateId ? await estates.findById(orgId, record.estateId) : null;
            return {
              identifier: record.identifier,
              estate: { name: parent?.name ?? '—', slug: parent?.slug ?? '' },
            };
          })();
          return detail;
        },
      }),
      properties: new ResidentPropertiesService({
        drafts,
        properties,
        estates,
      }),
    },
  });

  // Admin session.
  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  // Full onboarding flow: register → autosave → mark paid → complete.
  const registered = await request(app)
    .post('/api/v1/onboard/residents')
    .set('Cookie', adminCookie)
    .send({
      firstName: 'Profile',
      email: `${RESIDENT_EMAIL.split('@')[0]}_${uniqueSuffix()}@example.com`,
      phone: '+2348000000000',
      propertyId,
    });
  expect(registered.status).toBe(201);
  const residentEmail = registered.body.data.resident.email as string;
  const residentId = registered.body.data.resident.id as string;
  const code = registered.body.data.onboardingCode as string;

  const saved = await request(app).patch(`/api/v1/onboard/by-code/${code}`).send({
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    nextOfKinName: 'Kin Original',
    nextOfKinPhone: '+2348000000001',
    nextOfKinEmail: 'original@example.com',
    idType: 'NATIONAL_ID',
  });
  expect(saved.status).toBe(200);

  await prisma.residentOnboarding.update({
    where: { id: residentId },
    data: { idDocumentUrl: `/media/${organizationId}/pf-doc` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: 'PF-CASH-001' });
  expect(paid.status).toBe(200);

  // All required fields were complete (the ID document was attached above),
  // so `markPaid` created the account immediately — the response carries the
  // demo password and there is no separate `complete` step to run.
  expect(paid.body.data.user).toBeDefined();
  expect(paid.body.data.demoPassword).toHaveLength(16);
  const demoPassword = paid.body.data.demoPassword as string;

  // Resident session (the demo password works until it is changed).
  const residentLogin = await request(app).post('/api/v1/auth/login').send({
    email: residentEmail,
    password: demoPassword,
  });
  expect(residentLogin.status).toBe(200);
  residentCookie = cookieFrom(residentLogin);
});

afterAll(async () => {
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

describe('resident profile (S1)', () => {
  it('rejects the profile routes without a session', async () => {
    expect((await request(app).get('/api/v1/resident/profile')).status).toBe(401);
    expect((await request(app).patch('/api/v1/resident/profile').send({})).status).toBe(401);
  });

  it("views the acting resident's own profile (user + draft + property)", async () => {
    const response = await request(app)
      .get('/api/v1/resident/profile')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const profile = response.body.data.profile;
    expect(profile.email).toBeDefined();
    expect(profile.phone).toBe('+2348000000000');
    expect(profile.gender).toBe('FEMALE');
    expect(profile.maritalStatus).toBe('SINGLE');
    expect(profile.nextOfKinName).toBe('Kin Original');
    expect(profile.nextOfKinPhone).toBe('+2348000000001');
    expect(profile.idType).toBe('NATIONAL_ID');
    expect(profile.idDocumentUrl).toBe(`/media/${organizationId}/pf-doc`);
    // The assigned property is joined in, and no property name is exposed.
    expect(profile.property).not.toBeNull();
    expect(profile.property.identifier).toMatch(/^PF-/);
    expect(profile.property.estate.name).toBe('Profile Estate');
  });

  it('updates phone (user row) + next-of-kin / id type (draft row) and audits it', async () => {
    const before = await prisma.auditEvent.count({
      where: { organizationId, eventType: 'resident_profile_updated' },
    });

    const response = await request(app)
      .patch('/api/v1/resident/profile')
      .set('Cookie', residentCookie)
      .send({
        phone: '+2348111222333',
        nextOfKinName: 'Kin Updated',
        nextOfKinPhone: '+2348110000111',
        nextOfKinEmail: 'updated@example.com',
        idType: 'PASSPORT',
      });
    expect(response.status).toBe(200);
    expect(response.body.data.ok).toBe(true);

    // The response reflects the persisted values.
    const profile = response.body.data.profile;
    expect(profile.phone).toBe('+2348111222333');
    expect(profile.nextOfKinName).toBe('Kin Updated');
    expect(profile.nextOfKinPhone).toBe('+2348110000111');
    expect(profile.nextOfKinEmail).toBe('updated@example.com');
    expect(profile.idType).toBe('PASSPORT');

    // The user row (phone) and the draft row (next-of-kin / id type) both
    // moved in the database.
    const updatedUser = await prisma.user.findFirst({
      where: { organizationId, role: 'RESIDENT' },
    });
    expect(updatedUser?.phone).toBe('+2348111222333');

    const draft = await prisma.residentOnboarding.findFirst({
      where: { organizationId, userId: updatedUser?.id },
    });
    expect(draft?.nextOfKinName).toBe('Kin Updated');
    expect(draft?.idType).toBe('PASSPORT');

    // A re-read through the API returns the same values.
    const recheck = await request(app)
      .get('/api/v1/resident/profile')
      .set('Cookie', residentCookie);
    expect(recheck.status).toBe(200);
    expect(recheck.body.data.profile.phone).toBe('+2348111222333');
    expect(recheck.body.data.profile.idType).toBe('PASSPORT');

    // The write was audited.
    const after = await prisma.auditEvent.count({
      where: { organizationId, eventType: 'resident_profile_updated' },
    });
    expect(after).toBe(before + 1);
  });

  it('re-reads cleanly after the audit event exists', async () => {
    const response = await request(app)
      .get('/api/v1/resident/profile')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.profile.email).toBeDefined();
  });
});

describe('resident properties (S2)', () => {
  it('rejects the properties route without a session', async () => {
    expect((await request(app).get('/api/v1/resident/properties')).status).toBe(401);
  });

  it("returns the acting resident's assigned property with formatted address", async () => {
    const response = await request(app)
      .get('/api/v1/resident/properties')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { properties } = response.body.data;
    expect(properties).toHaveLength(1);

    const property = properties[0];
    expect(property.identifier).toMatch(/^PF-/);
    expect(property.kind).toBe('LAND');
    expect(property.kindLabel).toBe('Land');
    expect(property.status).toBe('ACTIVE');
    expect(property.estate.name).toBe('Profile Estate');

    // The full address is assembled from the typed property columns.
    expect(property.fullAddress).toBe('Test Street, Plot 1, Test plot');
    expect(property.streetName).toBe('Test Street');
    expect(property.plotNumber).toBe('1');
    expect(property.plotName).toBe('Test plot');
  });

  it('returns an empty list for a user without an onboarding draft', async () => {
    // Create a RESIDENT user with no linked draft: no property is resolvable.
    const orphan = await prisma.user.create({
      data: {
        organizationId,
        email: `orphan_${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword('Orphan1234!'),
        role: 'RESIDENT',
        status: 'ACTIVE',
        lastPasswordChangedAt: new Date(),
      },
    });

    const login = await request(app).post('/api/v1/auth/login').send({
      email: orphan.email,
      password: 'Orphan1234!',
    });
    expect(login.status).toBe(200);
    const orphanCookie = cookieFrom(login);

    const response = await request(app)
      .get('/api/v1/resident/properties')
      .set('Cookie', orphanCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.properties).toEqual([]);
  });
});
