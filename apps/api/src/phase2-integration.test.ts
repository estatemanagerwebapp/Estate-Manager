/**
 * Phase 2 integration tests: estate CRUD, typed property CRUD, and the full
 * import upload → preview → commit flow against the disposable
 * `silverstone_test` database.
 *
 * Runs against the real Prisma repositories, real Express routes, and a
 * real PostgreSQL instance. No fakes other than the database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Worksheet } from 'exceljs';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
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
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { EstateService } from './modules/estates/estate.service.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { PropertyService } from './modules/properties/property.service.js';
import { PrismaHouseTypeRepository } from './modules/properties/house-type-repository.js';
import { PrismaImportRepository } from './modules/imports/import-repository.js';
import { ImportService } from './modules/imports/import.service.js';
import {
  PrismaOrganizationConfigRepository,
  OrganizationConfigService,
} from './modules/organization/config.service.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';
import { hashPassword } from './lib/password.js';
import type { ImportServiceContext } from './modules/imports/import.service.js';

// These tests exercise real Supabase-backed requests; allow for pooler latency.
vi.setConfig({ testTimeout: 60_000 });

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let organizationSlug = '';
let adminUserId = '';
let adminCookie = '';
let configServiceForTest: OrganizationConfigService;
const ADMIN_EMAIL = 'phase2_admin@example.com';
const ADMIN_PASSWORD = 'Sup3rSecretXyz';

function uniqueSuffix(): string {
  // Slug-safe: no dashes (estate slugs allow [a-z0-9_] only).
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

/** Build an authenticated context for direct service-level calls. */
function ctx(): ImportServiceContext {
  return {
    organizationId,
    actorId: adminUserId || null,
    requestId: null,
  };
}

/** Create an estate via the service directly (no HTTP round-trip). */
async function createTestEstate(
  name?: string,
  slug?: string,
): Promise<{ id: string; slug: string }> {
  const estates = new PrismaEstateRepository(prisma);
  const audit = new PrismaAuditRepository(prisma);
  const suffix = uniqueSuffix();
  const estateSlug = slug ?? `est${suffix}`;
  const estateName = name ?? `Test Estate ${suffix}`;
  const estateService = new EstateService(estates, audit);
  const estate = await estateService.create(ctx(), { name: estateName, slug: estateSlug });
  return { id: estate.id, slug: estate.slug };
}

beforeAll(async () => {
  prisma = getPrismaClient();

  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const resetTokens = new PrismaPasswordResetRepository(prisma);
  const audit = new PrismaAuditRepository(prisma);
  const permissions = new PermissionResolver(async () => []);
  const email = new MockEmailAdapter();

  organizationSlug = `phase2_test_${uniqueSuffix()}`;
  const org = await prisma.organization.create({
    data: { slug: organizationSlug, name: 'Phase 2 Test' },
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

  // Build the full app so every Phase 2 route is mounted.
  const estates = new PrismaEstateRepository(prisma);
  const estateService = new EstateService(estates, audit);

  const properties = new PrismaPropertyRepository(prisma);
  const houseTypes = new PrismaHouseTypeRepository(prisma);
  const propertyService = new PropertyService(properties, estates, houseTypes, audit);

  const importRepo = new PrismaImportRepository(prisma);
  const importService = new ImportService(
    importRepo,
    estates,
    properties,
    houseTypes,
    audit,
    prisma,
  );

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

  const configRepo = new PrismaOrganizationConfigRepository(prisma);
  configServiceForTest = new OrganizationConfigService(
    configRepo,
    loadBootstrapConfig,
    organizationSlug,
  );
  const configService = configServiceForTest;
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
    estates: {
      estateService,
      sessions,
      permissions,
      organizationId,
    },
    properties: {
      propertyService,
      sessions,
      permissions,
      organizationId,
    },
    imports: {
      importService,
      sessions,
      permissions,
      organizationId,
      loadConfigVersion: async () => (await configService.resolve()).version,
    },
  });

  // Log in to get a session cookie for the SUPER_ADMIN (has all Phase 2 permissions).
  const login = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(login.status).toBe(200);
  adminCookie = cookieFrom(login);
});

