/**
 * Resident finance routes (S3) integration test.
 *
 * Exercises the full S3 surface end to end:
 *
 *   - registration-fee seed: when the account is created (via `markPaid`
 *     immediate path), the finance service writes the first invoice +
 *     payment + transaction so the ledger is never empty.
 *   - `GET /resident/finance` — the acting resident's 4-section view:
 *     outstanding (empty after seed), paid (the seeded invoice),
 *     payments (the seeded settlement), transactions (4 ledger entries).
 *   - `POST /resident/payments` — recording a payment against an
 *     outstanding invoice: creates a Payment row, flips the invoice
 *     PAID, writes two ledger entries, audits `resident.payment_recorded`.
 *   - self-scoping: a resident cannot read or pay another resident's
 *     invoices (404 on someone else's invoice id).
 *   - unauthenticated callers get 401.
 *
 * The finance service is wired into the test app via
 * `resident.finance` so both the seed hook and the live routes run.
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
import { PrismaFinanceRepository } from './modules/resident/finance-repository.js';
import { ResidentFinanceService } from './modules/resident/finance.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let propertyId = '';
let residentCookie = '';
let residentId = '';
let residentUserId = '';
let secondResidentCookie = '';
let secondResidentId = '';
let secondResidentUserId = '';
const ADMIN_EMAIL = 'finance_admin@example.com';
const ADMIN_PASSWORD = 'Sup3rSecretXyz';
const RESIDENT_EMAIL = 'finance_resident@example.com';
const SECOND_RESIDENT_EMAIL = 'finance_second@example.com';

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
    data: { slug: `finance_test_${uniqueSuffix()}`, name: 'Finance Test' },
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

  const estates = new PrismaEstateRepository(prisma);
  const properties = new PrismaPropertyRepository(prisma);
  const estate = await estates.create({
    organizationId,
    name: 'Finance Estate',
    slug: `fin_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    typeKey: 'house',
    identifier: `FIN-${uniqueSuffix()}`,
    unitTypeKey: null,
    parentPropertyId: null,
    addressComponents: { plot: '42', street: 'Market Road', city: 'Abuja' },
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
  const financeRepo = new PrismaFinanceRepository(prisma);
  const residentFinanceService = new ResidentFinanceService({
    finance: financeRepo,
    audit,
    registrationFee: async () => ({ amountKobo: 5_000_000, currency: 'NGN' }),
  });

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
    async (hook) => {
      await residentFinanceService.seedRegistrationFee(
        hook.organizationId,
        hook.userId,
        hook.propertyId,
        hook.requestId,
      );
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
      finance: residentFinanceService,
    },
  });

  // Admin session.
  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  // Primary resident: register → autosave → attach ID doc → mark paid.
  const registered = await request(app)
    .post('/api/v1/onboard/residents')
    .set('Cookie', adminCookie)
    .send({
      firstName: 'Finance',
      email: `${RESIDENT_EMAIL.split('@')[0]}_${uniqueSuffix()}@example.com`,
      phone: '+2348001112223',
      propertyId,
    });
  expect(registered.status).toBe(201);
  const residentEmail = registered.body.data.resident.email as string;
  residentId = registered.body.data.resident.id as string;
  const code = registered.body.data.onboardingCode as string;

  await request(app)
    .patch(`/api/v1/onboard/by-code/${code}`)
    .send({
      gender: 'MALE',
      maritalStatus: 'SINGLE',
      nextOfKinName: 'Kin A',
      nextOfKinPhone: '+2348004445556',
      nextOfKinEmail: 'kinya@example.com',
      idType: 'NATIONAL_ID',
    })
    .then(async (saved) => {
      expect(saved.status).toBe(200);
    });

  await prisma.residentOnboarding.update({
    where: { id: residentId },
    data: { idDocumentUrl: `/media/${organizationId}/fin-doc` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: 'FIN-CASH-001' });
  expect(paid.status).toBe(200);
  expect(paid.body.data.user).toBeDefined();
  residentUserId = paid.body.data.user.id as string;
  const demoPassword = paid.body.data.demoPassword as string;

  const residentLogin = await request(app).post('/api/v1/auth/login').send({
    email: residentEmail,
    password: demoPassword,
  });
  expect(residentLogin.status).toBe(200);
  residentCookie = cookieFrom(residentLogin);

  // Second resident (for the self-scoping test): same flow.
  const registered2 = await request(app)
    .post('/api/v1/onboard/residents')
    .set('Cookie', adminCookie)
    .send({
      firstName: 'Second',
      email: `${SECOND_RESIDENT_EMAIL.split('@')[0]}_${uniqueSuffix()}@example.com`,
      phone: '+2348003334445',
      propertyId,
    });
  expect(registered2.status).toBe(201);
  const secondEmail = registered2.body.data.resident.email as string;
  secondResidentId = registered2.body.data.resident.id as string;
  const code2 = registered2.body.data.onboardingCode as string;

  const savedSecond = await request(app).patch(`/api/v1/onboard/by-code/${code2}`).send({
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    nextOfKinName: 'Kin B',
    nextOfKinPhone: '+2348006667778',
    nextOfKinEmail: 'kinb@example.com',
    idType: 'INTERNATIONAL_PASSPORT',
  });
  expect(savedSecond.status).toBe(200);

  await prisma.residentOnboarding.update({
    where: { id: secondResidentId },
    data: { idDocumentUrl: `/media/${organizationId}/fin-doc-2` },
  });

  const paid2 = await request(app)
    .post(`/api/v1/onboard/residents/${secondResidentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: 'FIN-CASH-002' });
  expect(paid2.status).toBe(200);
  expect(paid2.body.data.user).toBeDefined();
  secondResidentUserId = paid2.body.data.user.id as string;
  const secondDemoPassword = paid2.body.data.demoPassword as string;

  const secondLogin = await request(app).post('/api/v1/auth/login').send({
    email: secondEmail,
    password: secondDemoPassword,
  });
  expect(secondLogin.status).toBe(200);
  secondResidentCookie = cookieFrom(secondLogin);
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.payment.deleteMany({ where: { organizationId } });
  await prisma.invoice.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Seed a second, UNPAID invoice for the acting resident directly in the
 * database so the pay flow has something to settle (the seed only covers
 * the registration fee; recurring invoices would come from a billing job
 * in production, which is out of scope for S3).
 */
