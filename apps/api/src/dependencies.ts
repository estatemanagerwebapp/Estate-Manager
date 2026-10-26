/**
 * Application dependencies, wired once at startup.
 *
 * Everything that can vary between environments (database connectivity,
 * bootstrap location, organization identity) is injected through this
 * factory so `createApp` stays a pure function of its options.
 */
import { getEnv } from './config/env.js';
import * as path from 'node:path';
import { getPrismaClient } from './lib/prisma.js';
import { loadBootstrapConfig } from './modules/organization/bootstrap.js';
import {
  PrismaOrganizationConfigRepository,
  OrganizationConfigService,
} from './modules/organization/config.service.js';
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
import {
  ResidentOnboardingService,
  type PropertyDetail,
} from './modules/auth/resident-onboarding.service.js';
import { LocalMediaStorage } from './modules/media/media-storage.js';
import { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';
import { AuthService } from './modules/auth/auth.service.js';
import { UserService } from './modules/auth/user.service.js';
import { PrismaEstateRepository } from './modules/estates/estate-repository.js';
import { EstateService } from './modules/estates/estate.service.js';
import { PrismaPropertyRepository } from './modules/properties/property-repository.js';
import { PropertyService } from './modules/properties/property.service.js';
import { PrismaImportRepository } from './modules/imports/import-repository.js';
import { ImportService } from './modules/imports/import.service.js';
import { PropertyOptionsService } from './modules/organization/property-options.service.js';
import type { PropertyConfigSnapshot } from './modules/properties/property.service.js';

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
  /** Resolved at startup: the organization's database id. */
  organizationId: string;
  /** Phase 2 — estate management. */
  estateService: EstateService;
  /** Phase 2 — property registry. */
  propertyService: PropertyService;
  /** Phase 2 — bulk import. */
  importService: ImportService;
  /** Phase 2 — property options (read + update with optimistic concurrency). */
  propertyOptionsService: PropertyOptionsService;
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
  /** Phase 2 — local media storage (ID document uploads). */
  mediaStorage: LocalMediaStorage;
  loadPropertyDetail: (
    organizationId: string,
    propertyId: string,
  ) => Promise<PropertyDetail | null>;
  /** Loads the resolved configuration (asset types + property options + version). */
  loadConfig: () => Promise<PropertyConfigSnapshot>;
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
  const propertyService = new PropertyService(properties, estates, audit);

  const importRepo = new PrismaImportRepository(prisma);
  const importService = new ImportService(importRepo, estates, properties, audit, prisma);

  /**
   * Loads the resolved organization configuration (asset types + property
   * options + active version) at request time. The property and import
   * services depend on it for type-key validation and identifier derivation.
   */
  const loadConfig = async (): Promise<PropertyConfigSnapshot> => {
    const resolved = await configService.resolve();
    return {
      assetTypes: resolved.config.assetModel.types,
      unitTypes: resolved.config.assetModel.unitTypes,
      propertyOptions: resolved.config.propertyOptions,
      configVersion: resolved.version,
    };
  };

  const propertyOptionsService = new PropertyOptionsService(
    configService,
    repository,
    audit,
    loadConfig,
    env.ORGANIZATION_SLUG,
  );

  // Phase 2 — resident onboarding (persistent code, payment-gated).
  const residentDrafts = new PrismaResidentOnboardingRepository(prisma);
  const mediaRoot = path.resolve(process.cwd(), 'uploads');
  const mediaStorage = new LocalMediaStorage(prisma, mediaRoot);

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
  });

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

  const messageRepo = new PrismaMessageRepository(prisma);
  const residentMessagesService = new ResidentMessagesService({
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

  const bookingRepo = new PrismaBookingRepository(prisma);
  const residentBookingsService = new ResidentBookingsService({
    bookings: bookingRepo,
    audit,
    loadEstateId: async (organizationId, userId) => {
      const draft = await residentDrafts.findByUser(userId);
      if (!draft?.propertyId) return null;
      const property = await properties.findById(organizationId, draft.propertyId);
      return property?.estateId ?? null;
    },
  });

  const sosRepo = new PrismaSosRepository(prisma);
  const residentSosService = new ResidentSosService({
    sos: sosRepo,
    audit,
    loadPropertyId: async (_organizationId, userId) => {
      const draft = await residentDrafts.findByUser(userId);
      return draft?.propertyId ?? null;
    },
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
    organizationId: await resolveOrganizationId(prisma, configService),
    estateService,
    propertyService,
    importService,
    propertyOptionsService,
    residentOnboardingService,
    residentFinanceService,
    residentCodesService,
    residentComplaintsService,
    residentMessagesService,
    residentCommunityService,
    residentBookingsService,
    residentSosService,
    mediaStorage,
    loadPropertyDetail,
    loadConfig,
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
