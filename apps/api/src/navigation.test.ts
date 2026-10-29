/**
 * Sidebar counter integration tests.
 *
 * Real repositories and the real Express router against the disposable test
 * database. The seeded organization exercises every selected counter through
 * a SUPER_ADMIN, then reads the same state through GUARD and AUDITOR to prove
 * the null-vs-zero permission contract end to end.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createApp, type Express } from './application.js';
import { loadNavigationCounts } from './modules/navigation/navigation.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { UserService } from './modules/auth/user.service.js';
import { PrismaUserRepository } from './modules/auth/user-repository.js';
import { PrismaSessionRepository } from './modules/auth/session-repository.js';
import { PrismaPasswordResetRepository } from './modules/auth/reset-token-repository.js';
import { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import { PrismaResidentOnboardingRepository } from './modules/auth/resident-onboarding-repository.js';
import { PrismaFinanceRepository } from './modules/resident/finance-repository.js';
import { PrismaComplaintRepository } from './modules/resident/complaints-repository.js';
import { PrismaMessageRepository } from './modules/resident/messages-repository.js';
import { PrismaBookingRepository } from './modules/resident/bookings-repository.js';
import { PrismaSosRepository } from './modules/resident/sos-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';
import { MockEmailAdapter } from './modules/auth/email-adapter.js';
import { DEFAULT_MODULE_FLAGS, type ModuleFlags } from '@silverstone/shared';
import { getPrismaClient, disconnectPrisma } from './lib/prisma.js';
import { hashPassword } from './lib/password.js';

let prisma: PrismaClient;
let app: Express;
let users: PrismaUserRepository;
let sessions: PrismaSessionRepository;
let resetTokens: PrismaPasswordResetRepository;
let audit: PrismaAuditRepository;
let residentOnboarding: PrismaResidentOnboardingRepository;
let finance: PrismaFinanceRepository;
let complaints: PrismaComplaintRepository;
let messages: PrismaMessageRepository;
let bookings: PrismaBookingRepository;
let sos: PrismaSosRepository;
let email: MockEmailAdapter;
let organizationId = '';

const ADMIN_PASSWORD = 'Sup3rSecretXyz';
const GUARD_PASSWORD = 'Gu3rdSecretXyz';
const AUDITOR_PASSWORD = 'Aud1torSecretXyz';

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildApp(loadModules?: () => Promise<ModuleFlags>): Express {
  const permissions = new PermissionResolver(async () => []);
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
  return createApp({
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
    navigation: {
      sessions,
      permissions,
      residentOnboarding,
      finance,
      complaints,
      messages,
      bookings,
      sos,
      organizationId,
      ...(loadModules ? { loadModules } : {}),
    },
  });
}

async function createTestUser(input: {
  email?: string;
  password?: string;
  role?: string;
}): Promise<{ id: string; email: string; role: string }> {
  const suffix = uniqueSuffix();
  const email = input.email ?? `${input.role?.toLowerCase() ?? 'user'}_${suffix}@example.com`;
  const password = input.password ?? ADMIN_PASSWORD;
  const role = input.role ?? 'GUARD';
  const row = await prisma.user.create({
    data: {
      organizationId,
      email,
      passwordHash: await hashPassword(password),
      role,
      status: 'ACTIVE',
      lastPasswordChangedAt: new Date(),
    },
  });
  return { id: row.id, email, role };
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as string[] | undefined;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw ? raw.split(';')[0] : '';
}

async function login(email: string, password: string, target = app): Promise<string> {
  const response = await request(target).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

beforeAll(async () => {
  prisma = getPrismaClient();
  email = new MockEmailAdapter();
  users = new PrismaUserRepository(prisma);
  sessions = new PrismaSessionRepository(prisma);
  resetTokens = new PrismaPasswordResetRepository(prisma);
  audit = new PrismaAuditRepository(prisma);
  residentOnboarding = new PrismaResidentOnboardingRepository(prisma);
  finance = new PrismaFinanceRepository(prisma);
  complaints = new PrismaComplaintRepository(prisma);
  messages = new PrismaMessageRepository(prisma);
  bookings = new PrismaBookingRepository(prisma);
  sos = new PrismaSosRepository(prisma);

  const org = await prisma.organization.create({
    data: { slug: `nav_test_${uniqueSuffix()}`, name: 'Navigation Test' },
  });
  organizationId = org.id;

  // Facilities are disabled by default in the shared baseline; the counter
  // suite explicitly enables them so the booking/waitlist cases are live.
  app = buildApp(async () => ({ ...DEFAULT_MODULE_FLAGS, facilities: true }));
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await disconnectPrisma();
});

/**
 * One estate with a property and a resident, plus every counter state:
 *
 * - 2 active SOS alerts (one raised, one acknowledged) and 1 resolved
 * - 2 open complaints (open + in progress) and 1 resolved
 * - 2 overdue invoices and 2 non-overdue invoices
 * - 1 pending onboarding draft
 * - 1 requested booking and 2 non-requested bookings
 * - 1 future waiting watch and 3 non-counting watches
 * - 1 open thread with an unread resident message
 */
