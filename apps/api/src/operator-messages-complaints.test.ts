/**
 * Operator Messages & Complaints integration test.
 *
 * Covers the Phase 4 staff surfaces:
 *
 *   - `GET /messages` / `GET /complaints` require their read permissions;
 *   - staff replies, read markers, close/reopen and complaint status changes
 *     require their manage permissions;
 *   - resident and auditor access is denied or read-only;
 *   - resident/property context and author identity are returned;
 *   - the complaint status timestamp and both audit streams are persisted;
 *   - organization scoping and malformed ids are enforced.
 */
import { createHash } from 'node:crypto';
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
import { PrismaMessageRepository } from './modules/resident/messages-repository.js';
import { PrismaComplaintRepository } from './modules/resident/complaints-repository.js';
import { OperatorMessagesService } from './modules/messages/operator-messages.service.js';
import { OperatorComplaintsService } from './modules/complaints/operator-complaints.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let otherOrganizationId = '';
let propertyId = '';
let otherPropertyId = '';
let adminId = '';
let residentId = '';
let adminCookie = '';
let auditorCookie = '';
let residentCookie = '';
let otherThreadId = '';
let otherComplaintId = '';
const PASSWORD = 'Sup3rSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

async function createUser(
  orgId: string,
  role: string,
  label: string,
  fullName: string,
): Promise<{ id: string; email: string; cookie: string }> {
  const email = `messages_${label}_${uniqueSuffix()}@example.com`;
  const user = await prisma.user.create({
    data: {
      organizationId: orgId,
      email,
      passwordHash: await hashPassword(PASSWORD),
      fullName,
      role,
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { id: user.id, email, cookie: cookieFrom(login) };
}

async function createProperty(orgId: string, label: string): Promise<string> {
  const estates = new PrismaEstateRepository(prisma);
  const properties = new PrismaPropertyRepository(prisma);
  const estate = await estates.create({
    organizationId: orgId,
    name: `Messaging ${label} Estate`,
    slug: `messaging_${label}_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId: orgId,
    estateId: estate.id,
    kind: 'HOUSE',
    identifier: `MSG-${uniqueSuffix()}`,
    streetName: 'Test Street',
    plotNumber: '1',
    plotName: 'Test plot',
    name: 'Test House',
  });
  return property.id;
}

async function createThread(subject: string): Promise<string> {
  const thread = await prisma.messageThread.create({
    data: {
      organizationId,
      residentUserId: residentId,
      subject,
      status: 'OPEN',
    },
  });
  await prisma.message.create({
    data: {
      threadId: thread.id,
      senderRole: 'RESIDENT',
      authorId: residentId,
      body: 'The generator is very loud at night.',
    },
  });
  return thread.id;
}

async function createComplaint(subject: string): Promise<string> {
  const complaint = await prisma.complaint.create({
    data: {
      organizationId,
      userId: residentId,
      propertyId,
      category: 'NOISE',
      subject,
      description: 'The generator runs until midnight and is very loud.',
      status: 'OPEN',
    },
  });
  return complaint.id;
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
    data: { slug: `messaging_operator_${uniqueSuffix()}`, name: 'Messaging Operator Test' },
  });
  organizationId = org.id;
  const otherOrg = await prisma.organization.create({
    data: { slug: `messaging_other_${uniqueSuffix()}`, name: 'Messaging Other Test' },
  });
  otherOrganizationId = otherOrg.id;

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
    messages: {
      sessions,
      permissions,
      organizationId,
      messages: new OperatorMessagesService({
        messages: new PrismaMessageRepository(prisma),
        audit,
      }),
    },
    complaints: {
      sessions,
      permissions,
      organizationId,
      complaints: new OperatorComplaintsService({
        complaints: new PrismaComplaintRepository(prisma),
        audit,
      }),
    },
  });

  propertyId = await createProperty(organizationId, 'main');
  otherPropertyId = await createProperty(otherOrganizationId, 'other');

  const admin = await createUser(organizationId, 'ESTATE_ADMIN', 'admin', 'Grace Bello');
  adminId = admin.id;
  adminCookie = admin.cookie;
  auditorCookie = (await createUser(organizationId, 'AUDITOR', 'auditor', 'Audit User')).cookie;
  const resident = await createUser(organizationId, 'RESIDENT', 'resident', 'Ada Okafor');
  residentId = resident.id;
  residentCookie = resident.cookie;

  await prisma.residentOnboarding.create({
    data: {
      organizationId,
      propertyId,
      status: 'COMPLETED',
      codeHash: createHash('sha256').update(`messaging_${uniqueSuffix()}`).digest('hex'),
      firstName: 'Ada',
      email: resident.email,
      phone: '+2348000000000',
      paymentStatus: 'PAID',
      paidAt: new Date(),
      completedAt: new Date(),
      userId: residentId,
    },
  });

  const otherResident = await prisma.user.create({
    data: {
      organizationId: otherOrganizationId,
      email: `messages_other_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      fullName: 'Other Resident',
      role: 'RESIDENT',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  const otherThread = await prisma.messageThread.create({
    data: {
      organizationId: otherOrganizationId,
      residentUserId: otherResident.id,
      subject: 'Other organization thread',
      status: 'OPEN',
    },
  });
  otherThreadId = otherThread.id;
  const otherComplaint = await prisma.complaint.create({
    data: {
      organizationId: otherOrganizationId,
      userId: otherResident.id,
      propertyId: otherPropertyId,
      category: 'OTHER',
      subject: 'Other organization complaint',
      description: 'Not visible to the main organization.',
      status: 'OPEN',
    },
  });
  otherComplaintId = otherComplaint.id;
});

afterAll(async () => {
  const orgIds = [organizationId, otherOrganizationId];
  await prisma.complaint.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.messageThread.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.property.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.estate.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.session.deleteMany({ where: { user: { organizationId: { in: orgIds } } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await disconnectPrisma();
});

describe('operator messages', () => {
  it('rejects unauthenticated access and malformed ids', async () => {
    expect((await request(app).get('/api/v1/messages')).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/messages/not-a-uuid/read').set('Cookie', adminCookie))
        .status,
    ).toBe(400);
  });

  it('lets auditors read but not reply, and keeps residents out', async () => {
    const threadId = await createThread('Auditor read check');
    expect((await request(app).get('/api/v1/messages').set('Cookie', auditorCookie)).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .post(`/api/v1/messages/${threadId}/reply`)
          .set('Cookie', auditorCookie)
          .send({ body: 'Auditor reply' })
      ).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/messages').set('Cookie', residentCookie)).status).toBe(
      403,
    );
  });

  it('returns resident/property context and tracks the shared read marker', async () => {
    const threadId = await createThread('Generator noise');
    const listed = await request(app).get('/api/v1/messages').set('Cookie', adminCookie);
    expect(listed.status).toBe(200);
    const thread = (listed.body.data.threads as Array<Record<string, unknown>>).find(
      (entry) => entry.id === threadId,
    );
    expect(thread).toBeTruthy();
    expect(thread?.unreadCount).toBe(1);
    expect((thread?.resident as { fullName?: string }).fullName).toBe('Ada Okafor');
    expect((thread?.property as { identifier?: string }).identifier).toBeTruthy();
    expect(
      ((thread?.messages as Array<Record<string, unknown>>)[0].author as { id?: string }).id,
    ).toBe(residentId);

    const read = await request(app)
      .post(`/api/v1/messages/${threadId}/read`)
      .set('Cookie', adminCookie);
    expect(read.status).toBe(200);
    expect(read.body.data.thread.unreadCount).toBe(0);
    const stored = await prisma.messageThread.findUniqueOrThrow({ where: { id: threadId } });
    expect(stored.staffLastReadAt).toBeTruthy();
  });

  it('lets staff reply, close, reopen and audits the transitions', async () => {
    const threadId = await createThread('Reply lifecycle');
    const reply = await request(app)
      .post(`/api/v1/messages/${threadId}/reply`)
      .set('Cookie', adminCookie)
      .send({ body: 'We have asked the maintenance team to inspect it.' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.thread.messages).toHaveLength(2);
    const officeReply = (
      reply.body.data.thread.messages as Array<{
        senderRole: string;
        author: { id: string } | null;
        body: string;
      }>
    )[1];
    expect(officeReply.senderRole).toBe('ESTATE_OFFICE');
    expect(officeReply.author?.id).toBe(adminId);
    expect(officeReply.body).toContain('maintenance team');

    const closed = await request(app)
      .post(`/api/v1/messages/${threadId}/close`)
      .set('Cookie', adminCookie);
    expect(closed.status).toBe(200);
    expect(closed.body.data.thread.status).toBe('CLOSED');

    const replyWhileClosed = await request(app)
      .post(`/api/v1/messages/${threadId}/reply`)
      .set('Cookie', adminCookie)
      .send({ body: 'Should be rejected' });
    expect(replyWhileClosed.status).toBe(409);

    const reopened = await request(app)
      .post(`/api/v1/messages/${threadId}/reopen`)
      .set('Cookie', adminCookie);
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.thread.status).toBe('OPEN');

    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        targetId: threadId,
        eventType: {
          in: ['message_replied', 'message_thread_closed', 'message_thread_reopened'],
        },
      },
    });
    expect(audits.map((event) => event.eventType).sort()).toEqual([
      'message_replied',
      'message_thread_closed',
      'message_thread_reopened',
    ]);
    expect(audits.every((event) => event.actorId === adminId)).toBe(true);
  });

  it('filters by status and never exposes another organization’s thread', async () => {
    const closedThreadId = await createThread('Closed filter check');
    await request(app)
      .post(`/api/v1/messages/${closedThreadId}/close`)
      .set('Cookie', adminCookie)
      .expect(200);

    const closed = await request(app)
      .get('/api/v1/messages?status=CLOSED')
      .set('Cookie', adminCookie);
    expect(closed.status).toBe(200);
    expect(
      (closed.body.data.threads as Array<{ id: string }>).map((thread) => thread.id),
    ).toContain(closedThreadId);

    const all = await request(app).get('/api/v1/messages').set('Cookie', adminCookie);
    expect(
      (all.body.data.threads as Array<{ id: string }>).map((thread) => thread.id),
    ).not.toContain(otherThreadId);
    expect(
      (
        await request(app)
          .post(`/api/v1/messages/${otherThreadId}/reply`)
          .set('Cookie', adminCookie)
          .send({ body: 'Cross-org reply' })
      ).status,
    ).toBe(404);
  });
});

describe('operator complaints', () => {
  it('rejects unauthenticated access and malformed ids', async () => {
    expect((await request(app).get('/api/v1/complaints')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/complaints/not-a-uuid/reply')
          .set('Cookie', adminCookie)
          .send({ body: 'Reply' })
      ).status,
    ).toBe(400);
  });

  it('lets auditors read but not manage, and keeps residents out', async () => {
    const complaintId = await createComplaint('Auditor read check');
    expect((await request(app).get('/api/v1/complaints').set('Cookie', auditorCookie)).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .post(`/api/v1/complaints/${complaintId}/reply`)
          .set('Cookie', auditorCookie)
          .send({ body: 'Auditor reply' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/complaints/${complaintId}/status`)
          .set('Cookie', auditorCookie)
          .send({ status: 'RESOLVED' })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/complaints').set('Cookie', residentCookie)).status,
    ).toBe(403);
  });

  it('returns context, records replies and moves the status with timestamps', async () => {
    const complaintId = await createComplaint('Generator noise complaint');
    const listed = await request(app).get('/api/v1/complaints').set('Cookie', adminCookie);
    expect(listed.status).toBe(200);
    const complaint = (listed.body.data.complaints as Array<Record<string, unknown>>).find(
      (entry) => entry.id === complaintId,
    );
    expect(complaint).toBeTruthy();
    expect((complaint?.resident as { fullName?: string }).fullName).toBe('Ada Okafor');
    expect((complaint?.property as { identifier?: string }).identifier).toBeTruthy();

    const replied = await request(app)
      .post(`/api/v1/complaints/${complaintId}/reply`)
      .set('Cookie', adminCookie)
      .send({ body: 'We have asked the maintenance team to inspect it.' });
    expect(replied.status).toBe(201);
    expect(replied.body.data.complaint.replies).toHaveLength(1);
    expect((replied.body.data.complaint.replies[0].author as { id: string }).id).toBe(adminId);

    const inProgress = await request(app)
      .post(`/api/v1/complaints/${complaintId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'IN_PROGRESS' });
    expect(inProgress.status).toBe(200);
    expect(inProgress.body.data.complaint.status).toBe('IN_PROGRESS');
    expect(inProgress.body.data.complaint.resolvedAt).toBeNull();

    const resolved = await request(app)
      .post(`/api/v1/complaints/${complaintId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'RESOLVED' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.complaint.resolvedAt).toBeTruthy();

    const closed = await request(app)
      .post(`/api/v1/complaints/${complaintId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'CLOSED' });
    expect(closed.status).toBe(200);
    expect(closed.body.data.complaint.resolvedAt).toBe(resolved.body.data.complaint.resolvedAt);

    const replyWhileClosed = await request(app)
      .post(`/api/v1/complaints/${complaintId}/reply`)
      .set('Cookie', adminCookie)
      .send({ body: 'Should be rejected' });
    expect(replyWhileClosed.status).toBe(409);

    const reopened = await request(app)
      .post(`/api/v1/complaints/${complaintId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'OPEN' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.complaint.resolvedAt).toBeNull();

    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        targetId: complaintId,
        eventType: { in: ['complaint_replied', 'complaint_status_changed'] },
      },
    });
    expect(audits.map((event) => event.eventType).sort()).toEqual([
      'complaint_replied',
      'complaint_status_changed',
      'complaint_status_changed',
      'complaint_status_changed',
      'complaint_status_changed',
    ]);
  });

  it('filters by status and never exposes another organization’s complaint', async () => {
    const resolvedId = await createComplaint('Resolved filter check');
    await request(app)
      .post(`/api/v1/complaints/${resolvedId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'RESOLVED' })
      .expect(200);

    const resolved = await request(app)
      .get('/api/v1/complaints?status=RESOLVED')
      .set('Cookie', adminCookie);
    expect(resolved.status).toBe(200);
    expect(
      (resolved.body.data.complaints as Array<{ id: string }>).map((complaint) => complaint.id),
    ).toContain(resolvedId);

    const all = await request(app).get('/api/v1/complaints').set('Cookie', adminCookie);
    expect(
      (all.body.data.complaints as Array<{ id: string }>).map((complaint) => complaint.id),
    ).not.toContain(otherComplaintId);
    expect(
      (
        await request(app)
          .post(`/api/v1/complaints/${otherComplaintId}/reply`)
          .set('Cookie', adminCookie)
          .send({ body: 'Cross-org reply' })
      ).status,
    ).toBe(404);
  });

  it('rejects invalid status values', async () => {
    const complaintId = await createComplaint('Invalid status check');
    const invalid = await request(app)
      .post(`/api/v1/complaints/${complaintId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'NOT_A_STATUS' });
    expect(invalid.status).toBe(400);
  });
});
