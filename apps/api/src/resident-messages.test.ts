/**
 * Resident messages routes (S6) integration test.
 *
 * Exercises the full S6 surface end to end:
 *
 *   - `GET /resident/messages` — the acting resident's threads, with their
 *     message history.
 *   - `POST /resident/messages` — start a thread (subject + first message)
 *     or reply into an open one; audits `resident.message_sent`.
 *   - self-scoping: one resident never sees or reaches another's thread.
 *   - validation: a new thread without a subject, or an empty body, is
 *     rejected (400).
 *   - unauthenticated callers get 401.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
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
import { PrismaMessageRepository } from './modules/resident/messages-repository.js';
import { ResidentMessagesService } from './modules/resident/messages.service.js';
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
      email: `msg_${firstName.toLowerCase()}_${uniqueSuffix()}@example.com`,
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
    data: { idDocumentUrl: `/media/${organizationId}/msg-doc-${firstName}` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: `MSG-${firstName}-001` });
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
    data: { slug: `messages_test_${uniqueSuffix()}`, name: 'Messages Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `msg_admin_${uniqueSuffix()}@example.com`,
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
    name: 'Messages Estate',
    slug: `msg_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    typeKey: 'house',
    identifier: `MSG-${uniqueSuffix()}`,
    unitTypeKey: null,
    parentPropertyId: null,
    addressComponents: { plot: '13', street: 'Message Road', city: 'Lagos' },
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

  const residentMessagesService = new ResidentMessagesService({
    messages: new PrismaMessageRepository(prisma),
    audit,
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
      messages: residentMessagesService,
    },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  const first = await onboardResident('Ada', '+2348003330001');
  residentCookie = first.cookie;
  residentUserId = first.userId;

  const second = await onboardResident('Bode', '+2348003330002');
  secondResidentCookie = second.cookie;
});

afterAll(async () => {
  await prisma.message.deleteMany({ where: { thread: { organizationId } } });
  await prisma.messageThread.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

describe('resident messages (S6)', () => {
  it('rejects the message routes without a session', async () => {
    expect((await request(app).get('/api/v1/resident/messages')).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/resident/messages').send({ subject: 'Hi', body: 'Hello' }))
        .status,
    ).toBe(401);
  });

  it('starts a thread with its first message and audits it', async () => {
    const response = await request(app)
      .post('/api/v1/resident/messages')
      .set('Cookie', residentCookie)
      .send({
        subject: 'Water supply interruption',
        body: 'There has been no water supply since Tuesday morning.',
      });
    expect(response.status).toBe(201);
    expect(response.body.data.ok).toBe(true);

    const thread = response.body.data.thread;
    expect(thread.id).toBeDefined();
    expect(thread.subject).toBe('Water supply interruption');
    expect(thread.status).toBe('OPEN');
    expect(thread.messages.length).toBe(1);
    expect(thread.messages[0].senderRole).toBe('RESIDENT');
    expect(thread.messages[0].body).toContain('no water supply');

    // The row is owned by the acting resident.
    const row = await prisma.messageThread.findUnique({ where: { id: thread.id } });
    expect(row).not.toBeNull();
    expect(row!.residentUserId).toBe(residentUserId);
    expect(row!.status).toBe('OPEN');

    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_message_sent' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('lists the resident threads with their message history', async () => {
    const response = await request(app)
      .get('/api/v1/resident/messages')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { threads } = response.body.data;
    expect(threads.length).toBe(1);
    expect(threads[0].subject).toBe('Water supply interruption');
    expect(threads[0].messages.length).toBe(1);
  });

  it('replies into an open thread and shows the estate-office answer', async () => {
    const listed = await request(app)
      .get('/api/v1/resident/messages')
      .set('Cookie', residentCookie);
    const threadId = listed.body.data.threads[0].id as string;

    const reply = await request(app)
      .post('/api/v1/resident/messages')
      .set('Cookie', residentCookie)
      .send({ threadId, body: 'Any update on this, please?' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.thread.messages.length).toBe(2);
    expect(reply.body.data.thread.messages[1].body).toBe('Any update on this, please?');

    // The estate office answers in the same thread.
    await prisma.message.create({
      data: {
        threadId,
        senderRole: 'ESTATE_OFFICE',
        body: 'A tanker is scheduled for tomorrow morning.',
      },
    });

    const after = await request(app).get('/api/v1/resident/messages').set('Cookie', residentCookie);
    const messages = after.body.data.threads[0].messages;
    expect(messages.length).toBe(3);
    expect(messages[2].senderRole).toBe('ESTATE_OFFICE');
    expect(messages[2].body).toContain('tanker');
  });

  it("keeps each resident's threads independent", async () => {
    const created = await request(app)
      .post('/api/v1/resident/messages')
      .set('Cookie', secondResidentCookie)
      .send({
        subject: 'Visitor parking',
        body: 'Where should visitors park overnight?',
      });
    expect(created.status).toBe(201);

    const first = await request(app).get('/api/v1/resident/messages').set('Cookie', residentCookie);
    expect(first.body.data.threads.length).toBe(1);
    expect(first.body.data.threads[0].subject).toBe('Water supply interruption');

    const second = await request(app)
      .get('/api/v1/resident/messages')
      .set('Cookie', secondResidentCookie);
    expect(second.body.data.threads.length).toBe(1);
    expect(second.body.data.threads[0].subject).toBe('Visitor parking');
  });

  it("does not let one resident reply into another resident's thread", async () => {
    const second = await request(app)
      .get('/api/v1/resident/messages')
      .set('Cookie', secondResidentCookie);
    const otherThreadId = second.body.data.threads[0].id as string;

    const response = await request(app)
      .post('/api/v1/resident/messages')
      .set('Cookie', residentCookie)
      .send({ threadId: otherThreadId, body: 'Not my thread' });
    expect(response.status).toBe(404);

    // The other thread is untouched.
    const row = await prisma.messageThread.findUnique({
      where: { id: otherThreadId },
      include: { messages: true },
    });
    expect(row!.messages.length).toBe(1);
  });

  it('rejects an invalid message', async () => {
    const noSubject = await request(app)
      .post('/api/v1/resident/messages')
      .set('Cookie', residentCookie)
      .send({ body: 'Hello without a subject' });
    expect(noSubject.status).toBe(400);

    const noBody = await request(app)
      .post('/api/v1/resident/messages')
      .set('Cookie', residentCookie)
      .send({ subject: 'Subject', body: '   ' });
    expect(noBody.status).toBe(400);
  });
});
