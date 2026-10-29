/**
 * Application dependencies, wired once at startup.
 *
 * Everything that can vary between environments (database connectivity,
 * bootstrap location, organization identity) is injected through this
 * factory so `createApp` stays a pure function of its options.
 */
import { getEnv } from './config/env.js';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { getPrismaClient } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';
import {
  PrismaOrganizationConfigRepository,
  OrganizationConfigService,
} from './modules/organization/config.service.js';
import { OrganizationSettingsService } from './modules/settings/settings.service.js';
import {
  activeSosContactsFromConfig,
  bankTransferDetailsFromConfig,
} from './modules/settings/settings.mapper.js';
import { createEmailAdapter } from './modules/auth/email-adapter-factory.js';
import { PrismaUserRepository } from './modules/auth/user-repository.js';
import { PrismaSessionRepository } from './modules/auth/session-repository.js';
import { PrismaPasswordResetRepository } from './modules/auth/reset-token-repository.js';
import { PrismaResidentOnboardingRepository } from './modules/auth/resident-onboarding-repository.js';
import { PrismaFinanceRepository } from './modules/resident/finance-repository.js';
import { ResidentFinanceService } from './modules/resident/finance.service.js';
import { PrismaAccessCodeRepository } from './modules/resident/codes-repository.js';
import { ResidentCodesService } from './modules/resident/codes.service.js';
import { PrismaComplaintRepository } from './modules/resident/complaints-repository.js';
import { ResidentComplaintsService } from './modules/resident/complaints.service.js';
import { PrismaMessageRepository } from './modules/resident/messages-repository.js';
import { ResidentMessagesService } from './modules/resident/messages.service.js';
import { PrismaCommunityRepository } from './modules/resident/community-repository.js';
import { ResidentCommunityService } from './modules/resident/community.service.js';
import { PrismaBookingRepository } from './modules/resident/bookings-repository.js';
import { ResidentBookingsService } from './modules/resident/bookings.service.js';
import { PrismaSosRepository } from './modules/resident/sos-repository.js';
import { ResidentSosService } from './modules/resident/sos.service.js';
import { OperatorSosService } from './modules/sos/operator-sos.service.js';
import { OperatorMessagesService } from './modules/messages/operator-messages.service.js';
import { OperatorComplaintsService } from './modules/complaints/operator-complaints.service.js';
import { OperatorBillingService } from './modules/billing/operator-billing.service.js';
import { PrismaGateRepository } from './modules/gate/gate-repository.js';
import { OperatorGateService } from './modules/gate/gate.service.js';
import { PrismaFacilitiesRepository } from './modules/facilities/facilities-repository.js';
import { OperatorFacilitiesService } from './modules/facilities/facilities.service.js';
import { OperatorBookingsService } from './modules/facilities/bookings.service.js';
import { AvailabilityService } from './modules/facilities/availability.service.js';
import { BookingPaymentService } from './modules/facilities/booking-payment.service.js';
import { PrismaNotificationRepository } from './modules/resident/notifications-repository.js';
import { ResidentNotificationsService } from './modules/resident/notifications.service.js';
import {
  ResidentOnboardingService,
  type PropertyDetail,
} from './modules/auth/resident-onboarding.service.js';
import {
  LocalMediaStorage,
  R2MediaStorage,
  type MediaStorage,
} from './modules/media/media-storage.js';
import { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';
import { AuthService } from './modules/auth/auth.service.js';
import { UserService } from './modules/auth/user.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { EstateService } from './modules/estates/estate.service.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { PrismaHouseTypeRepository } from './modules/properties/house-type-repository.js';
import { PropertyService } from './modules/properties/property.service.js';
import { PrismaImportRepository } from './modules/imports/import-repository.js';
import { ImportService } from './modules/imports/import.service.js';
import type { ModuleFlags } from '@silverstone/shared';

export interface AppDependencies {
  checkDatabase: () => Promise<void>;
  configService: OrganizationConfigService;
  /** Phase 1 auth wiring, ready to pass into `createApp({ auth })`. */
  auth: {
    authService: AuthService;
    userService: UserService;
    sessions: PrismaSessionRepository;
    permissions: PermissionResolver;
  };
  /**
   * Raw repositories the dashboard router aggregates across. Exposed
   * alongside the services so the dashboard's count-only reads stay at the
   * data boundary (ADR-0001) rather than leaking through the service layer.
   */
  audit: PrismaAuditRepository;
  users: PrismaUserRepository;
  /** Resident-onboarding drafts (count of pending + completed). */
  residentOnboarding: PrismaResidentOnboardingRepository;
  estates: PrismaEstateRepository;
  properties: PrismaPropertyRepository;
  /** Billing, complaint and SOS aggregates for the operator dashboard. */
  finance: PrismaFinanceRepository;
  complaints: PrismaComplaintRepository;
  sos: PrismaSosRepository;
  /** Live module flags from the resolved organization configuration. */
  loadModules: () => Promise<ModuleFlags>;
  /** Resolved at startup: the organization's database id. */
  organizationId: string;
  /** Phase 2 — estate management. */
  estateService: EstateService;
  /** Phase 2 — property registry. */
  propertyService: PropertyService;
  /** Phase 2 — bulk import. */
  importService: ImportService;
  /** Phase 2 — resident onboarding (persistent code, payment-gated). */
  residentOnboardingService: ResidentOnboardingService;
  /** Phase 3 (S3) — resident finance (invoices, payments, transactions). */
  residentFinanceService: ResidentFinanceService;
  /** Phase 3 (S4) — resident access codes (generate / extend / deactivate). */
  residentCodesService: ResidentCodesService;
  /** Phase 3 (S5) — resident complaints (file + read the reply thread). */
  residentComplaintsService: ResidentComplaintsService;
  /** Phase 3 (S6) — resident messages (threads with the estate office). */
  residentMessagesService: ResidentMessagesService;
  /** Phase 3 (S7) — resident community feed (announcements + broadcast). */
  residentCommunityService: ResidentCommunityService;
  /** Phase 3 (S8) — resident facilities and bookings. */
  residentBookingsService: ResidentBookingsService;
  /** Phase 3 (S9) — resident emergency / SOS alerts. */
  residentSosService: ResidentSosService;
  /** Operator SOS queue and acknowledgement/resolution actions. */
  operatorSosService: OperatorSosService;
  /** Operator message inbox and staff replies. */
  operatorMessagesService: OperatorMessagesService;
  /** Operator complaint queue, replies and status changes. */
  operatorComplaintsService: OperatorComplaintsService;
  /** Operator manual billing: invoices and recorded payments. */
  operatorBillingService: OperatorBillingService;
  /** Operator gate access: access-code register and verification history. */
  operatorGateService: OperatorGateService;
  /** Phase 7 — operator facility register. */
  operatorFacilitiesService: OperatorFacilitiesService;
  /** Phase 7 — operator booking queue and lifecycle. */
  operatorBookingsService: OperatorBookingsService;
  /** Phase 7 — manual booking-payment verification and invoice creation. */
  bookingPaymentService: BookingPaymentService;
  /** Phase 3 (S10) — resident notification inbox. */
  residentNotificationsService: ResidentNotificationsService;
  /** Phase 8 — curated operational settings. */
  settingsService: OrganizationSettingsService;
  /** Phase 2 — local media storage (ID document uploads). */
  mediaStorage: MediaStorage;
  loadPropertyDetail: (
    organizationId: string,
    propertyId: string,
  ) => Promise<PropertyDetail | null>;
  /** Active configuration version, stored as import-batch provenance. */
  loadConfigVersion: () => Promise<number>;
}

export async function createAppDependencies(): Promise<AppDependencies> {
  const env = getEnv();
  const prisma = getPrismaClient();

  // Organization configuration (Phase 0).
  const repository = new PrismaOrganizationConfigRepository(prisma);
  const configService = new OrganizationConfigService(
    repository,
    loadBootstrapConfig,
    env.ORGANIZATION_SLUG,
  );

  // Phase 1 — identity, sessions, audit, email.
  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const resetTokens = new PrismaPasswordResetRepository(prisma);
  const audit = new PrismaAuditRepository(prisma);

  const permissions = new PermissionResolver(() => loadOrganizationGrants(configService));
  const settingsService = new OrganizationSettingsService(configService, audit);

  const loadBankTransferDetails = async () =>
    bankTransferDetailsFromConfig((await configService.resolve()).config);
  const loadSosContacts = async () =>
    activeSosContactsFromConfig((await configService.resolve()).config);

  const email = createEmailAdapter(env);

  const authService = new AuthService(
    users,
    sessions,
    resetTokens,
    audit,
    permissions,
    email,
    env.SESSION_LIFETIME_DAYS,
    env.RESET_TOKEN_TTL_MINUTES,
    env.WEB_BASE_URL,
  );

  const userService = new UserService(users, sessions, audit, permissions);

  // Phase 2 — estate management, property registry and bulk import.
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

  const loadConfigVersion = async (): Promise<number> => {
    const resolved = await configService.resolve();
    return resolved.version;
  };

  // Phase 2 — resident onboarding (persistent code, payment-gated).
  const residentDrafts = new PrismaResidentOnboardingRepository(prisma);
  if (env.ALLOW_EPHEMERAL_MEDIA) {
    logger.warn(
      'ALLOW_EPHEMERAL_MEDIA is enabled — media uploads use ephemeral storage and are lost when the instance recycles',
    );
  }
  const mediaStorage: MediaStorage =
    env.MEDIA_STORAGE === 'r2'
      ? new R2MediaStorage(prisma, {
          accountId: env.R2_ACCOUNT_ID!,
          accessKeyId: env.R2_ACCESS_KEY_ID!,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
          bucketName: env.R2_BUCKET_NAME!,
          publicBase: `${env.API_BASE_PATH}/media`,
        })
      : new LocalMediaStorage(
          prisma,
          env.ALLOW_EPHEMERAL_MEDIA
            ? path.join(tmpdir(), 'silverstone-uploads')
            : path.resolve(process.cwd(), 'uploads'),
          `${env.API_BASE_PATH}/media`,
        );

  const loadPropertyDetail = async (
    organizationId: string,
    propertyId: string,
  ): Promise<PropertyDetail | null> => {
    const property = await properties.findById(organizationId, propertyId);
    if (!property) return null;
    const estate = await estates.findById(organizationId, property.estateId);
    if (!estate) return null;
    return {
      identifier: property.identifier,
      name: property.name,
      estate: { name: estate.name, slug: estate.slug },
    };
  };

  const financeRepo = new PrismaFinanceRepository(prisma);
  const residentFinanceService = new ResidentFinanceService({
    finance: financeRepo,
    audit,
    registrationFee: async () => {
      const config = (await configService.resolve()).config;
      return config.fees?.registration ?? { amountKobo: 0, currency: 'NGN' };
    },
    paymentDetails: loadBankTransferDetails,
  });
  const operatorBillingService = new OperatorBillingService({ finance: financeRepo, audit });
  const gateRepo = new PrismaGateRepository(prisma);
  const operatorGateService = new OperatorGateService({ gate: gateRepo, audit });

  const accessCodeRepo = new PrismaAccessCodeRepository(prisma);
  const residentCodesService = new ResidentCodesService({
    codes: accessCodeRepo,
    audit,
    // The acting resident's assigned property, resolved through their
    // onboarding draft — never from the request.
    loadPropertyId: async (_organizationId, userId) => {
      const draft = await residentDrafts.findByUser(userId);
      return draft?.propertyId ?? null;
    },
    loadDurationLimits: async () => {
      const accessCodes = (await configService.resolve()).config.accessCodes;
      return {
        defaultDurationHours: accessCodes.defaultDurationHours,
        maxDurationHours: accessCodes.maxDurationHours,
      };
    },
    ownsMediaUrl: async (organizationId, userId, url) => {
      const prefix = `${mediaStorage.publicBase}/`;
      if (!url.startsWith(prefix)) return false;
      const relativePath = url.slice(prefix.length);
      if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(relativePath)) return false;
      const row = await prisma.mediaFile.findFirst({
        where: { organizationId, relativePath, uploadedById: userId },
        select: { id: true },
      });
      return Boolean(row);
    },
  });

  const complaintRepo = new PrismaComplaintRepository(prisma);
  const residentComplaintsService = new ResidentComplaintsService({
    complaints: complaintRepo,
    audit,
    loadPropertyId: async (_organizationId, userId) => {
      const draft = await residentDrafts.findByUser(userId);
      return draft?.propertyId ?? null;
    },
  });
  const operatorComplaintsService = new OperatorComplaintsService({
    complaints: complaintRepo,
    audit,
  });

  const messageRepo = new PrismaMessageRepository(prisma);
  const residentMessagesService = new ResidentMessagesService({
    messages: messageRepo,
    audit,
  });
  const operatorMessagesService = new OperatorMessagesService({
    messages: messageRepo,
    audit,
  });

  const communityRepo = new PrismaCommunityRepository(prisma);
  const residentCommunityService = new ResidentCommunityService({
    community: communityRepo,
    // The resident's estate, resolved through their onboarding draft and the
    // assigned property — never from the request.
    loadEstateId: async (_organizationId, userId) => {
      const draft = await residentDrafts.findByUser(userId);
      if (!draft?.propertyId) return null;
      const property = await properties.findById(_organizationId, draft.propertyId);
      return property?.estateId ?? null;
    },
  });

  const notificationRepo = new PrismaNotificationRepository(prisma);
  const residentNotificationsService = new ResidentNotificationsService({
    notifications: notificationRepo,
  });

  const bookingRepo = new PrismaBookingRepository(prisma);
  const availabilityService = new AvailabilityService({
    bookings: bookingRepo,
    notify: (organizationId, userId, input) =>
      residentNotificationsService.notify(organizationId, userId, input),
  });
  const residentBookingsService = new ResidentBookingsService({
    bookings: bookingRepo,
    audit,
    availability: availabilityService,
    loadEstateId: async (organizationId, userId) => {
      const draft = await residentDrafts.findByUser(userId);
      if (!draft?.propertyId) return null;
      const property = await properties.findById(organizationId, draft.propertyId);
      return property?.estateId ?? null;
    },
    // A booking request lands in the resident's inbox.
    onBookingCreated: async (hook) => {
      await residentNotificationsService.notify(hook.organizationId, hook.userId, {
        kind: 'BOOKING',
        title: `Booking requested — ${hook.facilityName}`,
        body: `Your request for ${hook.facilityName} on ${hook.startsAt.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })} was sent to the estate office.`,
        linkTo: '/resident/app/bookings',
      });
    },
  });

  const facilitiesRepo = new PrismaFacilitiesRepository(prisma);
  const operatorFacilitiesService = new OperatorFacilitiesService({
    facilities: facilitiesRepo,
    audit,
    availability: availabilityService,
  });
  const operatorBookingsService = new OperatorBookingsService({
    bookings: facilitiesRepo,
    audit,
    availability: availabilityService,
  });
  const bookingPaymentService = new BookingPaymentService({
    bookings: facilitiesRepo,
    finance: financeRepo,
    audit,
  });

  const sosRepo = new PrismaSosRepository(prisma);
  const residentSosService = new ResidentSosService({
    sos: sosRepo,
    audit,
    loadPropertyId: async (_organizationId, userId) => {
      const draft = await residentDrafts.findByUser(userId);
      return draft?.propertyId ?? null;
    },
    contacts: loadSosContacts,
  });
  const operatorSosService = new OperatorSosService({
    sos: sosRepo,
    audit,
    contacts: loadSosContacts,
  });

  const residentOnboardingService = new ResidentOnboardingService(
    users,
    residentDrafts,
    audit,
    permissions,
    async () => (await configService.resolve()).config,
    loadPropertyDetail,
    async (hook) => {
      await residentFinanceService.seedRegistrationFee(
        hook.organizationId,
        hook.userId,
        hook.propertyId,
        hook.requestId,
      );
    },
  );

  return {
    checkDatabase: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    configService,
    auth: {
      authService,
      userService,
      sessions,
      permissions,
    },
    audit,
    users,
    residentOnboarding: residentDrafts,
    estates,
    properties,
    finance: financeRepo,
    complaints: complaintRepo,
    sos: sosRepo,
    loadModules: async () => (await configService.resolve()).config.modules,
    organizationId: await resolveOrganizationId(prisma, configService),
    estateService,
    propertyService,
    importService,
    residentOnboardingService,
    residentFinanceService,
    residentCodesService,
    residentComplaintsService,
    residentMessagesService,
    residentCommunityService,
    residentBookingsService,
    residentSosService,
    operatorSosService,
    operatorMessagesService,
    operatorComplaintsService,
    operatorBillingService,
    operatorGateService,
    operatorFacilitiesService,
    operatorBookingsService,
    bookingPaymentService,
    residentNotificationsService,
    settingsService,
    mediaStorage,
    loadPropertyDetail,
    loadConfigVersion,
  };
}

/**
 * Resolves the organization grants from the live config, falling back to an
 * empty list (baseline permissions only) when the deployment is unprovisioned.
 */
async function loadOrganizationGrants(
  configService: OrganizationConfigService,
): Promise<readonly { role: string; permissions: readonly string[] }[]> {
  try {
    const resolved = await configService.resolve();
    return resolved.config.roles.grants.map((grant) => ({
      role: grant.role,
      permissions: grant.permissions,
    }));
  } catch {
    // Config unavailable: fall back to baseline permissions. Authorization
    // fails closed to the documented default (shared catalogue).
    return [];
  }
}

/**
 * Resolves the organization's database id from its slug. The Organization row
 * is created by the seed step (Phase 0) and is stable across config versions.
 */
async function resolveOrganizationId(
  prisma: ReturnType<typeof getPrismaClient>,
  configService: OrganizationConfigService,
): Promise<string> {
  const resolved = await configService.resolve();
  const org = await prisma.organization.findUnique({
    where: { slug: resolved.config.organization.slug },
    select: { id: true },
  });
  return org?.id ?? '';
}
