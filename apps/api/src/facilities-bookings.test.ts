/**
 * Phase 7 operator facilities & bookings integration test.
 *
 * Covers the facility register, the booking lifecycle, manual payment
 * verification with no invoice before verification, availability watches and
 * the notification produced when a watched slot is freed.
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
import { PrismaResidentOnboardingRepository } from './modules/auth/resident-onboarding-repository.js';
import { PrismaBookingRepository } from './modules/resident/bookings-repository.js';
import { ResidentBookingsService } from './modules/resident/bookings.service.js';
import { PrismaNotificationRepository } from './modules/resident/notifications-repository.js';
import { ResidentNotificationsService } from './modules/resident/notifications.service.js';
import { PrismaFinanceRepository } from './modules/resident/finance-repository.js';
import { PrismaFacilitiesRepository } from './modules/facilities/facilities-repository.js';
import { OperatorFacilitiesService } from './modules/facilities/facilities.service.js';
import { OperatorBookingsService } from './modules/facilities/bookings.service.js';
import { AvailabilityService } from './modules/facilities/availability.service.js';
import { BookingPaymentService } from './modules/facilities/booking-payment.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let auditorCookie = '';
let residentCookie = '';
let residentId = '';
let secondResidentCookie = '';
let secondResidentId = '';
let estateId = '';
let paidFacilityId = '';
let freeFacilityId = '';
let secondPaidFacilityId = '';
let otherEstateFacilityId = '';

let paidBookingId = '';
let freeBookingId = '';
let failedPrecheckBookingId = '';

const ADMIN_PASSWORD = 'Sup3rSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

function at(days: number, hours = 0): string {
  return new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();
}

async function createResident(
  firstName: string,
  propertyId: string,
): Promise<{ cookie: string; userId: string }> {
  const email = `phase7_${firstName.toLowerCase()}_${uniqueSuffix()}@example.com`;
  const password = 'ResidentPass123';
  const user = await prisma.user.create({
    data: {
      organizationId,
      email,
      passwordHash: await hashPassword(password),
      fullName: firstName,
      phone: `+23480055${Math.floor(Math.random() * 90_000 + 10_000)}`,
      role: 'RESIDENT',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  await prisma.residentOnboarding.create({
    data: {
      organizationId,
      propertyId,
      estateId,
      status: 'COMPLETED',
      codeHash: `${randomHex()}${randomHex()}`,
      firstName,
      email,
      paymentStatus: 'PAID',
      completedAt: new Date(),
      userId: user.id,
    },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { cookie: cookieFrom(login), userId: user.id };
}

function randomHex(): string {
  return Math.random().toString(16).slice(2).padEnd(16, '0').slice(0, 16);
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
    data: { slug: `phase7_${uniqueSuffix()}`, name: 'Phase 7 Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `phase7_admin_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  const auditor = await prisma.user.create({
    data: {
      organizationId,
      email: `phase7_auditor_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: 'AUDITOR',
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });

  const estateRepo = new PrismaEstateRepository(prisma);
  const propertyRepo = new PrismaPropertyRepository(prisma);
  const estate = await estateRepo.create({
    organizationId,
    name: 'Phase 7 Estate',
    slug: `phase7_estate_${uniqueSuffix()}`,
    address: null,
  });
  estateId = estate.id;
  const otherEstate = await estateRepo.create({
    organizationId,
    name: 'Phase 7 Other Estate',
    slug: `phase7_other_${uniqueSuffix()}`,
    address: null,
  });
  const property = await propertyRepo.create({
    organizationId,
    estateId,
    kind: 'LAND',
    identifier: `P7-${uniqueSuffix()}`,
    streetName: 'Phase 7 Street',
    plotNumber: '7',
    plotName: 'Phase 7 Plot',
    name: null,
  });
  await propertyRepo.create({
    organizationId,
    estateId: otherEstate.id,
    kind: 'LAND',
    identifier: `P7O-${uniqueSuffix()}`,
    streetName: 'Other Street',
    plotNumber: '8',
    plotName: 'Other Plot',
    name: null,
  });

  const paid = await prisma.facility.create({
    data: {
      organizationId,
      estateId,
      name: 'Paid Hall',
      description: 'Hired hall.',
      usageFeeKobo: 500_000,
      bookable: true,
    },
  });
  paidFacilityId = paid.id;
  const free = await prisma.facility.create({
    data: {
      organizationId,
      estateId,
      name: 'Free Ground',
      description: 'Open ground.',
      usageFeeKobo: 0,
      bookable: true,
    },
  });
  freeFacilityId = free.id;
  const secondPaid = await prisma.facility.create({
    data: {
      organizationId,
      estateId,
      name: 'Second Paid Hall',
      description: 'Another hired space.',
      usageFeeKobo: 250_000,
      bookable: true,
    },
  });
  secondPaidFacilityId = secondPaid.id;
  const otherFacility = await prisma.facility.create({
    data: {
      organizationId,
      estateId: otherEstate.id,
      name: 'Other Estate Hall',
      description: 'Not on the resident estate.',
      usageFeeKobo: 0,
    },
  });
  otherEstateFacilityId = otherFacility.id;

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

  const drafts = new PrismaResidentOnboardingRepository(prisma);
  const bookingRepo = new PrismaBookingRepository(prisma);
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const residentNotifications = new ResidentNotificationsService({
    notifications: notificationRepo,
  });
  const availability = new AvailabilityService({
    bookings: bookingRepo,
    notify: (orgId, userId, input) => residentNotifications.notify(orgId, userId, input),
  });
  const residentBookings = new ResidentBookingsService({
    bookings: bookingRepo,
    audit,
    availability,
    loadEstateId: async (orgId, userId) => {
      const draft = await drafts.findByUser(userId);
      if (!draft?.propertyId) return null;
      const record = await propertyRepo.findById(orgId, draft.propertyId);
      return record?.estateId ?? null;
    },
  });

  const financeRepo = new PrismaFinanceRepository(prisma);
  const facilitiesRepo = new PrismaFacilitiesRepository(prisma);
  const operatorFacilities = new OperatorFacilitiesService({
    facilities: facilitiesRepo,
    audit,
    availability,
  });
  const operatorBookings = new OperatorBookingsService({
    bookings: facilitiesRepo,
    audit,
    availability,
  });
  const bookingPayment = new BookingPaymentService({
    bookings: facilitiesRepo,
    finance: financeRepo,
    audit,
  });

  app = createApp({
    checkDatabase: async () => {},
    rateLimitMax: 1000,
    auth: {
      authService,
      sessions,
      permissions,
      organizationId,
      rateLimits: { loginPerWindow: 1000, forgotPerWindow: 1000, resetPerWindow: 1000 },
    },
    resident: {
      sessions,
      permissions,
      organizationId,
      bookings: residentBookings,
    },
    facilities: {
      sessions,
      permissions,
      organizationId,
      facilities: operatorFacilities,
    },
    bookings: {
      sessions,
      permissions,
      organizationId,
      bookings: operatorBookings,
      payment: bookingPayment,
    },
  });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: admin.email, password: ADMIN_PASSWORD });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  const auditorLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: auditor.email, password: ADMIN_PASSWORD });
  expect(auditorLogin.status).toBe(200);
  auditorCookie = cookieFrom(auditorLogin);

  const first = await createResident('Ada', property.id);
  residentCookie = first.cookie;
  residentId = first.userId;
  const second = await createResident('Bode', property.id);
  secondResidentCookie = second.cookie;
  secondResidentId = second.userId;
});

afterAll(async () => {
  await prisma.facilityAvailabilityWatch.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.payment.deleteMany({ where: { organizationId } });
  await prisma.invoice.deleteMany({ where: { organizationId } });
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

describe('Phase 7 facilities and bookings', () => {
  it('enforces read/manage permissions on the facility register', async () => {
    expect((await request(app).get('/api/v1/facilities')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/facilities').set('Cookie', residentCookie)).status,
    ).toBe(403);

    const read = await request(app).get('/api/v1/facilities').set('Cookie', auditorCookie);
    expect(read.status).toBe(200);
    expect(read.body.data.facilities.length).toBe(4);

    const denied = await request(app).post('/api/v1/facilities').set('Cookie', auditorCookie).send({
      name: 'Auditor Hall',
      description: 'Nope.',
      estateId,
      usageFeeKobo: 0,
    });
    expect(denied.status).toBe(403);
  });

  it('creates, edits and archives a facility', async () => {
    const created = await request(app).post('/api/v1/facilities').set('Cookie', adminCookie).send({
      name: 'Committee Room',
      description: 'Small meeting room.',
      estateId,
      usageFeeKobo: 100_000,
      bookable: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.facility.usageFeeKobo).toBe(100_000);
    expect(created.body.data.facility.estate.id).toBe(estateId);
    const facilityId = created.body.data.facility.id as string;

    const updated = await request(app)
      .patch(`/api/v1/facilities/${facilityId}`)
      .set('Cookie', adminCookie)
      .send({ usageFeeKobo: 150_000, bookable: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.facility.usageFeeKobo).toBe(150_000);
    expect(updated.body.data.facility.bookable).toBe(false);

    const foreignEstate = await request(app)
      .post('/api/v1/facilities')
      .set('Cookie', adminCookie)
      .send({
        name: 'Foreign',
        description: 'No.',
        estateId: '00000000-0000-4000-8000-000000000000',
      });
    expect(foreignEstate.status).toBe(404);

    const archived = await request(app)
      .post(`/api/v1/facilities/${facilityId}/archive`)
      .set('Cookie', adminCookie);
    expect(archived.status).toBe(200);
    expect(archived.body.data.facility.archivedAt).not.toBeNull();
    expect(archived.body.data.facility.bookable).toBe(false);

    const archivedList = await request(app)
      .get('/api/v1/facilities?status=ARCHIVED')
      .set('Cookie', adminCookie);
    expect(archivedList.status).toBe(200);
    expect(archivedList.body.data.facilities.map((row: { id: string }) => row.id)).toContain(
      facilityId,
    );

    const auditRows = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        eventType: { in: ['facility_created', 'facility_updated', 'facility_archived'] },
      },
    });
    expect(auditRows.length).toBe(3);
  });

  it('lists estate facilities and starts a paid-fee booking UNPAID', async () => {
    const listed = await request(app)
      .get('/api/v1/resident/facilities')
      .set('Cookie', residentCookie);
    expect(listed.status).toBe(200);
    const ids = listed.body.data.facilities.map((row: { id: string }) => row.id);
    expect(ids).toContain(paidFacilityId);
    expect(ids).toContain(freeFacilityId);
    expect(ids).not.toContain(otherEstateFacilityId);
    expect(
      listed.body.data.facilities.find((row: { id: string }) => row.id === paidFacilityId)
        .usageFeeKobo,
    ).toBe(500_000);

    const created = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId: paidFacilityId, startsAt: at(10), endsAt: at(10, 2) });
    expect(created.status).toBe(201);
    paidBookingId = created.body.data.booking.id as string;
    expect(created.body.data.booking.status).toBe('REQUESTED');
    expect(created.body.data.booking.feeKobo).toBe(500_000);
    expect(created.body.data.booking.paymentStatus).toBe('UNPAID');
    expect(created.body.data.booking.invoiceId).toBeNull();
    expect(await prisma.invoice.count({ where: { organizationId } })).toBe(0);
  });

  it('shows the queue to readers and blocks an unpaid confirmation', async () => {
    const queue = await request(app)
      .get('/api/v1/bookings?paymentStatus=UNPAID')
      .set('Cookie', auditorCookie);
    expect(queue.status).toBe(200);
    const booking = queue.body.data.bookings.find(
      (row: { id: string }) => row.id === paidBookingId,
    );
    expect(booking.resident.id).toBe(residentId);
    expect(booking.property.identifier).toContain('P7-');
    expect(booking.estate.id).toBe(estateId);

    const confirm = await request(app)
      .post(`/api/v1/bookings/${paidBookingId}/confirm`)
      .set('Cookie', adminCookie);
    expect(confirm.status).toBe(409);
    expect(confirm.body.error.message).toMatch(/payment/i);

    const row = await prisma.booking.findUnique({ where: { id: paidBookingId } });
    expect(row!.status).toBe('REQUESTED');
  });

  it('verifies payment atomically without confirming the booking', async () => {
    const paid = await request(app)
      .post(`/api/v1/bookings/${paidBookingId}/payment`)
      .set('Cookie', adminCookie)
      .send({ method: 'BANK_TRANSFER', reference: 'TRF-777' });
    expect(paid.status).toBe(201);
    expect(paid.body.data.booking.status).toBe('REQUESTED');
    expect(paid.body.data.booking.paymentStatus).toBe('PAID');
    expect(paid.body.data.booking.invoiceId).toBe(paid.body.data.invoice.id);
    expect(paid.body.data.invoice.status).toBe('PAID');
    expect(paid.body.data.invoice.amountKobo).toBe(500_000);
    expect(paid.body.data.invoice.period).toContain('Paid Hall');
    expect(paid.body.data.payment.amountKobo).toBe(500_000);

    expect(await prisma.invoice.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.payment.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.transaction.count({ where: { organizationId } })).toBe(2);

    const duplicate = await request(app)
      .post(`/api/v1/bookings/${paidBookingId}/payment`)
      .set('Cookie', adminCookie)
      .send({ method: 'CASH' });
    expect(duplicate.status).toBe(409);
    expect(await prisma.invoice.count({ where: { organizationId } })).toBe(1);

    // A later facility price change does not rewrite the snapshot.
    await prisma.facility.update({
      where: { id: paidFacilityId },
      data: { usageFeeKobo: 900_000 },
    });
    const row = await prisma.booking.findUnique({ where: { id: paidBookingId } });
    expect(row!.feeKobo).toBe(500_000);

    const confirmed = await request(app)
      .post(`/api/v1/bookings/${paidBookingId}/confirm`)
      .set('Cookie', adminCookie);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.booking.status).toBe('CONFIRMED');

    const early = await request(app)
      .post(`/api/v1/bookings/${paidBookingId}/complete`)
      .set('Cookie', adminCookie);
    expect(early.status).toBe(409);

    const cancelled = await request(app)
      .post(`/api/v1/bookings/${paidBookingId}/cancel`)
      .set('Cookie', adminCookie);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.booking.status).toBe('CANCELLED');
    // A paid invoice survives the cancellation.
    expect(await prisma.invoice.count({ where: { organizationId } })).toBe(1);

    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        eventType: {
          in: ['booking_confirmed', 'booking_cancelled', 'invoice_created', 'payment_recorded'],
        },
      },
    });
    expect(audits.length).toBe(4);
  });

  it('confirms and completes a free booking without an invoice', async () => {
    const created = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId: freeFacilityId, startsAt: at(11), endsAt: at(11, 2) });
    expect(created.status).toBe(201);
    freeBookingId = created.body.data.booking.id as string;
    expect(created.body.data.booking.feeKobo).toBe(0);
    expect(created.body.data.booking.paymentStatus).toBe('NOT_REQUIRED');

    const payment = await request(app)
      .post(`/api/v1/bookings/${freeBookingId}/payment`)
      .set('Cookie', adminCookie)
      .send({ method: 'CASH' });
    expect(payment.status).toBe(409);
    expect(await prisma.invoice.count({ where: { organizationId } })).toBe(1);

    const confirmed = await request(app)
      .post(`/api/v1/bookings/${freeBookingId}/confirm`)
      .set('Cookie', adminCookie);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.booking.status).toBe('CONFIRMED');

    // Move the window into the past to exercise completion.
    await prisma.booking.update({
      where: { id: freeBookingId },
      data: { startsAt: at(-2), endsAt: at(-1) },
    });
    const completed = await request(app)
      .post(`/api/v1/bookings/${freeBookingId}/complete`)
      .set('Cookie', adminCookie);
    expect(completed.status).toBe(200);
    expect(completed.body.data.booking.status).toBe('COMPLETED');
  });

  it('creates no invoice when payment verification precheck fails', async () => {
    const created = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({
        facilityId: secondPaidFacilityId,
        startsAt: at(12, 1),
        endsAt: at(12, 3),
      });
    expect(created.status).toBe(201);
    failedPrecheckBookingId = created.body.data.booking.id as string;

    const conflict = await prisma.booking.create({
      data: {
        organizationId,
        userId: secondResidentId,
        facilityId: secondPaidFacilityId,
        startsAt: new Date(at(12, 1.5)),
        endsAt: new Date(at(12, 2)),
        status: 'REQUESTED',
        feeKobo: 0,
        paymentStatus: 'NOT_REQUIRED',
      },
    });

    const invoicesBefore = await prisma.invoice.count({ where: { organizationId } });
    const paid = await request(app)
      .post(`/api/v1/bookings/${failedPrecheckBookingId}/payment`)
      .set('Cookie', adminCookie)
      .send({ method: 'CASH' });
    expect(paid.status).toBe(409);
    expect(await prisma.invoice.count({ where: { organizationId } })).toBe(invoicesBefore);

    const row = await prisma.booking.findUnique({
      where: { id: failedPrecheckBookingId },
    });
    expect(row!.paymentStatus).toBe('UNPAID');
    expect(row!.invoiceId).toBeNull();

    await prisma.booking.delete({ where: { id: conflict.id } });
    const cancel = await request(app)
      .post(`/api/v1/bookings/${failedPrecheckBookingId}/cancel`)
      .set('Cookie', adminCookie);
    expect(cancel.status).toBe(200);
  });

  it('watches an occupied window and notifies when it becomes free', async () => {
    const watchedStart = at(15);
    const watchedEnd = at(15, 2);
    const created = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId: freeFacilityId, startsAt: watchedStart, endsAt: watchedEnd });
    expect(created.status).toBe(201);
    const bookingId = created.body.data.booking.id as string;

    const watch = await request(app)
      .post('/api/v1/resident/facility-watches')
      .set('Cookie', secondResidentCookie)
      .send({
        facilityId: freeFacilityId,
        startsAt: watchedStart,
        endsAt: watchedEnd,
      });
    expect(watch.status).toBe(201);
    expect(watch.body.data.watch.status).toBe('WAITING');
    const watchId = watch.body.data.watch.id as string;

    const duplicate = await request(app)
      .post('/api/v1/resident/facility-watches')
      .set('Cookie', secondResidentCookie)
      .send({
        facilityId: freeFacilityId,
        startsAt: watchedStart,
        endsAt: watchedEnd,
      });
    expect(duplicate.status).toBe(409);

    const freeSlot = await request(app)
      .post('/api/v1/resident/facility-watches')
      .set('Cookie', secondResidentCookie)
      .send({
        facilityId: freeFacilityId,
        startsAt: at(16),
        endsAt: at(16, 2),
      });
    expect(freeSlot.status).toBe(409);

    const cancelled = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Cookie', adminCookie);
    expect(cancelled.status).toBe(200);

    const watchRow = await prisma.facilityAvailabilityWatch.findUnique({
      where: { id: watchId },
    });
    expect(watchRow!.status).toBe('NOTIFIED');
    expect(watchRow!.notifiedAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({
      where: { organizationId, userId: secondResidentId },
    });
    expect(notifications.length).toBe(1);
    expect(notifications[0].kind).toBe('BOOKING');
    expect(notifications[0].title).toContain('Free Ground');
    expect(notifications[0].body).toContain('now free');

    const list = await request(app)
      .get('/api/v1/resident/facility-watches')
      .set('Cookie', secondResidentCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.watches[0].status).toBe('NOTIFIED');
    expect(list.body.data.watches[0].startsAt).toBe(watchedStart);

    const cannotCancel = await request(app)
      .post(`/api/v1/resident/facility-watches/${watchId}/cancel`)
      .set('Cookie', secondResidentCookie);
    expect(cannotCancel.status).toBe(409);
  });

  it('excludes the cancelling resident from their own watch notification', async () => {
    const created = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId: freeFacilityId, startsAt: at(18), endsAt: at(18, 2) });
    const bookingId = created.body.data.booking.id as string;

    const ownWatch = await request(app)
      .post('/api/v1/resident/facility-watches')
      .set('Cookie', residentCookie)
      .send({ facilityId: freeFacilityId, startsAt: at(18), endsAt: at(18, 2) });
    expect(ownWatch.status).toBe(201);
    const ownWatchId = ownWatch.body.data.watch.id as string;

    const otherWatch = await request(app)
      .post('/api/v1/resident/facility-watches')
      .set('Cookie', secondResidentCookie)
      .send({ facilityId: freeFacilityId, startsAt: at(18), endsAt: at(18, 2) });
    expect(otherWatch.status).toBe(201);

    const cancelled = await request(app)
      .post(`/api/v1/resident/bookings/${bookingId}/cancel`)
      .set('Cookie', residentCookie);
    expect(cancelled.status).toBe(200);

    const ownRow = await prisma.facilityAvailabilityWatch.findUnique({
      where: { id: ownWatchId },
    });
    expect(ownRow!.status).toBe('WAITING');
    expect(await prisma.notification.count({ where: { organizationId, userId: residentId } })).toBe(
      0,
    );
    expect(
      await prisma.notification.count({
        where: { organizationId, userId: secondResidentId },
      }),
    ).toBe(2);
  });

  it('blocks confirmation while suspended and allows it after re-enabling', async () => {
    const created = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId: freeFacilityId, startsAt: at(20), endsAt: at(20, 2) });
    expect(created.status).toBe(201);
    const bookingId = created.body.data.booking.id as string;

    const suspended = await request(app)
      .patch(`/api/v1/facilities/${freeFacilityId}`)
      .set('Cookie', adminCookie)
      .send({ bookable: false });
    expect(suspended.status).toBe(200);

    const blocked = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Cookie', adminCookie);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/suspended/i);

    const reenabled = await request(app)
      .patch(`/api/v1/facilities/${freeFacilityId}`)
      .set('Cookie', adminCookie)
      .send({ bookable: true });
    expect(reenabled.status).toBe(200);

    const confirmed = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Cookie', adminCookie);
    expect(confirmed.status).toBe(200);

    const cancelled = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Cookie', adminCookie);
    expect(cancelled.status).toBe(200);
  });

  it('blocks archiving a facility with a live booking and cancels watches', async () => {
    const created = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId: freeFacilityId, startsAt: at(22), endsAt: at(22, 2) });
    const bookingId = created.body.data.booking.id as string;

    const blocked = await request(app)
      .post(`/api/v1/facilities/${freeFacilityId}/archive`)
      .set('Cookie', adminCookie);
    expect(blocked.status).toBe(409);

    await request(app).post(`/api/v1/bookings/${bookingId}/cancel`).set('Cookie', adminCookie);

    // A direct WAITING row models a watch that survived to the archive step.
    const waitingWatch = await prisma.facilityAvailabilityWatch.create({
      data: {
        organizationId,
        facilityId: freeFacilityId,
        userId: secondResidentId,
        startsAt: new Date(at(23)),
        endsAt: new Date(at(23, 2)),
        status: 'WAITING',
      },
    });

    const archived = await request(app)
      .post(`/api/v1/facilities/${freeFacilityId}/archive`)
      .set('Cookie', adminCookie);
    expect(archived.status).toBe(200);
    expect(archived.body.data.facility.archivedAt).not.toBeNull();

    const watchRow = await prisma.facilityAvailabilityWatch.findUnique({
      where: { id: waitingWatch.id },
    });
    expect(watchRow!.status).toBe('CANCELLED');
    expect(watchRow!.cancelledAt).not.toBeNull();

    const residentRead = await request(app)
      .get('/api/v1/resident/facilities')
      .set('Cookie', residentCookie);
    expect(residentRead.body.data.facilities.map((row: { id: string }) => row.id)).not.toContain(
      freeFacilityId,
    );
  });

  it('rejects another organization id as not found', async () => {
    const otherOrg = await prisma.organization.create({
      data: { slug: `phase7_other_org_${uniqueSuffix()}`, name: 'Other Org' },
    });
    const otherFacility = await prisma.facility.create({
      data: {
        organizationId: otherOrg.id,
        estateId: (
          await prisma.estate.create({
            data: {
              organizationId: otherOrg.id,
              name: 'Other Org Estate',
              slug: `otherorg_${uniqueSuffix()}`,
            },
          })
        ).id,
        name: 'Other Org Facility',
        description: 'Cross-org.',
      },
    });

    const response = await request(app)
      .patch(`/api/v1/facilities/${otherFacility.id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Hijacked' });
    expect(response.status).toBe(404);

    const bookingRead = await request(app)
      .get(`/api/v1/bookings?facilityId=${otherFacility.id}`)
      .set('Cookie', adminCookie);
    expect(bookingRead.status).toBe(200);
    expect(bookingRead.body.data.bookings).toEqual([]);

    await prisma.facility.deleteMany({ where: { organizationId: otherOrg.id } });
    await prisma.estate.deleteMany({ where: { organizationId: otherOrg.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});
