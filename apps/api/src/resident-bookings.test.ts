/**
 * Resident facilities & bookings routes (S8) integration test.
 *
 * Exercises the full S8 surface end to end:
 *
 *   - `GET /resident/facilities` — the facilities available on the
 *     resident's estate plus their upcoming and past bookings.
 *   - `POST /resident/bookings` — request a booking; audits
 *     `resident.booking_created`.
 *   - `POST /resident/bookings/:id/cancel` — cancel one of the resident's
 *     own bookings; audits `resident.booking_cancelled`.
 *   - validation: a window in the past, an end before the start, an
 *     over-long window, a non-bookable facility and an unknown facility
 *     are all rejected.
 *   - overlap: two bookings for the same slot conflict (409).
 *   - self-scoping: one resident cannot cancel another's booking (404).
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
import { PrismaBookingRepository } from './modules/resident/bookings-repository.js';
import { ResidentBookingsService } from './modules/resident/bookings.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let propertyId = '';
let facilityId = '';
let otherEstateFacilityId = '';
let nonBookableFacilityId = '';
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

/** An ISO timestamp `days` from now, shifted by `hours`. */
function at(days: number, hours = 0): string {
  return new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();
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
    data: { slug: `bookings_test_${uniqueSuffix()}`, name: 'Bookings Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `booking_admin_${uniqueSuffix()}@example.com`,
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
    name: 'Bookings Estate',
    slug: `book_est_${uniqueSuffix()}`,
    address: null,
  });
  const otherEstate = await estates.create({
    organizationId,
    name: 'Elsewhere Estate',
    slug: `book_other_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    kind: 'LAND',
    identifier: `BOOK-${uniqueSuffix()}`,
    streetName: 'Test Street',
    plotNumber: '1',
    plotName: 'Test plot',
    name: null,
  });
  propertyId = property.id;

  const facility = await prisma.facility.create({
    data: {
      organizationId,
      estateId: estate.id,
      name: 'Function Room',
      description: 'Seats up to 80 guests.',
      bookable: true,
    },
  });
  facilityId = facility.id;

  const nonBookable = await prisma.facility.create({
    data: {
      organizationId,
      estateId: estate.id,
      name: 'Generator House',
      description: 'Staff only.',
      bookable: false,
    },
  });
  nonBookableFacilityId = nonBookable.id;

  const otherEstateFacility = await prisma.facility.create({
    data: {
      organizationId,
      estateId: otherEstate.id,
      name: 'Other Estate Hall',
      description: 'Not available to this estate.',
      bookable: true,
    },
  });
  otherEstateFacilityId = otherEstateFacility.id;

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

  const residentBookingsService = new ResidentBookingsService({
    bookings: new PrismaBookingRepository(prisma),
    audit,
    loadEstateId: async (orgId, userId) => {
      const draft = await drafts.findByUser(userId);
      if (!draft?.propertyId) return null;
      const record = await properties.findById(orgId, draft.propertyId);
      return record?.estateId ?? null;
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
      bookings: residentBookingsService,
    },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  const first = await onboardResident('Ada', '+2348005550001');
  residentCookie = first.cookie;
  residentUserId = first.userId;

  const second = await onboardResident('Bode', '+2348005550002');
  secondResidentCookie = second.cookie;
});

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
      email: `booking_${firstName.toLowerCase()}_${uniqueSuffix()}@example.com`,
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
    data: { idDocumentUrl: `/media/${organizationId}/booking-doc-${firstName}` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: `BOOK-${firstName}-001` });
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

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { organizationId } });
  await prisma.facility.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

describe('resident facilities & bookings (S8)', () => {
  it('rejects the booking routes without a session', async () => {
    expect((await request(app).get('/api/v1/resident/facilities')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/resident/bookings')
          .send({ facilityId, startsAt: at(1), endsAt: at(1, 2) })
      ).status,
    ).toBe(401);
  });

  it('lists only the facilities available on the resident estate', async () => {
    const response = await request(app)
      .get('/api/v1/resident/facilities')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { facilities, upcoming, past } = response.body.data;
    const ids = facilities.map((facility: { id: string }) => facility.id);
    expect(ids).toContain(facilityId);
    expect(ids).toContain(nonBookableFacilityId);
    // The other estate's hall is not visible.
    expect(ids).not.toContain(otherEstateFacilityId);
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });

  it('requests a booking and audits it', async () => {
    const response = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({
        facilityId,
        startsAt: at(2),
        endsAt: at(2, 3),
        attendees: 25,
      });
    expect(response.status).toBe(201);
    expect(response.body.data.ok).toBe(true);

    const booking = response.body.data.booking;
    expect(booking.id).toBeDefined();
    expect(booking.facilityId).toBe(facilityId);
    expect(booking.facilityName).toBe('Function Room');
    expect(booking.status).toBe('REQUESTED');
    expect(booking.attendees).toBe(25);

    const row = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(residentUserId);
    expect(row!.status).toBe('REQUESTED');

    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_booking_created' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('lists the booking as upcoming', async () => {
    const response = await request(app)
      .get('/api/v1/resident/facilities')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.upcoming.length).toBe(1);
    expect(response.body.data.upcoming[0].facilityName).toBe('Function Room');
  });

  it('rejects an overlapping booking', async () => {
    const response = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId, startsAt: at(2, 1), endsAt: at(2, 4) });
    expect(response.status).toBe(409);
  });

  it('rejects an invalid booking window', async () => {
    const inThePast = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId, startsAt: at(-2), endsAt: at(-1) });
    expect(inThePast.status).toBe(400);

    const endsBeforeStart = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId, startsAt: at(3, 5), endsAt: at(3, 4) });
    expect(endsBeforeStart.status).toBe(400);

    const tooLong = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId, startsAt: at(4), endsAt: at(6) });
    expect(tooLong.status).toBe(400);
  });

  it('rejects a non-bookable or unavailable facility', async () => {
    const notBookable = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId: nonBookableFacilityId, startsAt: at(5), endsAt: at(5, 1) });
    expect(notBookable.status).toBe(409);

    const unknown = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({
        facilityId: '00000000-0000-4000-8000-000000000000',
        startsAt: at(5),
        endsAt: at(5, 1),
      });
    expect(unknown.status).toBe(404);

    const otherEstate = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({
        facilityId: otherEstateFacilityId,
        startsAt: at(5),
        endsAt: at(5, 1),
      });
    expect(otherEstate.status).toBe(404);
  });

  it('cancels a booking and audits it', async () => {
    const listed = await request(app)
      .get('/api/v1/resident/facilities')
      .set('Cookie', residentCookie);
    const bookingId = listed.body.data.upcoming[0].id as string;

    const response = await request(app)
      .post(`/api/v1/resident/bookings/${bookingId}/cancel`)
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.ok).toBe(true);
    expect(response.body.data.booking.status).toBe('CANCELLED');

    const row = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(row!.status).toBe('CANCELLED');

    // Cancelling twice is a conflict.
    const again = await request(app)
      .post(`/api/v1/resident/bookings/${bookingId}/cancel`)
      .set('Cookie', residentCookie);
    expect(again.status).toBe(409);

    const auditRows = await prisma.auditEvent.findMany({
      where: { organizationId, eventType: 'resident_booking_cancelled' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('moves a cancelled booking into the past list', async () => {
    const response = await request(app)
      .get('/api/v1/resident/facilities')
      .set('Cookie', residentCookie);
    expect(response.body.data.upcoming.length).toBe(0);
    expect(response.body.data.past.length).toBe(1);
    expect(response.body.data.past[0].status).toBe('CANCELLED');
  });

  it("does not let one resident cancel another resident's booking", async () => {
    const created = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', secondResidentCookie)
      .send({ facilityId, startsAt: at(7), endsAt: at(7, 2) });
    expect(created.status).toBe(201);
    const bookingId = created.body.data.booking.id as string;

    const response = await request(app)
      .post(`/api/v1/resident/bookings/${bookingId}/cancel`)
      .set('Cookie', residentCookie);
    expect(response.status).toBe(404);

    // The other resident's booking is untouched.
    const row = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(row!.status).toBe('REQUESTED');
  });

  it("keeps each resident's bookings independent", async () => {
    const first = await request(app)
      .get('/api/v1/resident/facilities')
      .set('Cookie', residentCookie);
    expect(first.body.data.upcoming.length).toBe(0);
    expect(first.body.data.past.length).toBe(1);

    const second = await request(app)
      .get('/api/v1/resident/facilities')
      .set('Cookie', secondResidentCookie);
    expect(second.body.data.upcoming.length).toBe(1);
    expect(second.body.data.past.length).toBe(0);
  });
});
