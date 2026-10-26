/**
 * Resident access codes routes (S4) integration test.
 *
 * Exercises the full S4 surface end to end:
 *
 *   - `GET /resident/codes` — the acting resident's codes (prefix + window,
 *     never the full secret).
 *   - `POST /resident/codes` — generate: returns the full code exactly once,
 *     stores only the hash + prefix, and audits `resident.code_generated`.
 *   - `POST /resident/codes/:id/extend` — pushes the validity window out and
 *     audits `resident.code_extended`.
 *   - `POST /resident/codes/:id/deactivate` — revokes the code and audits
 *     `resident.code_deactivated`.
 *   - self-scoping: a resident cannot extend or deactivate another
 *     resident's code (404).
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
import { PrismaAccessCodeRepository } from './modules/resident/codes-repository.js';
import { ResidentCodesService } from './modules/resident/codes.service.js';
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
let secondResidentUserId = '';
const ADMIN_PASSWORD = 'Sup3rSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

/**
 * Run the resident onboarding flow end to end and return the acting
 * resident's session cookie + user id.
 */
async function onboardResident(
  firstName: string,
  phone: string,
): Promise<{ cookie: string; userId: string }> {
  const registered = await request(app)
    .post('/api/v1/onboard/residents')
    .set('Cookie', adminCookie)
    .send({
      firstName,
      email: `code_${firstName.toLowerCase()}_${uniqueSuffix()}@example.com`,
      phone,
      propertyId,
    });
  expect(registered.status).toBe(201);
  const residentEmail = registered.body.data.resident.email as string;
  const residentId = registered.body.data.resident.id as string;
  const code = registered.body.data.onboardingCode as string;

  const saved = await request(app).patch(`/api/v1/onboard/by-code/${code}`).send({
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
    data: { idDocumentUrl: `/media/${organizationId}/code-doc-${firstName}` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: `CODE-${firstName}-001` });
  expect(paid.status).toBe(200);
  expect(paid.body.data.user).toBeDefined();

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
    data: { slug: `codes_test_${uniqueSuffix()}`, name: 'Codes Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `code_admin_${uniqueSuffix()}@example.com`,
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
    name: 'Codes Estate',
    slug: `cod_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    typeKey: 'house',
    identifier: `CODE-${uniqueSuffix()}`,
    unitTypeKey: null,
    parentPropertyId: null,
    addressComponents: { plot: '9', street: 'Gate Road', city: 'Lagos' },
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

  const residentCodesService = new ResidentCodesService({
    codes: new PrismaAccessCodeRepository(prisma),
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
      codes: residentCodesService,
    },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  const first = await onboardResident('Ada', '+2348001110001');
  residentCookie = first.cookie;
  residentUserId = first.userId;

  const second = await onboardResident('Bode', '+2348001110002');
  secondResidentCookie = second.cookie;
  secondResidentUserId = second.userId;
});

afterAll(async () => {
  await prisma.accessCode.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

describe('resident access codes (S4)', () => {
  it('rejects the code routes without a session', async () => {
    expect((await request(app).get('/api/v1/resident/codes')).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/resident/codes').send({ kind: 'ENTRY' })).status,
    ).toBe(401);
  });

  it('generates a code, returns the full code once, and stores only the hash + prefix', async () => {
    const response = await request(app)
      .post('/api/v1/resident/codes')
      .set('Cookie', residentCookie)
      .send({ kind: 'ENTRY', durationDays: 30 });
    expect(response.status).toBe(201);
    expect(response.body.data.ok).toBe(true);

    const fullCode = response.body.data.code as string;
    const codeId = response.body.data.codeId as string;
    expect(fullCode).toHaveLength(8);
    expect(codeId).toBeDefined();

    // The row stores the hash and a 4-character prefix — never the plaintext.
    const row = await prisma.accessCode.findUnique({ where: { id: codeId } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(residentUserId);
    expect(row!.kind).toBe('ENTRY');
    expect(row!.status).toBe('ACTIVE');
    expect(row!.codePrefix).toBe(fullCode.slice(0, 4));
    expect(row!.codeHash).not.toBe(fullCode);
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(fullCode);

    // The 30-day window is set.
    const windowMs = (row!.validUntil!.getTime() - row!.issuedAt.getTime()) / 86_400_000;
    expect(Math.round(windowMs)).toBe(30);

    // The audit event was written.
    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_code_generated' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('lists the codes without ever exposing the full secret', async () => {
    const response = await request(app)
      .get('/api/v1/resident/codes')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { codes } = response.body.data;
    expect(codes.length).toBe(1);
    expect(codes[0].kind).toBe('ENTRY');
    expect(codes[0].status).toBe('ACTIVE');
    expect(codes[0].codePrefix).toHaveLength(4);
    expect(codes[0].validUntil).toBeTruthy();

    // The list carries no full code field at all.
    const serialized = JSON.stringify(response.body);
    const stored = await prisma.accessCode.findFirst({
      where: { organizationId, userId: residentUserId },
    });
    expect(stored).not.toBeNull();
    expect(serialized).not.toContain(stored!.codeHash);
    // Only the 4-char prefix of the secret may appear.
    expect(serialized).not.toMatch(/[A-Z0-9]{8}/);
  });

  it('extends the validity window', async () => {
    const before = await prisma.accessCode.findFirst({
      where: { organizationId, userId: residentUserId },
    });
    const beforeUntil = before!.validUntil!.getTime();

    const response = await request(app)
      .post(`/api/v1/resident/codes/${before!.id}/extend`)
      .set('Cookie', residentCookie)
      .send({ durationDays: 30 });
    expect(response.status).toBe(200);
    expect(response.body.data.ok).toBe(true);
    expect(response.body.data.code.id).toBe(before!.id);

    const after = await prisma.accessCode.findUnique({ where: { id: before!.id } });
    expect(after!.validUntil!.getTime()).toBeGreaterThan(beforeUntil);

    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_code_extended' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('deactivates a code and refuses to deactivate it twice', async () => {
    const code = await prisma.accessCode.findFirst({
      where: { organizationId, userId: residentUserId },
    });
    expect(code).not.toBeNull();

    const response = await request(app)
      .post(`/api/v1/resident/codes/${code!.id}/deactivate`)
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.ok).toBe(true);
    expect(response.body.data.code.status).toBe('REVOKED');
    expect(response.body.data.code.revokedAt).toBeTruthy();

    const after = await prisma.accessCode.findUnique({ where: { id: code!.id } });
    expect(after!.status).toBe('REVOKED');
    expect(after!.revokedAt).not.toBeNull();

    // Deactivating twice is a conflict.
    const again = await request(app)
      .post(`/api/v1/resident/codes/${code!.id}/deactivate`)
      .set('Cookie', residentCookie);
    expect(again.status).toBe(409);

    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_code_deactivated' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('enforces self-scoping: a resident cannot touch another resident\'s code', async () => {
    // The second resident generates their own code.
    const generated = await request(app)
      .post('/api/v1/resident/codes')
      .set('Cookie', secondResidentCookie)
      .send({ kind: 'BOTH' });
    expect(generated.status).toBe(201);
    const secondCodeId = generated.body.data.codeId as string;

    // The first resident cannot extend it.
    const extend = await request(app)
      .post(`/api/v1/resident/codes/${secondCodeId}/extend`)
      .set('Cookie', residentCookie)
      .send({ durationDays: 30 });
    expect(extend.status).toBe(404);

    // Nor deactivate it.
    const deactivate = await request(app)
      .post(`/api/v1/resident/codes/${secondCodeId}/deactivate`)
      .set('Cookie', residentCookie);
    expect(deactivate.status).toBe(404);

    // The code is untouched.
    const row = await prisma.accessCode.findUnique({ where: { id: secondCodeId } });
    expect(row!.status).toBe('ACTIVE');
    expect(row!.revokedAt).toBeNull();
    expect(row!.userId).toBe(secondResidentUserId);
  });

  it('keeps each resident\'s code list independent', async () => {
    const first = await request(app)
      .get('/api/v1/resident/codes')
      .set('Cookie', residentCookie);
    expect(first.status).toBe(200);
    expect(first.body.data.codes).toHaveLength(1);
    expect(first.body.data.codes[0].status).toBe('REVOKED');

    const second = await request(app)
      .get('/api/v1/resident/codes')
      .set('Cookie', secondResidentCookie);
    expect(second.status).toBe(200);
    expect(second.body.data.codes).toHaveLength(1);
    expect(second.body.data.codes[0].status).toBe('ACTIVE');
    expect(second.body.data.codes[0].kind).toBe('BOTH');
  });

  it('rejects an invalid duration', async () => {
    const response = await request(app)
      .post('/api/v1/resident/codes')
      .set('Cookie', residentCookie)
      .send({ kind: 'ENTRY', durationDays: 9999 });
    expect(response.status).toBe(400);
  });
});
