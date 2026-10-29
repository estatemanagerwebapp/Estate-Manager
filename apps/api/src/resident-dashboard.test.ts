/**
 * Resident dashboard home (S11) integration test.
 *
 * Exercises the aggregate endpoint end to end:
 *
 *   - `GET /resident/dashboard` — one request that composes the profile,
 *     property, finance, codes, estate-office and notification sections
 *     from the services S1–S10 already expose.
 *   - the sections reflect reality: a booking shows up as an upcoming
 *     booking and a notification, a filed complaint as an open complaint,
 *     an announcement and an estate broadcast as the latest community
 *     items.
 *   - every section tolerates empty data — a fresh resident gets zeroes
 *     and empty lists, not an error.
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
import { ResidentProfileService } from './modules/resident/profile.service.js';
import { ResidentPropertiesService } from './modules/resident/properties.service.js';
import { PrismaFinanceRepository } from './modules/resident/finance-repository.js';
import { ResidentFinanceService } from './modules/resident/finance.service.js';
import { PrismaAccessCodeRepository } from './modules/resident/codes-repository.js';
import { ResidentCodesService } from './modules/resident/codes.service.js';
import { PrismaComplaintRepository } from './modules/resident/complaints-repository.js';
import { ResidentComplaintsService } from './modules/resident/complaints.service.js';
import { PrismaCommunityRepository } from './modules/resident/community-repository.js';
import { ResidentCommunityService } from './modules/resident/community.service.js';
import { PrismaBookingRepository } from './modules/resident/bookings-repository.js';
import { ResidentBookingsService } from './modules/resident/bookings.service.js';
import { PrismaNotificationRepository } from './modules/resident/notifications-repository.js';
import { ResidentNotificationsService } from './modules/resident/notifications.service.js';
import { ResidentDashboardService } from './modules/resident/dashboard.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';

let prisma: PrismaClient;
let app: Express;
let organizationId = '';
let adminCookie = '';
let propertyId = '';
let estateId = '';
let facilityId = '';
let residentCookie = '';
let residentUserId = '';
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
    data: { slug: `dashboard_test_${uniqueSuffix()}`, name: 'Dashboard Test' },
  });
  organizationId = org.id;

  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `dash_admin_${uniqueSuffix()}@example.com`,
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
    name: 'Dashboard Estate',
    slug: `dash_est_${uniqueSuffix()}`,
    address: null,
  });
  estateId = estate.id;
  const property = await properties.create({
    organizationId,
    estateId: estate.id,
    kind: 'LAND',
    identifier: `DASH-${uniqueSuffix()}`,
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

  const residentFinanceService = new ResidentFinanceService({
    finance: new PrismaFinanceRepository(prisma),
    audit,
    registrationFee: async () => ({ amountKobo: 500_000, currency: 'NGN' }),
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
        estate: { name: parent?.name ?? '—', slug: parent?.slug ?? '' },
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

  const residentProfileService = new ResidentProfileService({
    users,
    drafts,
    audit,
    loadProperty: async (orgId, id) => {
      const record = await properties.findById(orgId, id);
      if (!record) return null;
      const parent = record.estateId ? await estates.findById(orgId, record.estateId) : null;
      return {
        identifier: record.identifier,
        estate: { name: parent?.name ?? '—', slug: parent?.slug ?? '' },
      };
    },
  });

  const residentPropertiesService = new ResidentPropertiesService({
    drafts,
    properties,
    estates,
  });

  const loadEstateId = async (orgId: string, userId: string): Promise<string | null> => {
    const draft = await drafts.findByUser(userId);
    if (!draft?.propertyId) return null;
    const record = await properties.findById(orgId, draft.propertyId);
    return record?.estateId ?? null;
  };

  const loadPropertyId = async (_orgId: string, userId: string): Promise<string | null> => {
    const draft = await drafts.findByUser(userId);
    return draft?.propertyId ?? null;
  };

  const residentCodesService = new ResidentCodesService({
    codes: new PrismaAccessCodeRepository(prisma),
    audit,
    loadPropertyId,
  });

  const residentComplaintsService = new ResidentComplaintsService({
    complaints: new PrismaComplaintRepository(prisma),
    audit,
    loadPropertyId,
  });

  const residentCommunityService = new ResidentCommunityService({
    community: new PrismaCommunityRepository(prisma),
    loadEstateId,
  });

  const residentNotificationsService = new ResidentNotificationsService({
    notifications: new PrismaNotificationRepository(prisma),
  });

  const residentBookingsService = new ResidentBookingsService({
    bookings: new PrismaBookingRepository(prisma),
    audit,
    loadEstateId,
    onBookingCreated: async (hook) => {
      await residentNotificationsService.notify(hook.organizationId, hook.userId, {
        kind: 'BOOKING',
        title: `Booking requested — ${hook.facilityName}`,
        body: 'Your request was sent to the estate office.',
        linkTo: '/resident/app/bookings',
      });
    },
  });

  const residentDashboardService = new ResidentDashboardService({
    profile: residentProfileService,
    properties: residentPropertiesService,
    finance: residentFinanceService,
    codes: residentCodesService,
    complaints: residentComplaintsService,
    community: residentCommunityService,
    bookings: residentBookingsService,
    notifications: residentNotificationsService,
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
      profile: residentProfileService,
      properties: residentPropertiesService,
      finance: residentFinanceService,
      codes: residentCodesService,
      complaints: residentComplaintsService,
      community: residentCommunityService,
      bookings: residentBookingsService,
      notifications: residentNotificationsService,
      dashboard: residentDashboardService,
    },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({
    email: admin.email,
    password: ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);

  // Onboard the resident end to end: registration, wizard, payment, login.
  const registered = await request(app)
    .post('/api/v1/onboard/residents')
    .set('Cookie', adminCookie)
    .send({
      firstName: 'Ada',
      email: `dash_${uniqueSuffix()}@example.com`,
      phone: '+2348008880001',
      propertyId,
    });
  expect(registered.status).toBe(201);
  const residentEmail = registered.body.data.resident.email as string;
  const residentId = registered.body.data.resident.id as string;
  const code = registered.body.data.onboardingCode as string;

  const saved = await request(app).patch(`/api/v1/onboard/by-code/${code}`).send({
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    nextOfKinName: 'Kin Ada',
    nextOfKinPhone: '+2348009990000',
    nextOfKinEmail: 'kin_ada@example.com',
    idType: 'NATIONAL_ID',
  });
  expect(saved.status).toBe(200);

  await prisma.residentOnboarding.update({
    where: { id: residentId },
    data: { idDocumentUrl: `/media/${organizationId}/dash-doc` },
  });

  const paid = await request(app)
    .post(`/api/v1/onboard/residents/${residentId}/payment`)
    .set('Cookie', adminCookie)
    .send({ paymentRef: 'DASH-001' });
  expect(paid.status).toBe(200);
  residentUserId = paid.body.data.user.id as string;

  const login = await request(app).post('/api/v1/auth/login').send({
    email: residentEmail,
    password: paid.body.data.demoPassword,
  });
  expect(login.status).toBe(200);
  residentCookie = cookieFrom(login);
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.booking.deleteMany({ where: { organizationId } });
  await prisma.facility.deleteMany({ where: { organizationId } });
  await prisma.estateBroadcast.deleteMany({ where: { organizationId } });
  await prisma.announcement.deleteMany({ where: { organizationId } });
  await prisma.complaint.deleteMany({ where: { organizationId } });
  await prisma.accessCode.deleteMany({ where: { organizationId } });
  await prisma.residentOnboarding.deleteMany({ where: { organizationId } });
  await prisma.invoice.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.payment.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.estate.deleteMany({ where: { organizationId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId } });
  await prisma.session.deleteMany({ where: { user: { organizationId } } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

describe('resident dashboard home (S11)', () => {
  it('rejects the dashboard without a session', async () => {
    expect((await request(app).get('/api/v1/resident/dashboard')).status).toBe(401);
  });

  it('composes every section for a resident with no activity yet', async () => {
    const response = await request(app)
      .get('/api/v1/resident/dashboard')
      .set('Cookie', residentCookie);
    expect(response.status).toBe(200);

    const view = response.body.data;

    // Profile.
    expect(view.profile.id).toBe(residentUserId);
    expect(view.profile.fullName).toContain('Ada');

    // Property.
    expect(view.property.length).toBe(1);
    expect(view.property[0].identifier).toBe(
      (await prisma.property.findUnique({ where: { id: propertyId } }))!.identifier,
    );

    // Finance: the registration fee was paid when the account was created.
    expect(view.finance.outstandingCount).toBe(0);
    expect(view.finance.outstandingTotalKobo).toBe(0);

    // Codes.
    expect(view.codes.activeCount).toBe(0);

    // Estate office.
    expect(view.estateOffice.openComplaints).toBe(0);
    expect(view.estateOffice.latestAnnouncement).toBeNull();
    expect(view.estateOffice.activeBroadcast).toBeNull();

    // Notifications.
    expect(view.notifications.upcomingBookings).toEqual([]);
    expect(view.notifications.recentNotifications).toEqual([]);
  });

  it('counts an active access code', async () => {
    const generated = await request(app)
      .post('/api/v1/resident/codes')
      .set('Cookie', residentCookie)
      .send({ kind: 'ENTRY', durationHours: 168, visitorName: 'Ada Visitor' });
    expect(generated.status).toBe(201);

    const response = await request(app)
      .get('/api/v1/resident/dashboard')
      .set('Cookie', residentCookie);
    expect(response.body.data.codes.activeCount).toBe(1);
  });

  it('shows a booking as an upcoming booking and a notification', async () => {
    const booking = await request(app)
      .post('/api/v1/resident/bookings')
      .set('Cookie', residentCookie)
      .send({ facilityId, startsAt: at(3), endsAt: at(3, 2) });
    expect(booking.status).toBe(201);

    const response = await request(app)
      .get('/api/v1/resident/dashboard')
      .set('Cookie', residentCookie);
    const view = response.body.data;

    expect(view.notifications.upcomingBookings.length).toBe(1);
    expect(view.notifications.upcomingBookings[0].facilityName).toBe('Function Room');
    expect(view.notifications.recentNotifications.length).toBe(1);
    expect(view.notifications.recentNotifications[0].kind).toBe('BOOKING');
  });

  it('counts an open complaint', async () => {
    const complaint = await request(app)
      .post('/api/v1/resident/complaints')
      .set('Cookie', residentCookie)
      .send({
        category: 'MAINTENANCE',
        subject: 'Street light out',
        description: 'The light outside block C is off.',
      });
    expect(complaint.status).toBe(201);

    const response = await request(app)
      .get('/api/v1/resident/dashboard')
      .set('Cookie', residentCookie);
    expect(response.body.data.estateOffice.openComplaints).toBe(1);
  });

  it('surfaces the latest announcement and the active broadcast', async () => {
    await prisma.announcement.create({
      data: {
        organizationId,
        title: 'Water supply interruption',
        body: 'Supply will be interrupted on Wednesday morning.',
        publishedAt: new Date(),
      },
    });
    await prisma.estateBroadcast.create({
      data: {
        organizationId,
        estateId,
        title: 'Security drill',
        body: 'A drill will run on Saturday at 10am.',
        priority: 'WARNING',
        issuedAt: new Date(),
        expiresAt: at(7),
      },
    });

    const response = await request(app)
      .get('/api/v1/resident/dashboard')
      .set('Cookie', residentCookie);
    const view = response.body.data;

    expect(view.estateOffice.latestAnnouncement.title).toBe('Water supply interruption');
    expect(view.estateOffice.activeBroadcast.title).toBe('Security drill');
    expect(view.estateOffice.activeBroadcast.priority).toBe('WARNING');
  });

  it('never shows another resident data', async () => {
    const otherProperty = await prisma.property.create({
      data: {
        organizationId,
        estateId,
        kind: 'LAND',
        identifier: `DASH-OTHER-${uniqueSuffix()}`,
        streetName: 'Test Street',
        plotNumber: '1',
        plotName: 'Test plot',
        name: null,
      },
    });

    const other = await prisma.user.create({
      data: {
        organizationId,
        email: `dash_other_${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        role: 'RESIDENT',
        status: 'ACTIVE',
        lastPasswordChangedAt: new Date(),
      },
    });
    await prisma.residentOnboarding.create({
      data: {
        organizationId,
        userId: other.id,
        propertyId: otherProperty.id,
        firstName: 'Bode',
        email: other.email,
        phone: '+2348008880002',
        status: 'PENDING',
        codeHash: 'x'.repeat(64),
        onboardingCode: 'OTHER-CODE',
      },
    });

    const sessions = new PrismaSessionRepository(prisma);
    const session = await sessions.create(other.id, 7);

    const response = await request(app)
      .get('/api/v1/resident/dashboard')
      .set('Cookie', `silverstone.session=${session.id}`);
    expect(response.status).toBe(200);

    const view = response.body.data;
    expect(view.profile.id).toBe(other.id);
    // Their own property — not the first resident's.
    expect(view.property.length).toBe(1);
    expect(view.property[0].identifier).toBe(otherProperty.identifier);
    // Nothing of the first resident leaks into the second one's dashboard.
    expect(view.finance.outstandingCount).toBe(0);
    expect(view.finance.outstandingTotalKobo).toBe(0);
    expect(view.codes.activeCount).toBe(0);
    expect(view.estateOffice.openComplaints).toBe(0);
    expect(view.notifications.upcomingBookings).toEqual([]);
    expect(view.notifications.recentNotifications).toEqual([]);
  });
});