async function seedData(): Promise<void> {
  const estate = await prisma.estate.create({
    data: { organizationId, slug: `nav_${uniqueSuffix()}`, name: 'Navigation Estate' },
  });
  const property = await prisma.property.create({
    data: {
      estateId: estate.id,
      organizationId,
      identifier: 'NAV-1',
      kind: 'HOUSE',
      streetName: 'Test Street',
      plotNumber: '1',
      plotName: 'Test house',
    },
  });

  const resident = await prisma.user.create({
    data: {
      organizationId,
      email: `nav_resident_${uniqueSuffix()}@example.com`,
      passwordHash: await hashPassword('Res1dentSecretXyz'),
      role: 'RESIDENT',
      status: 'ACTIVE',
      fullName: 'Navigation Resident',
      lastPasswordChangedAt: new Date(),
    },
  });

  await prisma.residentOnboarding.create({
    data: {
      organizationId,
      propertyId: property.id,
      codeHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      onboardingCode: 'NAV2345678',
      firstName: 'Pending',
      email: resident.email,
      phone: null,
      status: 'PENDING',
    },
  });
  await prisma.residentOnboarding.create({
    data: {
      organizationId,
      propertyId: property.id,
      codeHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      onboardingCode: 'NAV2345679',
      firstName: 'Completed',
      email: null,
      phone: null,
      status: 'COMPLETED',
    },
  });

  for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const) {
    await prisma.complaint.create({
      data: {
        organizationId,
        userId: resident.id,
        propertyId: property.id,
        category: 'security',
        subject: `Complaint ${status}`,
        description: 'Test complaint',
        status,
      },
    });
  }

  for (const status of ['RAISED', 'ACKNOWLEDGED', 'RESOLVED'] as const) {
    await prisma.sosEvent.create({
      data: {
        organizationId,
        userId: resident.id,
        propertyId: property.id,
        note: `SOS ${status}`,
        status,
      },
    });
  }

  const now = Date.now();
  const past = new Date(now - 24 * 60 * 60 * 1000);
  const future = new Date(now + 24 * 60 * 60 * 1000);
  for (const invoice of [
    { status: 'UNPAID', dueAt: past },
    { status: 'OVERDUE', dueAt: future },
    { status: 'PAID', dueAt: past },
    { status: 'UNPAID', dueAt: future },
  ] as const) {
    await prisma.invoice.create({
      data: {
        organizationId,
        userId: resident.id,
        propertyId: property.id,
        period: `NAV-${invoice.status}`,
        amountKobo: 100_000,
        status: invoice.status,
        dueAt: invoice.dueAt,
      },
    });
  }

  const facility = await prisma.facility.create({
    data: {
      organizationId,
      estateId: estate.id,
      name: 'Navigation Hall',
      description: 'Test facility',
      bookable: true,
      usageFeeKobo: 0,
    },
  });

  const startsAt = new Date(now + 2 * 60 * 60 * 1000);
  const endsAt = new Date(now + 3 * 60 * 60 * 1000);
  for (const status of ['REQUESTED', 'CONFIRMED', 'CANCELLED'] as const) {
    await prisma.booking.create({
      data: {
        organizationId,
        userId: resident.id,
        facilityId: facility.id,
        startsAt,
        endsAt,
        status,
        feeKobo: 0,
        paymentStatus: 'NOT_REQUIRED',
      },
    });
  }

  for (const watch of [
    { status: 'WAITING', startsAt: future },
    { status: 'WAITING', startsAt: past },
    { status: 'NOTIFIED', startsAt: future },
    { status: 'CANCELLED', startsAt: future },
  ] as const) {
    await prisma.facilityAvailabilityWatch.create({
      data: {
        organizationId,
        facilityId: facility.id,
        userId: resident.id,
        startsAt: watch.startsAt,
        endsAt: new Date(watch.startsAt.getTime() + 60 * 60 * 1000),
        status: watch.status,
      },
    });
  }

  await prisma.messageThread.create({
    data: {
      organizationId,
      residentUserId: resident.id,
      subject: 'Unread thread',
      status: 'OPEN',
      staffLastReadAt: null,
      messages: {
        create: {
          senderRole: 'RESIDENT',
          authorId: resident.id,
          body: 'Please help.',
        },
      },
    },
  });
  await prisma.messageThread.create({
    data: {
      organizationId,
      residentUserId: resident.id,
      subject: 'Read thread',
      status: 'OPEN',
      staffLastReadAt: future,
      messages: {
        create: {
          senderRole: 'RESIDENT',
          authorId: resident.id,
          body: 'Already read.',
        },
      },
    },
  });
  await prisma.messageThread.create({
    data: {
      organizationId,
      residentUserId: resident.id,
      subject: 'Staff-only thread',
      status: 'OPEN',
      staffLastReadAt: null,
      messages: {
        create: {
          senderRole: 'ESTATE_OFFICE',
          authorId: null,
          body: 'A note from staff.',
        },
      },
    },
  });
  await prisma.messageThread.create({
    data: {
      organizationId,
      residentUserId: resident.id,
      subject: 'Closed thread',
      status: 'CLOSED',
      staffLastReadAt: null,
      messages: {
        create: {
          senderRole: 'RESIDENT',
          authorId: resident.id,
          body: 'Closed but unread.',
        },
      },
    },
  });
}