async function seedOutstandingInvoice(invoicePeriod: string): Promise<string> {
  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      userId: residentUserId,
      propertyId,
      period: invoicePeriod,
      amountKobo: 2_000_000,
      currency: 'NGN',
      status: 'UNPAID',
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  // A matching ledger debit (invoice issued, money owed).
  await prisma.transaction.create({
    data: {
      organizationId,
      userId: residentUserId,
      kind: 'INVOICE',
      amountKobo: 2_000_000,
      signed: -2_000_000,
      memo: `${invoicePeriod} issued`,
      reference: invoice.id,
    },
  });
  return invoice.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resident finance (S3)', () => {
  it('rejects the finance routes without a session', async () => {
    expect((await request(app).get('/api/v1/resident/finance')).status).toBe(401);
    expect((await request(app).post('/api/v1/resident/payments').send({})).status).toBe(401);
  });

  it('seeds the registration-fee invoice + payment + transaction at account creation', async () => {
    // The seed ran during `markPaid` in `beforeAll`. Verify all four rows
    // exist for the primary resident.
    const invoice = await prisma.invoice.findFirst({
      where: { organizationId, userId: residentUserId, period: 'Registration fee' },
    });
    expect(invoice).not.toBeNull();
    expect(invoice!.status).toBe('PAID');
    expect(invoice!.amountKobo).toBe(5_000_000);

    const payment = await prisma.payment.findFirst({
      where: { organizationId, userId: residentUserId, invoiceId: invoice!.id },
    });
    expect(payment).not.toBeNull();
    expect(payment!.method).toBe('ADMIN');

    const ledger = await prisma.transaction.findMany({
      where: { organizationId, userId: residentUserId },
    });
    // Two entries from the seed: PAYMENT (credit +5 000 000) and
    // INVOICE (debit -5 000 000).
    const credit = ledger.find((t) => t.kind === 'PAYMENT' && t.signed > 0);
    const debit = ledger.find((t) => t.kind === 'INVOICE' && t.signed < 0);
    expect(credit?.signed).toBe(5_000_000);
    expect(debit?.signed).toBe(-5_000_000);

    // The seed audit event exists.
    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_invoice_created' },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  it('returns the 4-section finance view with the seeded paid invoice', async () => {
    const response = await request(app)
      .get('/api/v1/resident/finance')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const view = response.body.data;
    // The seeded invoice is PAID, so it sits in `paid`, not `outstanding`.
    expect(view.outstanding).toHaveLength(0);
    expect(view.paid).toHaveLength(1);
    expect(view.paid[0].period).toBe('Registration fee');
    expect(view.paid[0].status).toBe('PAID');
    expect(view.payments).toHaveLength(1);
    expect(view.payments[0].method).toBe('ADMIN');
    expect(view.transactions.length).toBe(2);
  });

  it('records a payment against an outstanding invoice and flips it PAID', async () => {
    const invoiceId = await seedOutstandingInvoice('2026-11');

    // The invoice shows up in the `outstanding` section now.
    const before = await request(app)
      .get('/api/v1/resident/finance')
      .set('Cookie', residentCookie);
    expect(before.status).toBe(200);
    expect(before.body.data.outstanding.some((i: { id: string }) => i.id === invoiceId)).toBe(true);

    const response = await request(app)
      .post('/api/v1/resident/payments')
      .set('Cookie', residentCookie)
      .send({ invoiceId, method: 'CASH', reference: 'REC-2026-11' });
    expect(response.status).toBe(200);
    expect(response.body.data.ok).toBe(true);

    // The Payment row was written.
    const payment = await prisma.payment.findFirst({
      where: { organizationId, userId: residentUserId, invoiceId },
    });
    expect(payment).not.toBeNull();
    expect(payment!.amountKobo).toBe(2_000_000);
    expect(payment!.method).toBe('CASH');
    expect(payment!.reference).toBe('REC-2026-11');

    // The invoice flipped PAID.
    const updated = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(updated!.status).toBe('PAID');

    // Two new ledger entries: PAYMENT (credit +2 000 000) and
    // INVOICE-settled (debit -2 000 000).
    const credit = await prisma.transaction.findFirst({
      where: { organizationId, userId: residentUserId, kind: 'PAYMENT', reference: payment!.id },
    });
    expect(credit).not.toBeNull();
    expect(credit!.signed).toBe(2_000_000);

    const settledDebit = await prisma.transaction.findFirst({
      where: { organizationId, userId: residentUserId, kind: 'INVOICE', reference: invoiceId, memo: { contains: 'settled' } },
    });
    expect(settledDebit).not.toBeNull();
    expect(settledDebit!.signed).toBe(-2_000_000);

    // The audit event was recorded.
    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_payment_recorded' },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 409 when the invoice is already paid', async () => {
    // The registration-fee invoice was seeded PAID in `beforeAll`.
    const paidInvoice = await prisma.invoice.findFirst({
      where: { organizationId, userId: residentUserId, period: 'Registration fee' },
    });
    expect(paidInvoice).not.toBeNull();

    const response = await request(app)
      .post('/api/v1/resident/payments')
      .set('Cookie', residentCookie)
      .send({ invoiceId: paidInvoice!.id, method: 'CASH' });
    expect(response.status).toBe(409);
  });

  it('returns 404 when the invoice does not exist', async () => {
    const response = await request(app)
      .post('/api/v1/resident/payments')
      .set('Cookie', residentCookie)
      .send({ invoiceId: '00000000-0000-0000-0000-000000000000', method: 'CASH' });
    expect(response.status).toBe(404);
  });

  it('enforces self-scoping: a resident cannot pay another resident\'s invoice', async () => {
    // The primary resident's invoice (seeded in the previous test, now PAID,
    // but still owned by the primary resident). Fetch its id, then have the
    // second resident try to pay it.
    const primaryInvoice = await prisma.invoice.findFirst({
      where: { organizationId, userId: residentUserId, period: 'Registration fee' },
    });
    expect(primaryInvoice).not.toBeNull();

    const response = await request(app)
      .post('/api/v1/resident/payments')
      .set('Cookie', secondResidentCookie)
      .send({ invoiceId: primaryInvoice!.id, method: 'CASH', reference: 'X' });
    // 404: never reveals whether another user's invoice exists with this id.
    expect(response.status).toBe(404);
  });

  it('the second resident sees their own seeded finance view (independent of the first)', async () => {
    const response = await request(app)
      .get('/api/v1/resident/finance')
      .set('Cookie', secondResidentCookie);
    expect(response.status).toBe(200);

    const view = response.body.data;
    // Both residents were seeded the same 5 000 000 N registration fee.
    expect(view.paid).toHaveLength(1);
    expect(view.paid[0].period).toBe('Registration fee');
    expect(view.outstanding).toHaveLength(0);
    expect(view.payments).toHaveLength(1);
    expect(view.transactions.length).toBe(2);

    // Confirm this is the second resident's rows, not the first's.
    const secondInvoice = view.paid[0];
    const dbRow = await prisma.invoice.findUnique({ where: { id: secondInvoice.id } });
    expect(dbRow!.userId).toBe(secondResidentUserId);
  });
});