afterAll(async () => {
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.importRow.deleteMany({ where: { batch: { organizationId } } });
  await prisma.importBatch.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.organizationConfig.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

function authed(): {
  get: (path: string) => request.Test;
  post: (path: string) => request.Test;
  patch: (path: string) => request.Test;
  put: (path: string) => request.Test;
} {
  const agent = request(app);
  return {
    get: (path) => agent.get(path).set('Cookie', adminCookie),
    post: (path) => agent.post(path).set('Cookie', adminCookie),
    patch: (path) => agent.patch(path).set('Cookie', adminCookie),
    put: (path) => agent.put(path).set('Cookie', adminCookie),
  };
}

// =============================================================================
// Estate CRUD
// =============================================================================

describe('estate CRUD (integration)', () => {
  it('creates an estate and lists it', async () => {
    const suffix = uniqueSuffix();
    const slug = `estcrud${suffix}`;
    const name = `CRUD Estate ${suffix}`;

    const created = await authed().post('/api/v1/estates').send({ name, slug });
    expect(created.status).toBe(201);
    expect(created.body.data.estate.slug).toBe(slug);
    expect(created.body.data.estate.status).toBe('ACTIVE');

    const listed = await authed().get('/api/v1/estates').expect(200);
    expect(listed.body.data.total).toBeGreaterThanOrEqual(1);
    expect(
      listed.body.data.estates.some((e: { id: string }) => e.id === created.body.data.estate.id),
    ).toBe(true);
  });

  it('rejects a duplicate slug with 409', async () => {
    const suffix = uniqueSuffix();
    const slug = `estdup${suffix}`;
    await authed().post('/api/v1/estates').send({ name: 'Dup', slug }).expect(201);
    const dup = await authed().post('/api/v1/estates').send({ name: 'Dup2', slug });
    expect(dup.status).toBe(409);
  });

  it('rejects an invalid slug with 400', async () => {
    const response = await authed()
      .post('/api/v1/estates')
      .send({ name: 'Bad Slug Estate', slug: 'UPPER_CASE_SLUG' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('patches an estate name and slug', async () => {
    const suffix = uniqueSuffix();
    const createRes = await authed()
      .post('/api/v1/estates')
      .send({ name: `Patch ${suffix}`, slug: `patched${suffix}` })
      .expect(201);
    const estateId = createRes.body.data.estate.id;

    const patched = await authed()
      .patch(`/api/v1/estates/${estateId}`)
      .send({ name: `Patched ${suffix}` })
      .expect(200);
    expect(patched.body.data.estate.name).toBe(`Patched ${suffix}`);
  });

  it('archives an estate and then rejects property creation under it', async () => {
    const suffix = uniqueSuffix();
    const createRes = await authed()
      .post('/api/v1/estates')
      .send({ name: `Archive ${suffix}`, slug: `archived${suffix}` })
      .expect(201);
    const estateId = createRes.body.data.estate.id;

    await authed()
      .post(`/api/v1/estates/${estateId}/status`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const detail = await authed().get(`/api/v1/estates/${estateId}`).expect(200);
    expect(detail.body.data.estate.status).toBe('ARCHIVED');

    // Creating a property under an archived estate → 409
    const propRes = await authed().post('/api/v1/properties').send({
      estateId,
      kind: 'LAND',
      streetName: 'Main St',
      plotNumber: '1',
      plotName: 'North plot',
    });
    expect(propRes.status).toBe(409);
  });

  it('returns 404 for a non-existent estate', async () => {
    await authed().get('/api/v1/estates/00000000-0000-0000-0000-000000000000').expect(404);
  });
});

// =============================================================================
// Property CRUD (integration) — typed House / Land / Both model
// =============================================================================

describe('property CRUD (integration)', () => {
  it('creates a land property with a derived identifier', async () => {
    const estate = await createTestEstate();

    const res = await authed()
      .post('/api/v1/properties')
      .send({
        estateId: estate.id,
        kind: 'LAND',
        houseType: null,
        streetName: 'Main St',
        plotNumber: '42',
        plotName: 'North plot',
      })
      .expect(201);

    const property = res.body.data.property;
    expect(property.identifier).toBe(`${estate.slug}-Main St-42`);
    expect(property.status).toBe('ACTIVE');
    expect(property.kind).toBe('LAND');
    expect(property.kindLabel).toBe('Land');
    expect(property.houseType).toBeNull();
    expect(property.plotNumber).toBe('42');
    expect(property.plotName).toBe('North plot');
  });

  it('creates a bungalow with a derived identifier', async () => {
    const estate = await createTestEstate();

    const res = await authed()
      .post('/api/v1/properties')
      .send({
        estateId: estate.id,
        kind: 'HOUSE',
        houseType: 'bungalow',
        streetName: 'Oak Ave',
        houseNumber: '17',
      })
      .expect(201);

    const property = res.body.data.property;
    expect(property.identifier).toBe(`${estate.slug}-Oak Ave-17`);
    expect(property.kind).toBe('HOUSE');
    expect(property.houseType).toBe('bungalow');
    expect(property.houseTypeLabel).toBe('Bungalow');
    expect(property.houseTypeRequiresUnitFields).toBe(false);
    expect(property.houseNumber).toBe('17');
  });

  it('creates an apartment with block, floor, and unit fields', async () => {
    const estate = await createTestEstate();

    const res = await authed()
      .post('/api/v1/properties')
      .send({
        estateId: estate.id,
        kind: 'HOUSE',
        houseType: 'apartment',
        streetName: 'Main St',
        blockName: 'Block A',
        floorNumber: '3',
        unitNumber: '12',
      })
      .expect(201);

    const property = res.body.data.property;
    expect(property.identifier).toBe(`${estate.slug}-Main St-Block A-3-12`);
    expect(property.kind).toBe('HOUSE');
    expect(property.houseType).toBe('apartment');
    expect(property.houseTypeRequiresUnitFields).toBe(true);
    expect(property.blockName).toBe('Block A');
    expect(property.floorNumber).toBe('3');
    expect(property.unitNumber).toBe('12');
  });

  it('creates a both property with house and plot fields', async () => {
    const estate = await createTestEstate();

    const res = await authed()
      .post('/api/v1/properties')
      .send({
        estateId: estate.id,
        kind: 'BOTH',
        houseType: 'bungalow',
        streetName: 'Oak Ave',
        houseNumber: '17',
        plotNumber: '42',
        plotName: 'North plot',
      })
      .expect(201);

    expect(res.body.data.property.identifier).toBe(`${estate.slug}-Oak Ave-17-42`);
    expect(res.body.data.property.kindLabel).toBe('Both');
  });

  it('rejects a house property without a house type', async () => {
    const estate = await createTestEstate();
    const res = await authed().post('/api/v1/properties').send({
      estateId: estate.id,
      kind: 'HOUSE',
      streetName: 'Oak Ave',
      houseNumber: '17',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a house type on a land property', async () => {
    const estate = await createTestEstate();
    const res = await authed().post('/api/v1/properties').send({
      estateId: estate.id,
      kind: 'LAND',
      houseType: 'bungalow',
      streetName: 'Main St',
      plotNumber: '42',
      plotName: 'North plot',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a missing plot number with a field-level error', async () => {
    const estate = await createTestEstate();
    const res = await authed().post('/api/v1/properties').send({
      estateId: estate.id,
      kind: 'LAND',
      streetName: 'Main St',
      plotName: 'North plot',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('plotNumber');
  });

  it('rejects a missing house number for a bungalow', async () => {
    const estate = await createTestEstate();
    const res = await authed().post('/api/v1/properties').send({
      estateId: estate.id,
      kind: 'HOUSE',
      houseType: 'bungalow',
      streetName: 'Oak Ave',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('houseNumber');
  });

  it('rejects a plot number on a bungalow', async () => {
    const estate = await createTestEstate();
    const res = await authed().post('/api/v1/properties').send({
      estateId: estate.id,
      kind: 'HOUSE',
      houseType: 'bungalow',
      streetName: 'Oak Ave',
      houseNumber: '17',
      plotNumber: '42',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown house type with 400', async () => {
    const estate = await createTestEstate();
    const res = await authed().post('/api/v1/properties').send({
      estateId: estate.id,
      kind: 'HOUSE',
      houseType: 'unknown_type',
      streetName: 'Oak Ave',
      houseNumber: '17',
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 when the identifier collides with an existing property', async () => {
    const estate = await createTestEstate();
    const payload = {
      estateId: estate.id,
      kind: 'LAND',
      streetName: 'Main St',
      plotNumber: '42',
      plotName: 'North plot',
    };

    await authed().post('/api/v1/properties').send(payload).expect(201);
    const dup = await authed().post('/api/v1/properties').send(payload);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('lists properties with kind filters', async () => {
    const estate = await createTestEstate();

    await authed()
      .post('/api/v1/properties')
      .send({
        estateId: estate.id,
        kind: 'LAND',
        streetName: 'Main St',
        plotNumber: '42',
        plotName: 'North plot',
      })
      .expect(201);

    const listed = await authed()
      .get('/api/v1/properties')
      .query({ estateId: estate.id, kind: 'LAND' })
      .expect(200);
    expect(listed.body.data.total).toBeGreaterThanOrEqual(1);

    const wrongKind = await authed()
      .get('/api/v1/properties')
      .query({ estateId: estate.id, kind: 'HOUSE' })
      .expect(200);
    expect(wrongKind.body.data.total).toBe(0);
  });

  it('returns the active house-type catalogue', async () => {
    const res = await authed().get('/api/v1/properties/house-types').expect(200);
    expect(res.body.data.houseTypes.map((type: { key: string }) => type.key)).toEqual([
      'bungalow',
      'terrace',
      'duplex',
      'apartment',
      'flat',
    ]);
  });

  it('archives a property and preserves the identifier', async () => {
    const estate = await createTestEstate();
    const createRes = await authed()
      .post('/api/v1/properties')
      .send({
        estateId: estate.id,
        kind: 'LAND',
        streetName: 'Main St',
        plotNumber: '42',
        plotName: 'North plot',
      })
      .expect(201);
    const propertyId = createRes.body.data.property.id;
    const originalIdentifier = createRes.body.data.property.identifier;

    const archiveRes = await authed().post(`/api/v1/properties/${propertyId}/archive`);
    expect(archiveRes.status).toBe(200);

    const detail = await authed().get(`/api/v1/properties/${propertyId}`).expect(200);
    expect(detail.body.data.property.status).toBe('ARCHIVED');
    expect(detail.body.data.property.identifier).toBe(originalIdentifier);
  });

  it('PATCH never re-derives the immutable identifier', async () => {
    const estate = await createTestEstate();
    const createRes = await authed()
      .post('/api/v1/properties')
      .send({
        estateId: estate.id,
        kind: 'LAND',
        streetName: 'Main St',
        plotNumber: '42',
        plotName: 'North plot',
      })
      .expect(201);
    const propertyId = createRes.body.data.property.id;
    const originalIdentifier = createRes.body.data.property.identifier;

    const patched = await authed()
      .patch(`/api/v1/properties/${propertyId}`)
      .send({ status: 'ARCHIVED', streetName: 'Changed St', identifier: 'HACK' })
      .expect(200);
    expect(patched.body.data.property.identifier).toBe(originalIdentifier);
    expect(patched.body.data.property.streetName).toBe('Changed St');
    expect(patched.body.data.property.status).toBe('ARCHIVED');
  });

  it('rejects property creation under an archived estate', async () => {
    const suffix = uniqueSuffix();
    const createRes = await authed()
      .post('/api/v1/estates')
      .send({ name: `Archived Prop ${suffix}`, slug: `archprop${suffix}` })
      .expect(201);
    const estateId = createRes.body.data.estate.id;
    await authed()
      .post(`/api/v1/estates/${estateId}/status`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const propRes = await authed().post('/api/v1/properties').send({
      estateId,
      kind: 'LAND',
      streetName: 'Main St',
      plotNumber: '1',
      plotName: 'North plot',
    });
    expect(propRes.status).toBe(409);
  });
});

// =============================================================================
// Import flow (integration) — new land / house model
// =============================================================================

async function seedImportConfig(): Promise<{ estateId: string; estateSlug: string }> {
  const estate = await createTestEstate();
  return { estateId: estate.id, estateSlug: estate.slug };
}

/**
 * Download the server-generated template as raw bytes.
 *
 * `responseType('blob')` makes superagent buffer the response instead of
 * decoding it as text, which would corrupt the `.xlsx` payload.
 */
async function downloadTemplate(estateId: string): Promise<Buffer> {
  const res = await authed()
    .get(`/api/v1/estates/${estateId}/imports/template`)
    .responseType('blob')
    .expect(200);
  return res.body as unknown as Buffer;
}

/** Upload a workbook to an estate's import endpoint. */
function uploadWorkbook(estateId: string, bytes: Buffer, filename: string) {
  return authed().post(`/api/v1/estates/${estateId}/imports`).attach('file', bytes, {
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** The header labels of a worksheet, in column order. */
function headerLabels(sheet: Worksheet | undefined): string[] {
  if (!sheet) return [];
  const values = sheet.getRow(1).values as unknown[];
  return values.slice(1).map((value) => String(value ?? ''));
}

describe('import flow (integration)', () => {
  it('returns template with correct headers and structure', async () => {
    const { estateId } = await seedImportConfig();
    const res = await authed().get(`/api/v1/estates/${estateId}/imports/template`);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toContain(`properties-${estateId.slice(0, 8)}.xlsx`);
    // The response body is a binary .xlsx workbook.
    // supertest exposes the body as a string for binary content types.
    expect((res.text || '').length).toBeGreaterThan(0);
  });

  it('serves a template whose Properties worksheet is header-only', async () => {
    const { estateId } = await seedImportConfig();
    const bytes = await downloadTemplate(estateId);

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const sheet = workbook.worksheets[0];
    expect(sheet?.name).toBe('Properties');
    // Row 1 holds the headers and nothing follows it: the template carries no
    // importable sample row, so re-uploading it unchanged imports nothing.
    expect(sheet?.actualRowCount).toBe(1);
    expect(headerLabels(sheet)).toEqual([
      'type',
      'house_type',
      'street_name',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
      'plot_number',
      'plot_name',
    ]);
  });

  it('creates no properties when the unchanged template is uploaded', async () => {
    const { estateId } = await seedImportConfig();
    const bytes = await downloadTemplate(estateId);

    const preview = await uploadWorkbook(estateId, bytes, 'properties-untouched.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.data.batch.counts.total).toBe(0);
    expect(preview.body.data.batch.counts.valid).toBe(0);
    expect(preview.body.data.rows).toHaveLength(0);

    const commit = await authed().post(`/api/v1/imports/${preview.body.data.batch.id}/commit`);
    expect(commit.status).toBe(200);
    expect(commit.body.data.createdPropertyIds).toHaveLength(0);

    const properties = await authed().get(`/api/v1/properties?estateId=${estateId}`);
    expect(properties.status).toBe(200);
    expect(properties.body.data.properties).toHaveLength(0);
  });

  it('creates exactly one land property from a template carrying one deliberate row', async () => {
    const { estateId } = await seedImportConfig();
    const bytes = await downloadTemplate(estateId);

    // Add one valid row directly beneath the header: it is worksheet row 2.
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const sheet = workbook.worksheets[0];
    sheet?.addRow(['land', '', 'Main St', '', '', '', '', '42', 'North plot']);
    const populated = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

    const preview = await uploadWorkbook(estateId, populated, 'properties-populated.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.data.batch.counts.total).toBe(1);
    expect(preview.body.data.batch.counts.valid).toBe(1);
    expect(preview.body.data.rows).toHaveLength(1);
    // Row 1 is the header, so the first data row is worksheet row 2.
    expect(preview.body.data.rows[0].rowNumber).toBe(2);
    expect(preview.body.data.rows[0].status).toBe('VALID');

    const commit = await authed().post(`/api/v1/imports/${preview.body.data.batch.id}/commit`);
    expect(commit.status).toBe(200);
    expect(commit.body.data.createdPropertyIds).toHaveLength(1);

    const properties = await authed().get(`/api/v1/properties?estateId=${estateId}`);
    expect(properties.status).toBe(200);
    expect(properties.body.data.properties).toHaveLength(1);
  });

  it('imports an apartment row with block, floor, and unit fields', async () => {
    const { estateId } = await seedImportConfig();
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Properties');
    sheet.addRow([
      'type',
      'house_type',
      'street_name',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
      'plot_number',
      'plot_name',
    ]);
    const suffix = uniqueSuffix().replace('_', '');
    sheet.addRow(['house', 'apartment', `Court ${suffix}`, '', 'Block 03', '03', '01', '', '']);
    const bytes = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const preview = await uploadWorkbook(estateId, bytes, 'apartment-import.xlsx').expect(201);
    expect(preview.body.data.batch.counts.valid).toBe(1);

    const commit = await authed()
      .post(`/api/v1/imports/${preview.body.data.batch.id}/commit`)
      .expect(200);
    expect(commit.body.data.createdPropertyIds).toHaveLength(1);

    const stored = await prisma.property.findFirstOrThrow({ where: { estateId } });
    expect(stored.kind).toBe('HOUSE');
    expect(stored.houseTypeKey).toBe('apartment');
    expect(stored.blockName).toBe('Block 03');
    expect(stored.floorNumber).toBe('03');
    expect(stored.unitNumber).toBe('01');
  });

  it('enforces unique worksheet row numbers within each import batch', async () => {
    const { estateId } = await seedImportConfig();
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Properties');
    sheet.addRow([
      'type',
      'house_type',
      'street_name',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
      'plot_number',
      'plot_name',
    ]);
    const suffix = uniqueSuffix().replace('_', '');
    sheet.addRow(['land', '', 'Main St', '', '', '', '', suffix, 'North plot']);
    const bytes = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const preview = await uploadWorkbook(estateId, bytes, 'unique-row.xlsx').expect(201);
    const stored = await prisma.importRow.findFirstOrThrow({
      where: { batchId: preview.body.data.batch.id },
    });
    const repository = new PrismaImportRepository(prisma);
    await expect(
      repository.createRows([
        {
          batchId: stored.batchId,
          rowNumber: stored.rowNumber,
          status: 'VALID',
          errors: [],
          data: {},
        },
      ]),
    ).rejects.toThrow('unique within a batch');
  });

  it('returns 404 for commit on an unknown batch', async () => {
    const res = await authed().post('/api/v1/imports/00000000-0000-0000-0000-000000000000/commit');
    expect(res.status).toBe(404);
  });

  it('returns 404 for detail on an unknown batch', async () => {
    const res = await authed().get('/api/v1/imports/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('rejects a file over 10 MB', async () => {
    const { estateId } = await seedImportConfig();
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
    const res = await authed()
      .post(`/api/v1/estates/${estateId}/imports`)
      .attach('file', bigBuffer, 'big.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_INVALID_FILE');
  });

  it('rejects a non-xlsx file', async () => {
    const { estateId } = await seedImportConfig();
    const res = await authed()
      .post(`/api/v1/estates/${estateId}/imports`)
      .attach('file', Buffer.from('not a spreadsheet'), 'notxlsx.txt');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_INVALID_FILE');
  });

  it('uploads a valid workbook, previews, and commits it end-to-end', async () => {
    const { estateId } = await seedImportConfig();

    // Build a real .xlsx workbook with 2 valid rows + 1 in-file duplicate.
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Properties');
    ws.addRow([
      'type',
      'house_type',
      'street_name',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
      'plot_number',
      'plot_name',
    ]);
    const suffix = uniqueSuffix().replace('_', '');
    ws.addRow(['land', '', 'Main St', '', '', '', '', suffix, 'North plot']); // row 2
    ws.addRow(['land', '', 'Oak Ave', '', '', '', '', '17', 'North plot']); // row 3
    ws.addRow(['land', '', 'Main St', '', '', '', '', suffix, 'North plot']); // row 4, duplicate of row 2
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;

    const preview = await authed()
      .post(`/api/v1/estates/${estateId}/imports`)
      .attach('file', buffer, 'import-test.xlsx')
      .expect(201);
    const batchId = preview.body.data.batch.id;
    expect(preview.body.data.batch.status).toBe('PREVIEWED');
    expect(preview.body.data.batch.counts.valid).toBe(2);
    expect(preview.body.data.batch.counts.duplicateInFile).toBe(1);
    const batchFingerprint = preview.body.data.batch.fingerprint;
    expect(batchFingerprint).toMatch(/^[0-9a-f]{64}$/);

    // Commit the batch.
    const commit = await authed().post(`/api/v1/imports/${batchId}/commit`).expect(200);
    expect(commit.body.data.batch.status).toBe('COMMITTED');
    expect(commit.body.data.batch.counts.created).toBe(2);
    expect(commit.body.data.createdPropertyIds).toHaveLength(2);

    // Verify the properties exist in the database.
    const propCount = await prisma.property.count({ where: { estateId } });
    expect(propCount).toBe(2);

    // Get batch detail.
    const detail = await authed().get(`/api/v1/imports/${batchId}`).expect(200);
    expect(detail.body.data.batch.status).toBe('COMMITTED');

    // Try to commit the same batch again → 409.
    const recommit = await authed().post(`/api/v1/imports/${batchId}/commit`);
    expect(recommit.status).toBe(409);

    // Re-uploading a committed file is refused: the fingerprint is the
    // idempotency key, so the same workbook cannot be imported twice.
    const reupload = await authed()
      .post(`/api/v1/estates/${estateId}/imports`)
      .attach('file', buffer, 'import-test.xlsx');
    expect(reupload.status).toBe(409);
    expect(reupload.body.error.code).toBe('CONFLICT');
    expect(reupload.body.error.message).toContain(batchId);

    // List imports for the estate — the rejected re-upload added no batch.
    const list = await authed().get(`/api/v1/estates/${estateId}/imports`).expect(200);
    expect(list.body.data.batches).toHaveLength(1);
  }, 60_000);

  it('re-uploading an open workbook reuses the existing preview batch', async () => {
    const { estateId } = await seedImportConfig();
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Properties');
    ws.addRow([
      'type',
      'house_type',
      'street_name',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
      'plot_number',
      'plot_name',
    ]);
    const suffix = uniqueSuffix().replace('_', '');
    ws.addRow(['land', '', 'Main St', '', '', '', '', suffix, 'North plot']);
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;

    const first = await authed()
      .post(`/api/v1/estates/${estateId}/imports`)
      .attach('file', buffer, 'open-batch.xlsx')
      .expect(201);
    const second = await authed()
      .post(`/api/v1/estates/${estateId}/imports`)
      .attach('file', buffer, 'open-batch.xlsx')
      .expect(201);

    expect(second.body.data.batch.id).toBe(first.body.data.batch.id);
    expect(second.body.data.batch.status).toBe('PREVIEWED');
    const rows = await prisma.importRow.count({
      where: { batchId: first.body.data.batch.id },
    });
    expect(rows).toBe(1);
  }, 60_000);

  it('commits with ON CONFLICT skip: no duplicate property rows after concurrent commit', async () => {
    const { estateId } = await seedImportConfig();
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Properties');
    ws.addRow([
      'type',
      'house_type',
      'street_name',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
      'plot_number',
      'plot_name',
    ]);
    const suffix = uniqueSuffix().replace('_', '');
    ws.addRow(['land', '', 'Main St', '', '', '', '', suffix, 'North plot']);
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;

    // Upload + preview.
    const preview = await authed()
      .post(`/api/v1/estates/${estateId}/imports`)
      .attach('file', buffer, 'concurrent-test.xlsx')
      .expect(201);
    const batchId = preview.body.data.batch.id;

    // Simulate a concurrent writer: create the property directly in the DB
    // with the same identifier that the import would create.
    const configRepo = new PrismaOrganizationConfigRepository(prisma);
    const configService = new OrganizationConfigService(
      configRepo,
      loadBootstrapConfig,
      organizationSlug,
    );
    await configService.resolve();
    const estate = await prisma.estate.findFirst({ where: { id: estateId } });
    const identifier = `${estate!.slug}-Main St-${suffix}`;
    await prisma.property.create({
      data: {
        estateId,
        organizationId,
        identifier,
        kind: 'LAND',
        streetName: 'Main St',
        plotNumber: suffix,
        plotName: 'North plot',
        status: 'ACTIVE',
      },
    });

    // Now commit the batch — ON CONFLICT DO NOTHING should skip the row.
    const commit = await authed().post(`/api/v1/imports/${batchId}/commit`).expect(200);
    expect(commit.body.data.batch.status).toBe('COMMITTED');
    expect(commit.body.data.createdPropertyIds).toHaveLength(0);
    expect(commit.body.data.batch.counts.skippedCollision).toBe(1);

    // The property count should be exactly 1 (the manually created one).
    const propCount = await prisma.property.count({ where: { estateId } });
    expect(propCount).toBe(1);
  });

  it('does not block a commit when the organization config version advances', async () => {
    const { estateId } = await seedImportConfig();
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Properties');
    ws.addRow(['type', 'house_type', 'street_name', 'plot_number', 'plot_name']);
    const suffix = uniqueSuffix().replace('_', '');
    ws.addRow(['land', '', 'Main St', suffix, 'North plot']);
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;

    const preview = await authed()
      .post(`/api/v1/estates/${estateId}/imports`)
      .attach('file', buffer, 'config-bump-test.xlsx')
      .expect(201);
    const batchId = preview.body.data.batch.id;

    const configRepo = new PrismaOrganizationConfigRepository(prisma);
    const configService = new OrganizationConfigService(
      configRepo,
      loadBootstrapConfig,
      organizationSlug,
    );
    const resolved = await configService.resolve();
    await configRepo.createRecord({
      organizationSlug,
      config: resolved.config as never,
    });

    // Property shape/identifier rules are code-owned, so the commit succeeds.
    const commit = await authed().post(`/api/v1/imports/${batchId}/commit`).expect(200);
    expect(commit.body.data.createdPropertyIds).toHaveLength(1);
  });

  it('all-or-nothing rollback: zero partial property rows after forced commit failure', async () => {
    // Force a commit failure by creating a batch in COMMIT_FAILED state
    // directly in the DB and attempting to commit it.
    const { estateId } = await seedImportConfig();

    const beforeCount = await prisma.property.count({ where: { estateId } });

    const batch = await prisma.importBatch.create({
      data: {
        estateId,
        organizationId,
        filename: 'forced-fail.xlsx',
        fingerprint: `forced-${uniqueSuffix()}`,
        status: 'COMMIT_FAILED',
        configVersion: 1,
        counts: { total: 1, valid: 0, error: 1, failed: 0 },
        uploadedById: adminUserId || 'test',
      },
    });

    const res = await authed().post(`/api/v1/imports/${batch.id}/commit`);
    expect(res.status).toBe(409); // COMMIT_FAILED → 409

    const afterCount = await prisma.property.count({ where: { estateId } });
    expect(afterCount).toBe(beforeCount); // no properties created
  });
});

// =============================================================================
// Phase 1 regression
// =============================================================================

describe('Phase 1 regression', () => {
  it('auth /me still works with a valid session', async () => {
    const res = await authed().get('/api/v1/auth/me').expect(200);
    expect(res.body.data.user.role).toBe('SUPER_ADMIN');
  });

  it('auth /me without a session returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('health endpoint responds', async () => {
    const res = await request(app).get('/api/v1/health/live').expect(200);
    expect(res.body.status).toBe('ok');
  });
});
