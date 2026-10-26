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

  const residentOnboardingService = new ResidentOnboardingService(
    users,
    residentDrafts,
    audit,
    permissions,
    async () => (await configService.resolve()).config,
    loadPropertyDetail,
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