describe('GET /api/v1/navigation/counts', () => {
  it('returns 401 when unauthenticated', async () => {
    const response = await request(app).get('/api/v1/navigation/counts');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('SUPER_ADMIN sees every selected counter', async () => {
    await seedData();
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD);

    const response = await request(app).get('/api/v1/navigation/counts').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      sosAlerts: 2,
      unreadMessages: 1,
      openComplaints: 2,
      requestedBookings: 1,
      overdueInvoices: 2,
      pendingResidents: 1,
      facilityWaitlist: 1,
    });
  });

  it('GUARD sees only the SOS counter', async () => {
    const guard = await createTestUser({ role: 'GUARD', password: GUARD_PASSWORD });
    const cookie = await login(guard.email, GUARD_PASSWORD);

    const response = await request(app).get('/api/v1/navigation/counts').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      sosAlerts: 2,
      unreadMessages: null,
      openComplaints: null,
      requestedBookings: null,
      overdueInvoices: null,
      pendingResidents: null,
      facilityWaitlist: null,
    });
  });

  it('AUDITOR sees read-only queues but not resident administration', async () => {
    const auditor = await createTestUser({ role: 'AUDITOR', password: AUDITOR_PASSWORD });
    const cookie = await login(auditor.email, AUDITOR_PASSWORD);

    const response = await request(app).get('/api/v1/navigation/counts').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      sosAlerts: 2,
      unreadMessages: 1,
      openComplaints: 2,
      requestedBookings: 1,
      overdueInvoices: 2,
      pendingResidents: null,
      facilityWaitlist: 1,
    });
  });

  it('hides counters for disabled modules even when the permission is held', async () => {
    const disabledApp = buildApp(async () => ({
      ...DEFAULT_MODULE_FLAGS,
      facilities: false,
      billing: false,
      residents: false,
    }));
    const admin = await createTestUser({ role: 'SUPER_ADMIN' });
    const cookie = await login(admin.email, ADMIN_PASSWORD, disabledApp);

    const response = await request(disabledApp)
      .get('/api/v1/navigation/counts')
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      sosAlerts: 2,
      unreadMessages: 1,
      openComplaints: 2,
      requestedBookings: null,
      overdueInvoices: null,
      pendingResidents: null,
      facilityWaitlist: null,
    });
  });

  it('keeps the other counters when one counter query fails', async () => {
    const options = {
      sos: {
        countActive: async () => {
          throw new Error('sos query failed');
        },
      },
      messages: { countUnreadThreads: async () => 4 },
      complaints: { countOpen: async () => 3 },
      residentOnboarding: { countPending: async () => 2 },
      finance: { countOverdueInvoices: async () => 1 },
      bookings: {
        countRequestedBookings: async () => 5,
        countUpcomingWaitingWatches: async () => 6,
      },
      loadModules: async () => ({ ...DEFAULT_MODULE_FLAGS, facilities: true }),
    };

    const counts = await loadNavigationCounts(
      organizationId,
      new Set([
        'sos.read',
        'message.read',
        'complaint.read',
        'billing.read',
        'booking.read',
        'facility.read',
        'user.manage',
      ]),
      options as unknown as Parameters<typeof loadNavigationCounts>[2],
    );

    expect(counts).toEqual({
      sosAlerts: null,
      unreadMessages: 4,
      openComplaints: 3,
      requestedBookings: 5,
      overdueInvoices: 1,
      pendingResidents: 2,
      facilityWaitlist: 6,
    });
  });
});
