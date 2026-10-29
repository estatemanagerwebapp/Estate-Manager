/**
 * Organization-level data import integration tests.
 *
 * Exercises the real Express routes, repositories, Prisma transaction and the
 * disposable `silverstone_test` database: preview → commit for estates,
 * properties, facilities, resident onboarding drafts, and invoices, plus
 * duplicate, cross-reference, and permission behavior.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { ORG_IMPORT_COLUMNS, type OrgImportSheet } from '@silverstone/shared';
import { createApp } from './application.js';
import { getPrismaClient, disconnectPrisma } from './lib/prisma.js';
import { PrismaUserRepository } from './modules/auth/user-repository.js';
import { PrismaSessionRepository } from './modules/auth/session-repository.js';
import { PrismaPasswordResetRepository } from './modules/auth/reset-token-repository.js';
import { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';
import { MockEmailAdapter } from './modules/auth/email-adapter.js';
import { AuthService } from './modules/auth/auth.service.js';
import { UserService } from './modules/auth/user.service.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { PrismaHouseTypeRepository } from './modules/properties/house-type-repository.js';
import { PrismaOrgImportRepository } from './modules/org-imports/org-import.repository.js';
import { OrgImportService } from './modules/org-imports/org-import.service.js';
import { deriveIdentifier } from './lib/property-identifier.js';
import { hashPassword, sha256Hex } from './lib/password.js';

vi.setConfig({ testTimeout: 60_000 });

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let organizationSlug = '';
let adminUserId = '';
let adminCookie = '';
let houseTypeKey = '';
const ADMIN_EMAIL = 'org_import_admin@example.com';
const ADMIN_PASSWORD = 'Sup3rSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

type SheetRows = Partial<Record<OrgImportSheet, Array<Record<string, string>>>>;

async function workbook(rows: SheetRows): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  for (const [sheetName, columns] of Object.entries(ORG_IMPORT_COLUMNS) as Array<
    [OrgImportSheet, readonly string[]]
  >) {
    const worksheet = book.addWorksheet(sheetName);
    worksheet.addRow([...columns]);
    for (const row of rows[sheetName] ?? []) {
      worksheet.addRow(columns.map((column) => row[column] ?? ''));
    }
  }
  return (await book.xlsx.writeBuffer()) as unknown as Buffer;
}

function authed(): {
  get: (path: string) => request.Test;
  post: (path: string) => request.Test;
} {
  const agent = request(app);
  return {
    get: (path) => agent.get(path).set('Cookie', adminCookie),
    post: (path) => agent.post(path).set('Cookie', adminCookie),
  };
}

async function upload(bytes: Buffer, filename = 'organization.xlsx') {
  return authed().post('/api/v1/org-imports').attach('file', bytes, {
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

beforeAll(async () => {
  prisma = getPrismaClient();

  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const resetTokens = new PrismaPasswordResetRepository(prisma);
  const audit = new PrismaAuditRepository(prisma);
  const permissions = new PermissionResolver(async () => []);
  const email = new MockEmailAdapter();

  organizationSlug = `org_import_${uniqueSuffix()}`;
  const org = await prisma.organization.create({
    data: { slug: organizationSlug, name: 'Org Import Test' },
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
  adminUserId = admin.id;

  houseTypeKey = `test_house_${uniqueSuffix()}`;
  await prisma.houseType.create({
    data: {
      key: houseTypeKey,
      label: 'Test House',
      requiresUnitFields: false,
      active: true,
    },
  });

  const properties = new PrismaPropertyRepository(prisma);
  const houseTypes = new PrismaHouseTypeRepository(prisma);
  const orgImportRepo = new PrismaOrgImportRepository(prisma);
  const orgImportService = new OrgImportService({
    prisma,
    imports: orgImportRepo,
    properties,
    houseTypes,
    audit,
    loadResidentCodeLength: async () => 10,
  });

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
    orgImports: {
      orgImportService,
      sessions,
      permissions,
      organizationId,
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
  await prisma.organizationImportRow.deleteMany({
    where: { batch: { organizationId } },
  });
  await prisma.organizationImportBatch.deleteMany({ where: { organizationId } });
  await prisma.payment.deleteMany({ where: { organizationId } });
  await prisma.invoice.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.facility.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.houseType.deleteMany({ where: { key: houseTypeKey } });
  await disconnectPrisma();
});

describe('organization data import', () => {
  it('serves a multi-sheet template', async () => {
    const res = await authed().get('/api/v1/org-imports/template').responseType('blob').expect(200);
    expect(res.headers['content-disposition']).toContain(
      'silverstone-organization-import-template.xlsx',
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body as unknown as Buffer);
    expect(book.getWorksheet('Estates')).toBeTruthy();
    expect(book.getWorksheet('Properties')).toBeTruthy();
    expect(book.getWorksheet('Facilities')).toBeTruthy();
    expect(book.getWorksheet('Residents')).toBeTruthy();
    expect(book.getWorksheet('Billing')).toBeTruthy();
    expect(book.getWorksheet('Instructions')).toBeTruthy();
  });

  it('previews and commits a full onboarding workbook', async () => {
    const suffix = uniqueSuffix();
    const estateSlug = `import_estate_${suffix}`;
    const residentEmail = `ada_${suffix}@example.com`;
    const identifier = deriveIdentifier({
      estateSlug,
      kind: 'LAND',
      houseType: null,
      streetName: 'Test Street',
      plotNumber: '12',
      plotName: 'North plot',
    }).identifier;
    expect(identifier).toBeTruthy();

    const bytes = await workbook({
      Estates: [
        {
          slug: estateSlug,
          name: `Imported Estate ${suffix}`,
          address: 'Lagos',
          status: 'ACTIVE',
        },
      ],
      Properties: [
        {
          estate_slug: estateSlug,
          type: 'land',
          street_name: 'Test Street',
          plot_number: '12',
          plot_name: 'North plot',
          name: 'Imported Plot',
          status: 'ACTIVE',
        },
      ],
      Facilities: [
        {
          estate_slug: estateSlug,
          name: 'Imported Clubhouse',
          description: 'Shared hall',
          bookable: 'yes',
          usage_fee_naira: '25,000',
        },
      ],
      Residents: [
        {
          estate_slug: estateSlug,
          property_identifier: identifier!,
          first_name: 'Ada',
          email: residentEmail,
          phone: '08012345678',
        },
      ],
    });

    const preview = await upload(bytes, 'onboarding.xlsx');
    expect(preview.status).toBe(201);
    const batch = preview.body.data.batch;
    expect(batch.counts.total).toBe(4);
    expect(batch.counts.valid).toBe(4);
    expect(batch.counts.error).toBe(0);
    expect(batch.counts.collision).toBe(0);
    expect(batch.counts.sheets.Estates.valid).toBe(1);
    expect(batch.counts.sheets.Residents.valid).toBe(1);

    const commit = await authed().post(`/api/v1/org-imports/${batch.id}/commit`).expect(200);
    expect(commit.body.data.created).toEqual({
      estates: 1,
      properties: 1,
      facilities: 1,
      residents: 1,
      invoices: 0,
    });
    expect(commit.body.data.batch.status).toBe('COMMITTED');

    const estate = await prisma.estate.findFirst({
      where: { organizationId, slug: estateSlug },
    });
    expect(estate).toBeTruthy();

    const property = await prisma.property.findFirst({
      where: { organizationId, identifier: identifier! },
    });
    expect(property?.estateId).toBe(estate!.id);
    expect(property?.kind).toBe('LAND');
    expect(property?.name).toBe('Imported Plot');

    const facility = await prisma.facility.findFirst({
      where: { organizationId, name: 'Imported Clubhouse' },
    });
    expect(facility?.estateId).toBe(estate!.id);
    expect(facility?.usageFeeKobo).toBe(2_500_000);

    const draft = await prisma.residentOnboarding.findFirst({
      where: { organizationId, email: residentEmail },
    });
    expect(draft?.status).toBe('PENDING');
    expect(draft?.propertyId).toBe(property!.id);
    expect(draft?.userId).toBeNull();
    expect(draft?.onboardingCode).toBeTruthy();

    const completed = await prisma.auditEvent.findFirst({
      where: {
        organizationId,
        eventType: 'import_completed',
        targetId: batch.id,
      },
    });
    expect(completed).toBeTruthy();

    // The same bytes are idempotent: a committed fingerprint is terminal.
    const again = await upload(bytes, 'onboarding.xlsx');
    expect(again.status).toBe(409);
  });

  it('classifies repeated workbook rows as duplicates rather than collisions', async () => {
    const suffix = uniqueSuffix();
    const estateSlug = `dup_rows_${suffix}`;
    const email = `dup_rows_${suffix}@example.com`;
    const property = {
      estate_slug: estateSlug,
      type: 'land',
      street_name: 'Repeat Street',
      plot_number: '7',
      plot_name: 'Repeat plot',
    };
    const resident = {
      estate_slug: estateSlug,
      property_identifier: deriveIdentifier({
        estateSlug,
        kind: 'LAND',
        houseType: null,
        streetName: 'Repeat Street',
        plotNumber: '7',
        plotName: 'Repeat plot',
      }).identifier!,
      first_name: 'Repeat',
      email,
    };
    const facility = {
      estate_slug: estateSlug,
      name: 'Repeat Hall',
      description: 'Repeated hall',
    };

    const bytes = await workbook({
      Estates: [
        { slug: estateSlug, name: 'Repeat Estate' },
        { slug: estateSlug, name: 'Repeat Estate Again' },
      ],
      Properties: [property, property],
      Facilities: [facility, facility],
      Residents: [resident, resident],
    });

    const preview = await upload(bytes, 'duplicate-rows.xlsx');
    expect(preview.status).toBe(201);
    const batch = preview.body.data.batch;
    expect(batch.counts.valid).toBe(4);
    expect(batch.counts.duplicateInFile).toBe(4);
    expect(batch.counts.collision).toBe(0);
    expect(batch.counts.error).toBe(0);
  });

  it('rejects billing rows for residents created as drafts in the same workbook', async () => {
    const suffix = uniqueSuffix();
    const estateSlug = `draft_bill_estate_${suffix}`;
    const residentEmail = `draft_bill_${suffix}@example.com`;
    const identifier = deriveIdentifier({
      estateSlug,
      kind: 'LAND',
      houseType: null,
      streetName: 'Draft Street',
      plotNumber: '3',
      plotName: 'Draft plot',
    }).identifier;
    expect(identifier).toBeTruthy();

    const bytes = await workbook({
      Estates: [{ slug: estateSlug, name: `Draft Estate ${suffix}` }],
      Properties: [
        {
          estate_slug: estateSlug,
          type: 'land',
          street_name: 'Draft Street',
          plot_number: '3',
          plot_name: 'Draft plot',
        },
      ],
      Residents: [
        {
          estate_slug: estateSlug,
          property_identifier: identifier!,
          first_name: 'Draft',
          email: residentEmail,
        },
      ],
      Billing: [
        {
          resident_email: residentEmail,
          period: '2026-11',
          amount_naira: '10,000',
          due_date: '2026-12-01',
        },
      ],
    });

    const preview = await upload(bytes, 'draft-billing.xlsx');
    expect(preview.status).toBe(201);
    const batch = preview.body.data.batch;
    expect(batch.counts.valid).toBe(3);
    expect(batch.counts.error).toBe(1);
    const rows = preview.body.data.rows as Array<{
      sheet: string;
      status: string;
      errors: string[];
    }>;
    const billing = rows.find((row) => row.sheet === 'Billing');
    expect(billing?.status).toBe('ERROR');
    expect(billing?.errors.join(' ')).toContain('No active resident account');

    const commit = await authed().post(`/api/v1/org-imports/${batch.id}/commit`).expect(200);
    expect(commit.body.data.created.residents).toBe(1);
    expect(commit.body.data.created.invoices).toBe(0);
    const draft = await prisma.residentOnboarding.findFirst({
      where: { organizationId, email: residentEmail },
    });
    expect(draft?.status).toBe('PENDING');
    expect(await prisma.invoice.count({ where: { organizationId, period: '2026-11' } })).toBe(0);
  });

  it('creates unpaid invoices only for active residents', async () => {
    const suffix = uniqueSuffix();
    const estate = await prisma.estate.create({
      data: {
        organizationId,
        slug: `bill_estate_${suffix}`,
        name: `Billing Estate ${suffix}`,
      },
    });
    const property = await prisma.property.create({
      data: {
        organizationId,
        estateId: estate.id,
        identifier: `BILL-${suffix}`,
        kind: 'LAND',
        streetName: 'Billing Street',
        plotNumber: '7',
        plotName: 'South plot',
        status: 'ACTIVE',
      },
    });
    const residentEmail = `billing_${suffix}@example.com`;
    const resident = await prisma.user.create({
      data: {
        organizationId,
        email: residentEmail,
        passwordHash: await hashPassword('ResidentPass123'),
        role: 'RESIDENT',
        status: 'ACTIVE',
        fullName: 'Billing Resident',
      },
    });
    await prisma.residentOnboarding.create({
      data: {
        organizationId,
        estateId: estate.id,
        propertyId: property.id,
        userId: resident.id,
        status: 'COMPLETED',
        codeHash: sha256Hex(`bill-code-${suffix}`),
        onboardingCode: 'BILLCODE',
        firstName: 'Billing',
        email: residentEmail,
        paymentStatus: 'PAID',
        completedAt: new Date(),
      },
    });

    const bytes = await workbook({
      Billing: [
        {
          resident_email: residentEmail,
          property_identifier: property.identifier,
          period: '2026-11',
          amount_naira: '50,000',
          due_date: '2026-12-01',
          status: 'UNPAID',
        },
      ],
    });

    const preview = await upload(bytes, 'billing.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.data.batch.counts.valid).toBe(1);

    const commit = await authed()
      .post(`/api/v1/org-imports/${preview.body.data.batch.id}/commit`)
      .expect(200);
    expect(commit.body.data.created.invoices).toBe(1);

    const invoice = await prisma.invoice.findFirst({
      where: { organizationId, userId: resident.id, period: '2026-11' },
    });
    expect(invoice?.amountKobo).toBe(5_000_000);
    expect(invoice?.status).toBe('UNPAID');
    expect(invoice?.propertyId).toBe(property.id);
    expect(invoice?.createdById).toBe(adminUserId);
  });

  it('reports collisions and cross-reference errors without writing rows', async () => {
    const suffix = uniqueSuffix();
    const estate = await prisma.estate.create({
      data: {
        organizationId,
        slug: `dup_estate_${suffix}`,
        name: `Existing Estate ${suffix}`,
      },
    });
    const residentEmail = `existing_${suffix}@example.com`;

    const bytes = await workbook({
      Estates: [
        { slug: estate.slug, name: 'Duplicate Estate' },
        { slug: `new_estate_${suffix}`, name: 'New Estate' },
      ],
      Properties: [{ estate_slug: `missing_${suffix}`, type: 'land', street_name: 'Nowhere' }],
      Residents: [
        {
          estate_slug: `missing_${suffix}`,
          property_identifier: 'NOPE',
          first_name: 'Ghost',
          email: residentEmail,
        },
      ],
      Billing: [
        {
          resident_email: residentEmail,
          period: '2026-11',
          amount_naira: '1000',
          due_date: '2026-12-01',
        },
      ],
    });

    const preview = await upload(bytes, 'collisions.xlsx');
    expect(preview.status).toBe(201);
    const batch = preview.body.data.batch;
    expect(batch.counts.collision).toBe(1);
    expect(batch.counts.error).toBe(3);
    expect(batch.counts.valid).toBe(1);

    const rows = preview.body.data.rows as Array<{
      sheet: string;
      status: string;
      errors: string[];
    }>;
    expect(rows.find((row) => row.sheet === 'Estates' && row.status === 'COLLISION')).toBeTruthy();
    expect(rows.some((row) => row.sheet === 'Properties' && row.status === 'ERROR')).toBe(true);
    expect(rows.some((row) => row.sheet === 'Residents' && row.status === 'ERROR')).toBe(true);
    expect(rows.some((row) => row.sheet === 'Billing' && row.status === 'ERROR')).toBe(true);

    const properties = await prisma.property.count({ where: { organizationId } });
    const before = properties;
    const commit = await authed().post(`/api/v1/org-imports/${batch.id}/commit`).expect(200);
    expect(commit.body.data.created).toEqual({
      estates: 1,
      properties: 0,
      facilities: 0,
      residents: 0,
      invoices: 0,
    });
    expect(await prisma.property.count({ where: { organizationId } })).toBe(before);
  });

  it('forbids a role without import.manage', async () => {
    const suffix = uniqueSuffix();
    const guard = await prisma.user.create({
      data: {
        organizationId,
        email: `guard_${suffix}@example.com`,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        role: 'GUARD',
        status: 'ACTIVE',
        lastPasswordChangedAt: new Date(),
      },
    });
    const login = await request(app).post('/api/v1/auth/login').send({
      email: guard.email,
      password: ADMIN_PASSWORD,
    });
    expect(login.status).toBe(200);
    const cookie = cookieFrom(login);
    const res = await request(app).get('/api/v1/org-imports').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });
});
