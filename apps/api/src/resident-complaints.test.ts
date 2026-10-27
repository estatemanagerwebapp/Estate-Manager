/**
 * Resident complaints routes (S5) integration test.
 *
 * Exercises the full S5 surface end to end:
 *
 *   - `GET /resident/complaints` — the acting resident's complaints, with
 *     the estate-office reply thread.
 *   - `POST /resident/complaints` — file a complaint on their own property;
 *     audits `resident.complaint_created`.
 *   - status filtering (`?status=OPEN`).
 *   - self-scoping: one resident never sees another's complaint.
 *   - validation: an empty subject or description is rejected (400).
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
import { PrismaComplaintRepository } from './modules/resident/complaints-repository.js';
import { ResidentComplaintsService } from './modules/resident/complaints.service.js';
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
      email: `compl_${firstName.toLowerCase()}_${uniqueSuffix()}@example.com`,
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
      gender: 'MALE',
      maritalStatus: 'SINGLE',
      nextOfKinName: `Kin ${firstName}`,
      nextOfKinPhone: '+2348009990000',
      nextOfKinEmail: `kin_${firstName.toLowerCase()}@example.com`,
      idType: 'NATIONAL_ID',
    });
  expect(saved.status).toBe(200);

  await prisma.residentOnboarding.update({
    where: { id: residentId },
    data: { idDocumentUrl: `/media/${organizationId}/complaint-doc-${firstName}` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: `COMPL-${firstName}-001` });
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
    data: { slug: `complaints_test_${uniqueSuffix()}`, name: 'Complaints Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `complaint_admin_${uniqueSuffix()}@example.com`,
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
    name: 'Complaints Estate',
    slug: `compl_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    typeKey: 'house',
    identifier: `COMPL-${uniqueSuffix()}`,
    unitTypeKey: null,
    parentPropertyId: null,
    addressComponents: { plot: '11', street: 'Complaint Road', city: 'Lagos' },
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

  const residentComplaintsService = new ResidentComplaintsService({
    complaints: new PrismaComplaintRepository(prisma),
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
      complaints: residentComplaintsService,
    },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  const first = await onboardResident('Ada', '+2348002220001');
  residentCookie = first.cookie;
  residentUserId = first.userId;

  const second = await onboardResident('Bode', '+2348002220002');
  secondResidentCookie = second.cookie;
});

afterAll(async () => {
  await prisma.complaintReply.deleteMany({ where: { complaint: { organizationId } } });
  await prisma.complaint.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

describe('resident complaints (S5)', () => {
  it('rejects the complaint routes without a session', async () => {
    expect((await request(app).get('/api/v1/resident/complaints')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/resident/complaints')
          .send({ category: 'Facilities', subject: 'x', description: 'y' })
      ).status,
    ).toBe(401);
  });

  it('files a complaint on the resident property and audits it', async () => {
    const response = await request(app)
      .post('/api/v1/resident/complaints')
      .set('Cookie', residentCookie)
      .send({
        category: 'Facilities',
        subject: 'Generator noise at night',
        description: 'The generator runs past midnight every day.',
      });
    expect(response.status).toBe(201);
    expect(response.body.data.ok).toBe(true);

    const complaint = response.body.data.complaint;
    expect(complaint.id).toBeDefined();
    expect(complaint.status).toBe('OPEN');
    expect(complaint.subject).toBe('Generator noise at night');
    expect(complaint.replies).toEqual([]);

    // The row is linked to the resident and their property.
    const row = await prisma.complaint.findUnique({ where: { id: complaint.id } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(residentUserId);
    expect(row!.propertyId).toBe(propertyId);
    expect(row!.status).toBe('OPEN');

    // The audit event was written.
    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_complaint_created' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('lists the complaint with the estate-office reply thread', async () => {
    const listed = await request(app)
      .get('/api/v1/resident/complaints')
      .set('Cookie', residentCookie);
    expect(listed.status).toBe(200);

    const { complaints } = listed.body.data;
    expect(complaints.length).toBe(1);
    expect(complaints[0].subject).toBe('Generator noise at night');
    expect(complaints[0].replies).toEqual([]);

    // The estate office replies — the resident sees it on the next read.
    await prisma.complaintReply.create({
      data: {
        complaintId: complaints[0].id,
        authorId: null,
        body: 'We have scheduled servicing for Thursday morning.',
      },
    });

    const afterReply = await request(app)
      .get('/api/v1/resident/complaints')
      .set('Cookie', residentCookie);
    const withReplies = afterReply.body.data.complaints;
    expect(withReplies.length).toBe(1);
    expect(withReplies[0].replies.length).toBe(1);
    expect(withReplies[0].replies[0].body).toContain('scheduled servicing');
  });

  it('filters the list by status', async () => {
    const open = await request(app)
      .get('/api/v1/resident/complaints?status=OPEN')
      .set('Cookie', residentCookie);
    expect(open.status).toBe(200);
    expect(open.body.data.complaints.length).toBe(1);

    const resolved = await request(app)
      .get('/api/v1/resident/complaints?status=RESOLVED')
      .set('Cookie', residentCookie);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.complaints.length).toBe(0);

    const invalid = await request(app)
      .get('/api/v1/resident/complaints?status=NOPE')
      .set('Cookie', residentCookie);
    expect(invalid.status).toBe(400);
  });

  it("keeps each resident's complaints independent", async () => {
    // The second resident files their own complaint.
    const created = await request(app)
      .post('/api/v1/resident/complaints')
      .set('Cookie', secondResidentCookie)
      .send({
        category: 'Security',
        subject: 'Gate lamp out',
        description: 'The lamp by the gate has been off for a week.',
      });
    expect(created.status).toBe(201);

    const first = await request(app)
      .get('/api/v1/resident/complaints')
      .set('Cookie', residentCookie);
    expect(first.body.data.complaints.length).toBe(1);
    expect(first.body.data.complaints[0].subject).toBe('Generator noise at night');

    const second = await request(app)
      .get('/api/v1/resident/complaints')
      .set('Cookie', secondResidentCookie);
    expect(second.body.data.complaints.length).toBe(1);
    expect(second.body.data.complaints[0].subject).toBe('Gate lamp out');
  });

  it('rejects an invalid complaint', async () => {
    const noSubject = await request(app)
      .post('/api/v1/resident/complaints')
      .set('Cookie', residentCookie)
      .send({ category: 'Facilities', subject: '   ', description: 'Body' });
    expect(noSubject.status).toBe(400);

    const noDescription = await request(app)
      .post('/api/v1/resident/complaints')
      .set('Cookie', residentCookie)
      .send({ category: 'Facilities', subject: 'Subject', description: '' });
    expect(noDescription.status).toBe(400);
  });
});
