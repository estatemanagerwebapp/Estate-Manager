/**
 * Resident notifications routes (S10) integration test.
 *
 * Exercises the full S10 surface end to end:
 *
 *   - `GET /resident/notifications` — the resident's recent notifications,
 *     the unread count and the bookings they are waiting on.
 *   - `POST /resident/notifications/:id/read` — mark one of the resident's
 *     own notifications as read.
 *   - a booking request enqueues a notification for the resident.
 *   - self-scoping: one resident never sees or marks another's
 *     notification.
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
import { PrismaNotificationRepository } from './modules/resident/notifications-repository.js';
import { ResidentNotificationsService } from './modules/resident/notifications.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let propertyId = '';
let facilityId = '';
let residentCookie = '';
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
      email: `notif_${firstName.toLowerCase()}_${uniqueSuffix()}@example.com`,
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
    data: { idDocumentUrl: `/media/${organizationId}/notif-doc-${firstName}` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: `NOTIF-${firstName}-001` });
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

beforeAll(async () => {
  prisma = getPrismaClient();

  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const resetTokens = new PrismaPasswordResetRepository(prisma);
  const audit = new PrismaAuditRepository(prisma);
  const permissions = new PermissionResolver(async () => []);
  const email = new MockEmailAdapter();

  const org = await prisma.organization.create({
    data: { slug: `notifications_test_${uniqueSuffix()}`, name: 'Notifications Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `notif_admin_${uniqueSuffix()}@example.com`,
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
    name: 'Notifications Estate',
    slug: `notif_est_${uniqueSuffix()}`,
    address: null,
  });
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    kind: 'LAND',
    identifier: `NOTIF-${uniqueSuffix()}`,
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

  const residentNotificationsService = new ResidentNotificationsService({
    notifications: new PrismaNotificationRepository(prisma),
  });

  const residentBookingsService = new ResidentBookingsService({
    bookings: new PrismaBookingRepository(prisma),
    audit,
    loadEstateId: async (orgId, userId) => {
      const draft = await drafts.findByUser(userId);
      if (!draft?.propertyId) return null;
      const record = await properties.findById(orgId, draft.propertyId);
      return record?.estateId ?? null;
    },
    onBookingCreated: async (hook) => {
      await residentNotificationsService.notify(hook.organizationId, hook.userId, {
        kind: 'BOOKING',
        title: `Booking requested — ${hook.facilityName}`,
        body: 'Your request was sent to the estate office.',
        linkTo: '/resident/app/bookings',
      });
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
      notifications: residentNotificationsService,
    },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  const first = await onboardResident('Ada', '+2348007770001');
  residentCookie = first.cookie;

  const second = await onboardResident('Bode', '+2348007770002');
  secondResidentCookie = second.cookie;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { organizationId } });
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

describe('resident notifications (S10)', () => {
  it('rejects the notification routes without a session', async () => {
    expect((await request(app).get('/api/v1/resident/notifications')).status).toBe(401);
    expect(
      (
        await request(app).post(
          '/api/v1/resident/notifications/00000000-0000-4000-8000-000000000000/read',
        )
      ).status,
    ).toBe(401);
  });

  it('starts with an empty inbox', async () => {
    const response = await request(app)
      .get('/api/v1/resident/notifications')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { recentNotifications, unreadCount, upcomingBookings } = response.body.data;
    expect(recentNotifications).toEqual([]);
    expect(unreadCount).toBe(0);
    expect(upcomingBookings).toEqual([]);
  });

  it('enqueues a notification when the resident requests a booking', async () => {
    const booking = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId, startsAt: at(2), endsAt: at(2, 2) });
    expect(booking.status).toBe(201);

    const response = await request(app)
      .get('/api/v1/resident/notifications')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const { recentNotifications, unreadCount, upcomingBookings } = response.body.data;
    expect(recentNotifications.length).toBe(1);
    expect(recentNotifications[0].kind).toBe('BOOKING');
    expect(recentNotifications[0].read).toBe(false);
    expect(recentNotifications[0].title).toContain('Function Room');
    expect(recentNotifications[0].linkTo).toBe('/resident/app/bookings');
    expect(unreadCount).toBe(1);
    // The booking the resident is waiting on is in the same view.
    expect(upcomingBookings.length).toBe(1);
    expect(upcomingBookings[0].facilityName).toBe('Function Room');
  });

  it('marks a notification as read and updates the unread count', async () => {
    const listed = await request(app)
      .get('/api/v1/resident/notifications')
      .set('Cookie', residentCookie);
    const notificationId = listed.body.data.recentNotifications[0].id as string;

    const response = await request(app)
      .post(`/api/v1/resident/notifications/${notificationId}/read`)
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.ok).toBe(true);

    const row = await prisma.notification.findUnique({ where: { id: notificationId } });
    expect(row!.read).toBe(true);

    const after = await request(app)
      .get('/api/v1/resident/notifications')
      .set('Cookie', residentCookie);
    expect(after.body.data.unreadCount).toBe(0);
    expect(after.body.data.recentNotifications[0].read).toBe(true);

    // Marking it again is a no-op, not an error.
    const again = await request(app)
      .post(`/api/v1/resident/notifications/${notificationId}/read`)
      .set('Cookie', residentCookie);
    expect(again.status).toBe(200);
  });

  it('does not let one resident read another resident notification', async () => {
    const listed = await request(app)
      .get('/api/v1/resident/notifications')
      .set('Cookie', residentCookie);
    const notificationId = listed.body.data.recentNotifications[0].id as string;

    const response = await request(app)
      .post(`/api/v1/resident/notifications/${notificationId}/read`)
      .set('Cookie', secondResidentCookie);
    expect(response.status).toBe(404);
  });

  it('keeps each resident inbox independent', async () => {
    const first = await request(app)
      .get('/api/v1/resident/notifications')
      .set('Cookie', residentCookie);
    expect(first.body.data.recentNotifications.length).toBe(1);

    const second = await request(app)
      .get('/api/v1/resident/notifications')
      .set('Cookie', secondResidentCookie);
    expect(second.body.data.recentNotifications.length).toBe(0);
    expect(second.body.data.unreadCount).toBe(0);
    expect(second.body.data.upcomingBookings.length).toBe(0);
  });

  it('rejects a read receipt for an unknown notification', async () => {
    const response = await request(app)
      .post('/api/v1/resident/notifications/00000000-0000-4000-8000-000000000000/read')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(404);
  });
});
