/**
 * Operator gate access (Phase 6) integration test.
 *
 * Covers:
 *
 *   - `GET /access-codes` requires `gate.read` and never returns the hash;
 *   - derived ACTIVE/EXPIRED/REVOKED filters and kind filtering;
 *   - guard verification grants, denies revoked/expired/wrong-direction and
 *     unknown codes, and normalizes case/whitespace;
 *   - `GET /verifications` requires `verification.read`, while recording an
 *     attempt requires `gate.manage`;
 *   - residents are kept out and auditors remain read-only;
 *   - organization scoping, malformed filters and audit events.
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
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { PrismaAccessCodeRepository } from './modules/resident/codes-repository.js';
import { PrismaGateRepository } from './modules/gate/gate-repository.js';
import { OperatorGateService } from './modules/gate/gate.service.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let otherOrganizationId = '';
let propertyId = '';
let residentId = '';
let guardId = '';
let guardCookie = '';
let auditorCookie = '';
let residentCookie = '';
let entryCode = '';
let exitCode = '';
let revokedCode = '';
let expiredCode = '';
let otherCode = '';
let otherVerificationId = '';

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
  const email = `gate_${label}_${uniqueSuffix()}@example.com`;
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
    name: `Gate ${label} Estate`,
    slug: `gate_${label}_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId: orgId,
    estateId: estate.id,
    kind: 'HOUSE',
    identifier: `GATE-${uniqueSuffix()}`,
    streetName: 'Test Street',
    plotNumber: '1',
    plotName: 'Test plot',
    name: 'Gate House',
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
    data: { slug: `gate_operator_${uniqueSuffix()}`, name: 'Gate Operator Test' },
  });
  organizationId = org.id;
  const otherOrg = await prisma.organization.create({
    data: { slug: `gate_other_${uniqueSuffix()}`, name: 'Gate Other Test' },
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
  const gateRepo = new PrismaGateRepository(prisma);

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
    gate: {
      sessions,
      permissions,
      organizationId,
      gate: new OperatorGateService({ gate: gateRepo, audit }),
    },
  });

  propertyId = await createProperty(organizationId, 'main');
  const otherPropertyId = await createProperty(otherOrganizationId, 'other');

  const guard = await createUser(organizationId, 'GUARD', 'guard', 'Gate Guard');
  guardId = guard.id;
  guardCookie = guard.cookie;
  auditorCookie = (await createUser(organizationId, 'AUDITOR', 'auditor', 'Gate Auditor')).cookie;
  const resident = await createUser(organizationId, 'RESIDENT', 'resident', 'Ada Okafor');
  residentId = resident.id;
  residentCookie = resident.cookie;

  await prisma.residentOnboarding.create({
    data: {
      organizationId,
      propertyId,
      status: 'COMPLETED',
      codeHash: createHash('sha256').update(`gate_${uniqueSuffix()}`).digest('hex'),
      firstName: 'Ada',
      email: resident.email,
      phone: '+2348000000000',
      paymentStatus: 'PAID',
      paidAt: new Date(),
      completedAt: new Date(),
      userId: residentId,
    },
  });

  const codes = new PrismaAccessCodeRepository(prisma);
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const entry = await codes.create({
    organizationId,
    userId: residentId,
    propertyId,
    kind: 'ENTRY',
    validUntil: future,
    codeLength: 8,
  });
  entryCode = entry.code;
  const exit = await codes.create({
    organizationId,
    userId: residentId,
    propertyId,
    kind: 'EXIT',
    validUntil: future,
    codeLength: 8,
  });
  exitCode = exit.code;
  const revoked = await codes.create({
    organizationId,
    userId: residentId,
    propertyId,
    kind: 'BOTH',
    validUntil: future,
    codeLength: 8,
  });
  revokedCode = revoked.code;
  await codes.revoke(revoked.record.id, new Date());
  const expired = await codes.create({
    organizationId,
    userId: residentId,
    propertyId,
    kind: 'BOTH',
    validUntil: past,
    codeLength: 8,
  });
  expiredCode = expired.code;

  const otherResident = await prisma.user.create({
    data: {
      organizationId: otherOrganizationId,
      email: `gate_other_resident_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      fullName: 'Other Resident',
      role: 'RESIDENT',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  const other = await codes.create({
    organizationId: otherOrganizationId,
    userId: otherResident.id,
    propertyId: otherPropertyId,
    kind: 'BOTH',
    validUntil: future,
    codeLength: 8,
  });
  otherCode = other.code;
  const otherVerification = await prisma.accessVerification.create({
    data: {
      organizationId: otherOrganizationId,
      accessCodeId: other.record.id,
      residentId: otherResident.id,
      propertyId: otherPropertyId,
      gate: 'ENTRY',
      outcome: 'GRANTED',
      codePrefix: other.code.slice(0, 4),
    },
  });
  otherVerificationId = otherVerification.id;
});

afterAll(async () => {
  const orgIds = [organizationId, otherOrganizationId];
  await prisma.accessVerification.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.accessCode.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.property.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.estate.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.session.deleteMany({ where: { user: { organizationId: { in: orgIds } } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await disconnectPrisma();
});

describe('operator gate access', () => {
  it('rejects unauthenticated access, residents and read-only verification attempts', async () => {
    expect((await request(app).get('/api/v1/access-codes')).status).toBe(401);
    expect((await request(app).get('/api/v1/verifications')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/access-codes').set('Cookie', residentCookie)).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/verifications').set('Cookie', residentCookie)).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/access-codes').set('Cookie', auditorCookie)).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/v1/verifications').set('Cookie', auditorCookie)).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/v1/verifications')
          .set('Cookie', auditorCookie)
          .send({ code: entryCode, gate: 'ENTRY' })
      ).status,
    ).toBe(403);
  });

  it('lists access codes with resident context and derived status filters', async () => {
    const all = await request(app).get('/api/v1/access-codes').set('Cookie', guardCookie);
    expect(all.status).toBe(200);
    const codes = all.body.data.codes as Array<{
      id: string;
      status: string;
      codePrefix: string;
      resident: { fullName: string } | null;
      property: { identifier: string } | null;
    }>;
    expect(codes.length).toBe(4);
    expect(codes.some((code) => code.resident?.fullName === 'Ada Okafor')).toBe(true);
    expect(codes.some((code) => code.property?.identifier)).toBe(true);
    expect(JSON.stringify(all.body)).not.toContain('codeHash');

    const active = await request(app)
      .get('/api/v1/access-codes?status=ACTIVE')
      .set('Cookie', guardCookie);
    expect(active.status).toBe(200);
    expect(
      (active.body.data.codes as Array<{ status: string }>).every(
        (code) => code.status === 'ACTIVE',
      ),
    ).toBe(true);
    expect(active.body.data.codes).toHaveLength(2);

    const expired = await request(app)
      .get('/api/v1/access-codes?status=EXPIRED')
      .set('Cookie', guardCookie);
    expect(expired.status).toBe(200);
    expect(expired.body.data.codes).toHaveLength(1);

    const revoked = await request(app)
      .get('/api/v1/access-codes?status=REVOKED')
      .set('Cookie', guardCookie);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.codes).toHaveLength(1);

    const exit = await request(app)
      .get('/api/v1/access-codes?kind=EXIT')
      .set('Cookie', guardCookie);
    expect(exit.status).toBe(200);
    expect(exit.body.data.codes).toHaveLength(1);
  });

  it('rejects invalid filters', async () => {
    expect(
      (await request(app).get('/api/v1/access-codes?status=BOGUS').set('Cookie', guardCookie))
        .status,
    ).toBe(400);
    expect(
      (await request(app).get('/api/v1/access-codes?limit=0').set('Cookie', guardCookie)).status,
    ).toBe(400);
    expect(
      (await request(app).get('/api/v1/verifications?outcome=BOGUS').set('Cookie', guardCookie))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/verifications')
          .set('Cookie', guardCookie)
          .send({ code: entryCode, gate: 'SIDEWAYS' })
      ).status,
    ).toBe(400);
  });

  it('grants an active code, normalizes input and audits the attempt', async () => {
    const response = await request(app)
      .post('/api/v1/verifications')
      .set('Cookie', guardCookie)
      .send({ code: ` ${entryCode.toLowerCase()} `, gate: 'ENTRY' });
    expect(response.status).toBe(201);
    const verification = response.body.data.verification as {
      id: string;
      outcome: string;
      reason: string | null;
      gate: string;
      codePrefix: string;
      resident: { fullName: string } | null;
      property: { identifier: string } | null;
      verifiedBy: { id: string } | null;
    };
    expect(verification.outcome).toBe('GRANTED');
    expect(verification.reason).toBeNull();
    expect(verification.gate).toBe('ENTRY');
    expect(verification.codePrefix).toBe(entryCode.slice(0, 4));
    expect(verification.resident?.fullName).toBe('Ada Okafor');
    expect(verification.property?.identifier).toBeTruthy();
    expect(verification.verifiedBy?.id).toBe(guardId);

    const audit = await prisma.auditEvent.findFirst({
      where: { organizationId, targetId: verification.id, eventType: 'verification_recorded' },
    });
    expect(audit?.actorId).toBe(guardId);
    expect(audit?.targetType).toBe('access_verification');
  });

  it('denies wrong-direction, revoked, expired and unknown codes', async () => {
    const wrongDirection = await request(app)
      .post('/api/v1/verifications')
      .set('Cookie', guardCookie)
      .send({ code: exitCode, gate: 'ENTRY' });
    expect(wrongDirection.status).toBe(201);
    expect(wrongDirection.body.data.verification.reason).toBe('WRONG_DIRECTION');

    const revoked = await request(app)
      .post('/api/v1/verifications')
      .set('Cookie', guardCookie)
      .send({ code: revokedCode, gate: 'ENTRY' });
    expect(revoked.body.data.verification.reason).toBe('REVOKED');

    const expired = await request(app)
      .post('/api/v1/verifications')
      .set('Cookie', guardCookie)
      .send({ code: expiredCode, gate: 'ENTRY' });
    expect(expired.body.data.verification.reason).toBe('EXPIRED');

    const unknown = await request(app)
      .post('/api/v1/verifications')
      .set('Cookie', guardCookie)
      .send({ code: 'ZZZZZZZZ', gate: 'EXIT' });
    expect(unknown.status).toBe(201);
    expect(unknown.body.data.verification.outcome).toBe('DENIED');
    expect(unknown.body.data.verification.reason).toBe('NOT_FOUND');
    expect(unknown.body.data.verification.accessCodeId).toBeNull();
  });

  it('does not verify another organization’s code and scopes history', async () => {
    const response = await request(app)
      .post('/api/v1/verifications')
      .set('Cookie', guardCookie)
      .send({ code: otherCode, gate: 'ENTRY' });
    expect(response.status).toBe(201);
    expect(response.body.data.verification.reason).toBe('NOT_FOUND');

    const history = await request(app).get('/api/v1/verifications').set('Cookie', guardCookie);
    expect(history.status).toBe(200);
    const entries = history.body.data.verifications as Array<{
      id: string;
      resident: { id: string } | null;
    }>;
    expect(entries.some((entry) => entry.resident?.id === residentId)).toBe(true);
    expect(entries.some((entry) => entry.id === otherVerificationId)).toBe(false);
  });

  it('filters verification history by outcome and gate', async () => {
    const denied = await request(app)
      .get('/api/v1/verifications?outcome=DENIED')
      .set('Cookie', auditorCookie);
    expect(denied.status).toBe(200);
    expect(
      (denied.body.data.verifications as Array<{ outcome: string }>).every(
        (entry) => entry.outcome === 'DENIED',
      ),
    ).toBe(true);
    expect(denied.body.data.verifications.length).toBeGreaterThanOrEqual(4);

    const exitOnly = await request(app)
      .get('/api/v1/verifications?gate=EXIT')
      .set('Cookie', auditorCookie);
    expect(exitOnly.status).toBe(200);
    expect(exitOnly.body.data.verifications).toHaveLength(1);
    expect(exitOnly.body.data.verifications[0].gate).toBe('EXIT');
  });
});
