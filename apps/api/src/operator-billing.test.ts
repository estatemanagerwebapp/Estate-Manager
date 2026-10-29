/**
 * Operator manual billing (Phase 5) integration test.
 *
 * Covers the staff invoice/payment surface end to end:
 *
 *   - `GET /invoices` and `GET /payments` require `billing.read`;
 *   - issuing/voiding requires `billing.manage`, recording a payment requires
 *     `payment.verify`, and residents are kept out;
 *   - invoices carry resident/property context and the issuing actor;
 *   - a recorded payment settles the invoice and writes the resident ledger;
 *   - voiding is limited to unpaid invoices and is audited;
 *   - residents can see and pay an operator-issued invoice;
 *   - organization scoping, malformed ids and invalid filters are rejected.
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
import { PrismaFinanceRepository } from './modules/resident/finance-repository.js';
import { ResidentFinanceService } from './modules/resident/finance.service.js';
import { OperatorBillingService } from './modules/billing/operator-billing.service.js';
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
let otherResidentId = '';
let adminCookie = '';
let auditorCookie = '';
let residentCookie = '';
let otherInvoiceId = '';
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
  const email = `billing_${label}_${uniqueSuffix()}@example.com`;
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
    name: `Billing ${label} Estate`,
    slug: `billing_${label}_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId: orgId,
    estateId: estate.id,
    kind: 'HOUSE',
    identifier: `BILL-${uniqueSuffix()}`,
    streetName: 'Test Street',
    plotNumber: '1',
    plotName: 'Test plot',
    name: 'Billing House',
  });
  return property.id;
}

async function issueInvoice(overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/v1/invoices')
    .set('Cookie', adminCookie)
    .send({
      residentId,
      period: `2026-11-${uniqueSuffix()}`,
      amountKobo: 2_500_000,
      dueAt: '2026-11-30T00:00:00.000Z',
      ...overrides,
    });
  expect(response.status).toBe(201);
  return response.body.data.invoice as {
    id: string;
    amountKobo: number;
    status: string;
    period: string;
    paidKobo: number;
    resident: { id: string; fullName: string | null } | null;
    property: { identifier: string } | null;
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
    data: { slug: `billing_operator_${uniqueSuffix()}`, name: 'Billing Operator Test' },
  });
  organizationId = org.id;
  const otherOrg = await prisma.organization.create({
    data: { slug: `billing_other_${uniqueSuffix()}`, name: 'Billing Other Test' },
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
  const financeRepo = new PrismaFinanceRepository(prisma);
  const residentFinanceService = new ResidentFinanceService({
    finance: financeRepo,
    audit,
    registrationFee: async () => ({ amountKobo: 5_000_000, currency: 'NGN' }),
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
    billing: {
      sessions,
      permissions,
      organizationId,
      billing: new OperatorBillingService({ finance: financeRepo, audit }),
    },
    resident: {
      sessions,
      permissions,
      organizationId,
      finance: residentFinanceService,
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
      codeHash: createHash('sha256').update(`billing_${uniqueSuffix()}`).digest('hex'),
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
      email: `billing_other_resident_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      fullName: 'Other Resident',
      role: 'RESIDENT',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  otherResidentId = otherResident.id;
  const otherInvoice = await prisma.invoice.create({
    data: {
      organizationId: otherOrganizationId,
      userId: otherResidentId,
      propertyId: otherPropertyId,
      period: '2026-11',
      amountKobo: 1_000_000,
      dueAt: new Date('2026-11-30T00:00:00.000Z'),
    },
  });
  otherInvoiceId = otherInvoice.id;
});

afterAll(async () => {
  const orgIds = [organizationId, otherOrganizationId];
  await prisma.transaction.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.property.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.estate.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.session.deleteMany({ where: { user: { organizationId: { in: orgIds } } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await disconnectPrisma();
});

describe('operator billing', () => {
  it('rejects unauthenticated access, residents and read-only auditors', async () => {
    expect((await request(app).get('/api/v1/invoices')).status).toBe(401);
    expect((await request(app).get('/api/v1/payments')).status).toBe(401);
    expect((await request(app).get('/api/v1/invoices').set('Cookie', auditorCookie)).status).toBe(
      200,
    );
    expect((await request(app).get('/api/v1/invoices').set('Cookie', residentCookie)).status).toBe(
      403,
    );

    const deniedIssue = await request(app)
      .post('/api/v1/invoices')
      .set('Cookie', auditorCookie)
      .send({
        residentId,
        period: '2026-11',
        amountKobo: 1_000,
        dueAt: '2026-11-30T00:00:00.000Z',
      });
    expect(deniedIssue.status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/invoices/00000000-0000-0000-0000-000000000000/payments')
          .set('Cookie', auditorCookie)
          .send({ method: 'CASH' })
      ).status,
    ).toBe(403);
  });

  it('issues an invoice with resident/property context and audits it', async () => {
    const invoice = await issueInvoice();
    expect(invoice.status).toBe('UNPAID');
    expect(invoice.paidKobo).toBe(0);
    expect(invoice.resident?.id).toBe(residentId);
    expect(invoice.resident?.fullName).toBe('Ada Okafor');
    expect(invoice.property?.identifier).toBeTruthy();

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.organizationId).toBe(organizationId);
    expect(stored.userId).toBe(residentId);
    expect(stored.propertyId).toBe(propertyId);
    expect(stored.createdById).toBe(adminId);

    const audit = await prisma.auditEvent.findFirst({
      where: { organizationId, targetId: invoice.id, eventType: 'invoice_created' },
    });
    expect(audit?.actorId).toBe(adminId);

    const listed = await request(app)
      .get('/api/v1/invoices?status=UNPAID')
      .set('Cookie', adminCookie);
    expect(listed.status).toBe(200);
    expect(
      (listed.body.data.invoices as Array<{ id: string }>).some((entry) => entry.id === invoice.id),
    ).toBe(true);

    const pastDue = await issueInvoice({
      period: '2026-10-overdue',
      dueAt: '2026-10-01T00:00:00.000Z',
    });
    const overdue = await request(app)
      .get('/api/v1/invoices?status=OVERDUE')
      .set('Cookie', adminCookie);
    expect(overdue.status).toBe(200);
    expect(
      (overdue.body.data.invoices as Array<{ id: string }>).some(
        (entry) => entry.id === pastDue.id,
      ),
    ).toBe(true);
  });

  it('rejects malformed ids, invalid filters and other-organization invoices', async () => {
    expect(
      (await request(app).post('/api/v1/invoices/not-a-uuid/void').set('Cookie', adminCookie))
        .status,
    ).toBe(400);
    expect(
      (await request(app).get('/api/v1/invoices?status=BOGUS').set('Cookie', adminCookie)).status,
    ).toBe(400);
    expect(
      (
        await request(app).post('/api/v1/invoices').set('Cookie', adminCookie).send({
          residentId: otherResidentId,
          period: '2026-11',
          amountKobo: 1_000,
          dueAt: '2026-11-30T00:00:00.000Z',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/invoices/${otherInvoiceId}/void`)
          .set('Cookie', adminCookie)
      ).status,
    ).toBe(404);
  });

  it('records a manual payment, settles the invoice and writes the ledger', async () => {
    const invoice = await issueInvoice({ period: '2026-11-payment' });
    const paid = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set('Cookie', adminCookie)
      .send({
        method: 'BANK_TRANSFER',
        reference: 'TRX-2026-11',
        paidAt: '2026-11-15T00:00:00.000Z',
      });
    expect(paid.status).toBe(201);
    expect(paid.body.data.invoice.status).toBe('PAID');
    expect(paid.body.data.payment.amountKobo).toBe(invoice.amountKobo);
    expect(paid.body.data.payment.reference).toBe('TRX-2026-11');
    expect(paid.body.data.payment.recordedBy.id).toBe(adminId);

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.status).toBe('PAID');
    const payment = await prisma.payment.findFirstOrThrow({
      where: { organizationId, invoiceId: invoice.id },
    });
    expect(payment.recordedById).toBe(adminId);
    expect(payment.paidAt.toISOString()).toBe('2026-11-15T00:00:00.000Z');

    const transactions = await prisma.transaction.findMany({
      where: { organizationId, userId: residentId, reference: { in: [invoice.id, payment.id] } },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions.map((entry) => entry.kind).sort()).toEqual(['INVOICE', 'PAYMENT']);
    expect(transactions.reduce((total, entry) => total + entry.signed, 0)).toBe(0);

    const audit = await prisma.auditEvent.findFirst({
      where: { organizationId, targetId: payment.id, eventType: 'payment_recorded' },
    });
    expect(audit?.actorId).toBe(adminId);

    const payments = await request(app).get('/api/v1/payments').set('Cookie', adminCookie);
    expect(payments.status).toBe(200);
    expect(
      (payments.body.data.payments as Array<{ id: string }>).some(
        (entry) => entry.id === payment.id,
      ),
    ).toBe(true);
  });

  it('rejects duplicate payments and voiding a paid invoice', async () => {
    const invoice = await issueInvoice({ period: '2026-11-duplicate' });
    expect(
      (
        await request(app)
          .post(`/api/v1/invoices/${invoice.id}/payments`)
          .set('Cookie', adminCookie)
          .send({ method: 'CASH' })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post(`/api/v1/invoices/${invoice.id}/payments`)
          .set('Cookie', adminCookie)
          .send({ method: 'CASH' })
      ).status,
    ).toBe(409);
    expect(
      (await request(app).post(`/api/v1/invoices/${invoice.id}/void`).set('Cookie', adminCookie))
        .status,
    ).toBe(409);
  });

  it('settles an invoice only once when two payments race', async () => {
    const invoice = await issueInvoice({ period: '2026-11-race' });
    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/v1/invoices/${invoice.id}/payments`)
        .set('Cookie', adminCookie)
        .send({ method: 'CASH' }),
      request(app)
        .post(`/api/v1/invoices/${invoice.id}/payments`)
        .set('Cookie', adminCookie)
        .send({ method: 'BANK_TRANSFER' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);

    const payments = await prisma.payment.count({
      where: { organizationId, invoiceId: invoice.id },
    });
    expect(payments).toBe(1);
    const transactions = await prisma.transaction.count({
      where: { organizationId, userId: residentId, reference: { in: [invoice.id] } },
    });
    expect(transactions).toBe(1);
  });

  it('voids an unpaid invoice and audits the void actor', async () => {
    const invoice = await issueInvoice({ period: '2026-11-void' });
    const voided = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/void`)
      .set('Cookie', adminCookie);
    expect(voided.status).toBe(200);
    expect(voided.body.data.invoice.status).toBe('VOID');
    expect(voided.body.data.invoice.voidedBy.id).toBe(adminId);
    expect(voided.body.data.invoice.voidedAt).toBeTruthy();

    const audit = await prisma.auditEvent.findFirst({
      where: { organizationId, targetId: invoice.id, eventType: 'invoice_voided' },
    });
    expect(audit?.actorId).toBe(adminId);

    expect(
      (await request(app).post(`/api/v1/invoices/${invoice.id}/void`).set('Cookie', adminCookie))
        .status,
    ).toBe(409);
  });

  it('lets the resident see and pay an operator-issued invoice', async () => {
    const invoice = await issueInvoice({ period: '2026-11-resident' });
    const view = await request(app).get('/api/v1/resident/finance').set('Cookie', residentCookie);
    expect(view.status).toBe(200);
    expect(
      (view.body.data.outstanding as Array<{ id: string }>).some(
        (entry) => entry.id === invoice.id,
      ),
    ).toBe(true);

    const paid = await request(app)
      .post('/api/v1/resident/payments')
      .set('Cookie', residentCookie)
      .send({ invoiceId: invoice.id, method: 'CASH', reference: 'RESIDENT-RECEIPT' });
    expect(paid.status).toBe(200);
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.status).toBe('PAID');
  });
});
