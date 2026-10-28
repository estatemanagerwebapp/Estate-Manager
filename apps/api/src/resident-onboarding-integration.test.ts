/**
 * Resident onboarding integration tests.
 *
 * Exercises the full admin + guest flow against the real database and the
 * real Express routes:
 *
 *   register → list (Residents screen) → guest autosave → admin marks paid
 *   → guest completes → the account appears in the Users list.
 *
 * This is the contract the two screens rely on: a resident stays a resident
 * until payment is verified, and only then becomes a user account.
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
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let propertyId = '';
const ADMIN_EMAIL = 'resident_admin@example.com';
const ADMIN_PASSWORD = 'Sup3rSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

async function completeResident(firstName: string) {
  const email = `${firstName.toLowerCase()}_${uniqueSuffix()}@example.com`;
  const registered = await request(app)
    .post('/api/v1/onboard/residents')
    .set('Cookie', adminCookie)
    .send({ firstName, email, phone: '+2348000000000', propertyId });
  expect(registered.status).toBe(201);

  const residentId = registered.body.data.resident.id as string;
  const code = registered.body.data.onboardingCode as string;

  const saved = await request(app).patch(`/api/v1/onboard/by-code/${code}`).send({
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    nextOfKinName: 'John Doe',
    nextOfKinPhone: '+2348000000001',
    idType: 'NATIONAL_ID',
  });
  expect(saved.status).toBe(200);

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: 'CASH-001' });
  expect(paid.status).toBe(200);

  await prisma.residentOnboarding.update({
    where: { id: residentId },
    data: { idDocumentUrl: `/media/${organizationId}/doc-${residentId}` },
  });

  const completed = await request(app)
    .post(`/api/v1/onboard/by-code/${code}/complete`)
    .send({ code });
  expect(completed.status).toBe(200);

  return {
    residentId,
    code,
    email,
    userId: completed.body.data.user.id as string,
    password: completed.body.data.demoPassword as string,
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
    data: { slug: `resident_test_${uniqueSuffix()}`, name: 'Resident Test' },
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

  // A property to assign residents to.
  const estates = new PrismaEstateRepository(prisma);
  const properties = new PrismaPropertyRepository(prisma);
  const estate = await estates.create({
    organizationId,
    name: 'Resident Estate',
    slug: `res_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    kind: 'LAND',
    identifier: `RES-${uniqueSuffix()}`,
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
  });

  const login = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(login.status).toBe(200);
  adminCookie = cookieFrom(login);
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

describe('resident onboarding (integration)', () => {
  it('registers a resident, and the resident becomes a user only after payment', async () => {
    const email = `adaeze_${uniqueSuffix()}@example.com`;

    // --- Admin registers the resident (first name + property) ---------------
    const registered = await request(app)
      .post('/api/v1/onboard/residents')
      .set('Cookie', adminCookie)
      .send({ firstName: 'Adaeze', email, phone: '+2348000000000', propertyId });
    expect(registered.status).toBe(201);

    const code = registered.body.data.onboardingCode as string;
    const residentId = registered.body.data.resident.id as string;
    expect(code).toHaveLength(10);
    expect(registered.body.data.resident.status).toBe('PENDING');
    expect(registered.body.data.resident.userId).toBeNull();

    // --- The resident is listed on the Residents screen ---------------------
    const listed = await request(app).get('/api/v1/onboard/residents').set('Cookie', adminCookie);
    expect(listed.status).toBe(200);
    const resident = listed.body.data.residents.find((r: { id: string }) => r.id === residentId);
    expect(resident).toBeDefined();
    expect(resident.paymentStatus).toBe('UNPAID');
    expect(resident.userId).toBeNull();

    // --- But no user account exists yet -------------------------------------
    const usersBefore = await request(app).get('/api/v1/auth/users').set('Cookie', adminCookie);
    expect(usersBefore.body.data.users.some((u: { email: string }) => u.email === email)).toBe(
      false,
    );

    // --- The guest loads the draft and autosaves their fields ---------------
    const guestView = await request(app).get(`/api/v1/onboard/by-code/${code}`);
    expect(guestView.status).toBe(200);
    expect(guestView.body.data.resident.firstName).toBe('Adaeze');
    // The admin-provided contact details are read-only but prefilled.
    expect(guestView.body.data.resident.email).toBe(email);

    const saved = await request(app).patch(`/api/v1/onboard/by-code/${code}`).send({
      gender: 'FEMALE',
      maritalStatus: 'SINGLE',
      nextOfKinName: 'John Doe',
      nextOfKinPhone: '+2348000000001',
      idType: 'NATIONAL_ID',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.resident.gender).toBe('FEMALE');

    // --- The resident submits the out-of-band payment reference --------------
    const note = await request(app)
      .post(`/api/v1/onboard/by-code/${code}/payment-note`)
      .send({ paymentRef: 'CASH-001' });
    expect(note.status).toBe(200);
    expect(note.body.data.resident.paymentRef).toBe('CASH-001');
    // Submitting a note does NOT mark the draft paid.
    expect(note.body.data.resident.paymentStatus).toBe('UNPAID');

    // --- Completion is refused until the admin confirms payment --------------
    const tooEarly = await request(app)
      .post(`/api/v1/onboard/by-code/${code}/complete`)
      .send({ code });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('PAYMENT_REQUIRED');

    // --- The admin confirms the payment --------------------------------------
    const paid = await request(app)
      .post(`/api/v1/onboard/residents/${residentId}/payment`)
      .set('Cookie', adminCookie)
      .send({ paymentRef: 'CASH-001' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.resident.paymentStatus).toBe('PAID');

    // --- Completion still needs the ID document ------------------------------
    const noDocument = await request(app)
      .post(`/api/v1/onboard/by-code/${code}/complete`)
      .send({ code });
    expect(noDocument.status).toBe(400);
    expect(noDocument.body.error.code).toBe('VALIDATION_ERROR');

    // --- The ID document is attached out-of-band ----------------------------
    await prisma.residentOnboarding.update({
      where: { id: residentId },
      data: { idDocumentUrl: `/media/${organizationId}/doc-1` },
    });

    // --- Completion creates the account -------------------------------------
    const completed = await request(app)
      .post(`/api/v1/onboard/by-code/${code}/complete`)
      .send({ code });
    expect(completed.status).toBe(200);
    expect(completed.body.data.ok).toBe(true);
    expect(completed.body.data.demoPassword).toHaveLength(16);
    expect(completed.body.data.user.mustChangePassword).toBe(true);
    expect(completed.body.data.user.role).toBe('RESIDENT');
    expect(completed.body.data.user.email).toBe(email);

    const userId = completed.body.data.user.id as string;

    // --- The resident now appears on the Users screen -----------------------
    const usersAfter = await request(app).get('/api/v1/auth/users').set('Cookie', adminCookie);
    const created = usersAfter.body.data.users.find((u: { id: string }) => u.id === userId);
    expect(created).toBeDefined();
    expect(created.email).toBe(email);

    // --- And the resident record is linked to the account -------------------
    const listedAfter = await request(app)
      .get(`/api/v1/onboard/residents`)
      .set('Cookie', adminCookie);
    const linked = listedAfter.body.data.residents.find((r: { id: string }) => r.id === residentId);
    expect(linked.status).toBe('COMPLETED');
    expect(linked.userId).toBe(userId);
  });

  it('rejects a resident registration without a property', async () => {
    const response = await request(app)
      .post('/api/v1/onboard/residents')
      .set('Cookie', adminCookie)
      .send({ firstName: 'NoProperty' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a resident registration without a first name', async () => {
    const response = await request(app)
      .post('/api/v1/onboard/residents')
      .set('Cookie', adminCookie)
      .send({ firstName: '   ', propertyId });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses the resident list without user.manage', async () => {
    const response = await request(app).get('/api/v1/onboard/residents');
    expect(response.status).toBe(401);
  });

  it('edits, archives and restores a resident draft', async () => {
    const email = `archive_${uniqueSuffix()}@example.com`;
    const registered = await request(app)
      .post('/api/v1/onboard/residents')
      .set('Cookie', adminCookie)
      .send({ firstName: 'Archive', email, phone: '+2348000000000', propertyId });
    expect(registered.status).toBe(201);

    const residentId = registered.body.data.resident.id as string;
    const code = registered.body.data.onboardingCode as string;

    const updatedEmail = `archive_updated_${uniqueSuffix()}@example.com`;
    const updated = await request(app)
      .patch(`/api/v1/onboard/residents/${residentId}`)
      .set('Cookie', adminCookie)
      .send({
        firstName: 'Archive Updated',
        email: updatedEmail,
        phone: '+2348000000099',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.resident.firstName).toBe('Archive Updated');
    expect(updated.body.data.resident.email).toBe(updatedEmail);
    expect(updated.body.data.resident.propertyId).toBe(propertyId);

    const guestAfterEdit = await request(app).get(`/api/v1/onboard/by-code/${code}`);
    expect(guestAfterEdit.status).toBe(200);
    expect(guestAfterEdit.body.data.resident.firstName).toBe('Archive Updated');

    const archived = await request(app)
      .post(`/api/v1/onboard/residents/${residentId}/archive`)
      .set('Cookie', adminCookie);
    expect(archived.status).toBe(200);
    expect(archived.body.data.resident.archivedAt).toBeTruthy();

    const archivedCode = await request(app).get(`/api/v1/onboard/by-code/${code}`);
    expect(archivedCode.status).toBe(404);

    const list = await request(app).get('/api/v1/onboard/residents').set('Cookie', adminCookie);
    const listed = list.body.data.residents.find(
      (resident: { id: string }) => resident.id === residentId,
    );
    expect(listed.archivedAt).toBeTruthy();

    const restored = await request(app)
      .post(`/api/v1/onboard/residents/${residentId}/restore`)
      .set('Cookie', adminCookie);
    expect(restored.status).toBe(200);
    expect(restored.body.data.resident.archivedAt).toBeNull();

    const restoredCode = await request(app).get(`/api/v1/onboard/by-code/${code}`);
    expect(restoredCode.status).toBe(200);

    const audit = await prisma.auditEvent.findMany({
      where: { organizationId, targetId: residentId },
      orderBy: { createdAt: 'asc' },
    });
    const eventTypes = audit.map((event) => event.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining(['resident_updated', 'resident_archived', 'resident_restored']),
    );
  });

  it('deletes a pending resident draft that has no linked account', async () => {
    const email = `delete_${uniqueSuffix()}@example.com`;
    const registered = await request(app)
      .post('/api/v1/onboard/residents')
      .set('Cookie', adminCookie)
      .send({ firstName: 'Delete Me', email, propertyId });
    expect(registered.status).toBe(201);

    const residentId = registered.body.data.resident.id as string;
    const code = registered.body.data.onboardingCode as string;

    const deleted = await request(app)
      .delete(`/api/v1/onboard/residents/${residentId}`)
      .set('Cookie', adminCookie);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.id).toBe(residentId);

    const guestAfterDelete = await request(app).get(`/api/v1/onboard/by-code/${code}`);
    expect(guestAfterDelete.status).toBe(404);

    const list = await request(app).get('/api/v1/onboard/residents').set('Cookie', adminCookie);
    expect(
      list.body.data.residents.some((resident: { id: string }) => resident.id === residentId),
    ).toBe(false);
  });

  it('disables and re-enables portal access and refuses deleting a linked resident', async () => {
    const resident = await completeResident('Ngozi');

    const firstLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resident.email, password: resident.password });
    expect(firstLogin.status).toBe(200);
    const residentCookie = cookieFrom(firstLogin);

    const sessionBefore = await request(app).get('/api/v1/auth/me').set('Cookie', residentCookie);
    expect(sessionBefore.status).toBe(200);

    const disabled = await request(app)
      .post(`/api/v1/onboard/residents/${resident.residentId}/portal-access`)
      .set('Cookie', adminCookie)
      .send({ enabled: false, reason: 'Resident left the estate' });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.resident.accountStatus).toBe('DISABLED');

    // Existing sessions are denied on their next request, not just new logins.
    const blockedSession = await request(app).get('/api/v1/auth/me').set('Cookie', residentCookie);
    expect(blockedSession.status).toBe(401);

    const blockedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resident.email, password: resident.password });
    expect(blockedLogin.status).toBe(401);

    const deleteBlocked = await request(app)
      .delete(`/api/v1/onboard/residents/${resident.residentId}`)
      .set('Cookie', adminCookie);
    expect(deleteBlocked.status).toBe(409);
    expect(deleteBlocked.body.error.code).toBe('CONFLICT');

    const enabled = await request(app)
      .post(`/api/v1/onboard/residents/${resident.residentId}/portal-access`)
      .set('Cookie', adminCookie)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.resident.accountStatus).toBe('ACTIVE');

    const loginAgain = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resident.email, password: resident.password });
    expect(loginAgain.status).toBe(200);

    // Editing a completed resident keeps the linked login identity in sync.
    const newEmail = `ngozi_updated_${uniqueSuffix()}@example.com`;
    const edited = await request(app)
      .patch(`/api/v1/onboard/residents/${resident.residentId}`)
      .set('Cookie', adminCookie)
      .send({ firstName: 'Ngozi Updated', email: newEmail });
    expect(edited.status).toBe(200);
    expect(edited.body.data.resident.email).toBe(newEmail);
    expect(edited.body.data.resident.firstName).toBe('Ngozi Updated');

    const oldEmailLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resident.email, password: resident.password });
    expect(oldEmailLogin.status).toBe(401);

    const newEmailLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: newEmail, password: resident.password });
    expect(newEmailLogin.status).toBe(200);
  });
});
