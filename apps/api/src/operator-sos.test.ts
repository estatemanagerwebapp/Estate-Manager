/**
 * Operator SOS queue integration test.
 *
 * Covers the staff-only surface added on top of the resident S9 alerts:
 *
 *   - `GET /sos` requires `sos.read` and returns resident/property context;
 *   - `POST /sos/:id/acknowledge` and `/resolve` require `sos.manage`;
 *   - the lifecycle is RAISED → ACKNOWLEDGED → RESOLVED (terminal);
 *   - actors and the internal resolution note are persisted;
 *   - active/status filters and organization scoping;
 *   - both transitions are audited.
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
import { PrismaSosRepository } from './modules/resident/sos-repository.js';
import { OperatorSosService } from './modules/sos/operator-sos.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let otherOrganizationId = '';
let propertyId = '';
let guardCookie = '';
let auditorCookie = '';
let residentCookie = '';
let guardId = '';
let otherSosId = '';
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
): Promise<{ id: string; email: string; cookie: string }> {
  const email = `sos_${label}_${uniqueSuffix()}@example.com`;
  const user = await prisma.user.create({
    data: {
      organizationId: orgId,
      email,
      passwordHash: await hashPassword(PASSWORD),
      fullName: `${label} Operator`,
      role,
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { id: user.id, email, cookie: cookieFrom(login) };
}

async function createProperty(
  orgId: string,
  estate: PrismaEstateRepository,
  properties: PrismaPropertyRepository,
) {
  const parent = await estate.create({
    organizationId: orgId,
    name: 'SOS Estate',
    slug: `sos_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId: orgId,
    estateId: parent.id,
    kind: 'LAND',
    identifier: `SOS-${uniqueSuffix()}`,
    streetName: 'Test Street',
    plotNumber: '1',
    plotName: 'Test plot',
    name: null,
  });
  return property.id;
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
    data: { slug: `sos_operator_${uniqueSuffix()}`, name: 'SOS Operator Test' },
  });
  organizationId = org.id;
  const otherOrg = await prisma.organization.create({
    data: { slug: `sos_operator_other_${uniqueSuffix()}`, name: 'SOS Other Test' },
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
    sos: {
      sessions,
      permissions,
      organizationId,
      sos: new OperatorSosService({ sos: new PrismaSosRepository(prisma), audit }),
    },
  });

  const estates = new PrismaEstateRepository(prisma);
  const properties = new PrismaPropertyRepository(prisma);
  propertyId = await createProperty(organizationId, estates, properties);
  const otherPropertyId = await createProperty(otherOrganizationId, estates, properties);

  const guard = await createUser(organizationId, 'GUARD', 'guard');
  guardId = guard.id;
  guardCookie = guard.cookie;
  auditorCookie = (await createUser(organizationId, 'AUDITOR', 'auditor')).cookie;
  residentCookie = (await createUser(organizationId, 'RESIDENT', 'resident')).cookie;

  const otherResident = await prisma.user.create({
    data: {
      organizationId: otherOrganizationId,
      email: `sos_other_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      role: 'RESIDENT',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  const otherSos = await prisma.sosEvent.create({
    data: {
      organizationId: otherOrganizationId,
      userId: otherResident.id,
      propertyId: otherPropertyId,
      note: 'Other organization alert',
      status: 'RAISED',
    },
  });
  otherSosId = otherSos.id;
});

afterAll(async () => {
  const orgIds = [organizationId, otherOrganizationId];
  await prisma.sosEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.property.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.estate.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.session.deleteMany({ where: { user: { organizationId: { in: orgIds } } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await disconnectPrisma();
});

async function createSos(
  status: 'RAISED' | 'ACKNOWLEDGED' | 'RESOLVED' = 'RAISED',
  note = 'Smoke on the third floor.',
) {
  const resident = await prisma.user.findFirstOrThrow({
    where: { organizationId, role: 'RESIDENT' },
  });
  return prisma.sosEvent.create({
    data: {
      organizationId,
      userId: resident.id,
      propertyId,
      note,
      status,
      ...(status === 'ACKNOWLEDGED'
        ? { acknowledgedAt: new Date(), acknowledgedById: guardId }
        : {}),
      ...(status === 'RESOLVED'
        ? {
            acknowledgedAt: new Date(),
            acknowledgedById: guardId,
            resolvedAt: new Date(),
            resolvedById: guardId,
            resolutionNote: 'Handled by the estate office.',
          }
        : {}),
    },
  });
}

describe('operator SOS alerts', () => {
  it('rejects the routes without a session', async () => {
    expect((await request(app).get('/api/v1/sos')).status).toBe(401);
    expect((await request(app).post(`/api/v1/sos/${otherSosId}/acknowledge`)).status).toBe(401);
    expect((await request(app).post(`/api/v1/sos/${otherSosId}/resolve`)).status).toBe(401);
  });

  it('lets guards read the queue and keeps residents out', async () => {
    expect((await request(app).get('/api/v1/sos').set('Cookie', guardCookie)).status).toBe(200);
    expect((await request(app).get('/api/v1/sos').set('Cookie', residentCookie)).status).toBe(403);
    expect(
      (await request(app).post('/api/v1/sos/not-a-uuid/acknowledge').set('Cookie', guardCookie))
        .status,
    ).toBe(400);
  });

  it('lets auditors read but not acknowledge or resolve', async () => {
    const created = await createSos();
    expect((await request(app).get('/api/v1/sos').set('Cookie', auditorCookie)).status).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/v1/sos/${created.id}/acknowledge`)
          .set('Cookie', auditorCookie)
      ).status,
    ).toBe(403);
    expect(
      (await request(app).post(`/api/v1/sos/${created.id}/resolve`).set('Cookie', auditorCookie))
        .status,
    ).toBe(403);
  });

  it('returns resident/property context and applies the active filter', async () => {
    const raised = await createSos('RAISED', 'Loud alarm in the lobby.');
    const resolved = await createSos('RESOLVED', 'Already handled.');

    const active = await request(app).get('/api/v1/sos?active=true').set('Cookie', guardCookie);
    expect(active.status).toBe(200);
    const activeEvents = active.body.data.events as Array<Record<string, unknown>>;
    const activeIds = activeEvents.map((event) => event.id);
    expect(activeIds).toContain(raised.id);
    expect(activeIds).not.toContain(resolved.id);

    const event = activeEvents.find((entry) => entry.id === raised.id) as
      Record<string, unknown> | undefined;
    expect(event?.status).toBe('RAISED');
    expect((event?.resident as { fullName?: string }).fullName).toContain('resident');
    expect((event?.property as { identifier?: string }).identifier).toBeTruthy();

    const all = await request(app).get('/api/v1/sos').set('Cookie', guardCookie);
    expect(all.status).toBe(200);
    expect((all.body.data.events as Array<{ id: string }>).map((entry) => entry.id)).toContain(
      resolved.id,
    );

    const onlyResolved = await request(app)
      .get('/api/v1/sos?status=RESOLVED')
      .set('Cookie', guardCookie);
    expect(onlyResolved.status).toBe(200);
    expect(
      (onlyResolved.body.data.events as Array<{ id: string }>).map((entry) => entry.id),
    ).toContain(resolved.id);
    expect(
      (onlyResolved.body.data.events as Array<{ id: string }>).map((entry) => entry.id),
    ).not.toContain(raised.id);
  });

  it('requires acknowledgement before resolution and records both actors', async () => {
    const created = await createSos();

    const premature = await request(app)
      .post(`/api/v1/sos/${created.id}/resolve`)
      .set('Cookie', guardCookie)
      .send({ resolutionNote: 'Trying to close early' });
    expect(premature.status).toBe(409);

    const acknowledged = await request(app)
      .post(`/api/v1/sos/${created.id}/acknowledge`)
      .set('Cookie', guardCookie);
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body.data.event.status).toBe('ACKNOWLEDGED');
    expect(acknowledged.body.data.event.acknowledgedBy.id).toBe(guardId);
    expect(acknowledged.body.data.event.acknowledgedAt).toBeTruthy();

    const duplicate = await request(app)
      .post(`/api/v1/sos/${created.id}/acknowledge`)
      .set('Cookie', guardCookie);
    expect(duplicate.status).toBe(409);

    const resolved = await request(app)
      .post(`/api/v1/sos/${created.id}/resolve`)
      .set('Cookie', guardCookie)
      .send({ resolutionNote: 'Guard checked the floor; no fire found.' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.event.status).toBe('RESOLVED');
    expect(resolved.body.data.event.resolvedBy.id).toBe(guardId);
    expect(resolved.body.data.event.resolutionNote).toBe('Guard checked the floor; no fire found.');

    const stored = await prisma.sosEvent.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.acknowledgedById).toBe(guardId);
    expect(stored.resolvedById).toBe(guardId);
    expect(stored.resolutionNote).toBe('Guard checked the floor; no fire found.');

    const again = await request(app)
      .post(`/api/v1/sos/${created.id}/resolve`)
      .set('Cookie', guardCookie)
      .send({ resolutionNote: 'Second attempt' });
    expect(again.status).toBe(409);

    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        targetId: created.id,
        eventType: { in: ['sos_acknowledged', 'sos_resolved'] },
      },
    });
    expect(audits).toHaveLength(2);
    expect(audits.every((event) => event.actorId === guardId)).toBe(true);
    expect(audits.map((event) => event.eventType).sort()).toEqual([
      'sos_acknowledged',
      'sos_resolved',
    ]);
  });

  it('rejects a resolution note longer than 500 characters', async () => {
    const created = await createSos();
    await request(app)
      .post(`/api/v1/sos/${created.id}/acknowledge`)
      .set('Cookie', guardCookie)
      .expect(200);

    const response = await request(app)
      .post(`/api/v1/sos/${created.id}/resolve`)
      .set('Cookie', guardCookie)
      .send({ resolutionNote: 'x'.repeat(501) });
    expect(response.status).toBe(400);
  });

  it('never exposes another organization’s alert', async () => {
    const list = await request(app).get('/api/v1/sos').set('Cookie', guardCookie);
    expect(list.status).toBe(200);
    expect((list.body.data.events as Array<{ id: string }>).map((event) => event.id)).not.toContain(
      otherSosId,
    );

    expect(
      (await request(app).post(`/api/v1/sos/${otherSosId}/acknowledge`).set('Cookie', guardCookie))
        .status,
    ).toBe(404);
  });
});
