import { safeParseOrganizationConfig, type OrganizationConfig } from '@silverstone/config-schema';
import type { Prisma } from '@prisma/client';
import type {
  OrganizationSettingsUpdateInput,
  OrganizationSettingsView,
} from '@silverstone/shared';
import { AppError, ValidationError } from '../../lib/errors.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { OrganizationConfigService } from '../organization/config.service.js';
import type { PrismaEstateSettingsRepository } from './estate-settings-repository.js';
import { organizationSettingsViewFromConfig } from './settings.mapper.js';

export interface SettingsContext {
  organizationId: string;
  actorId: string;
  requestId: string | null;
}

export class OrganizationSettingsService {
  constructor(
    private readonly configService: OrganizationConfigService,
    private readonly audit: PrismaAuditRepository,
    private readonly estateSettings?: PrismaEstateSettingsRepository,
  ) {}

  /** Curated settings projection of the active organization config. */
  async get(): Promise<OrganizationSettingsView> {
    const resolved = await this.configService.resolve();
    return organizationSettingsViewFromConfig(resolved.config, resolved.version);
  }

  async getForEstate(organizationId: string, estateId: string): Promise<OrganizationSettingsView> {
    const estate = await this.requireEstateSettings(organizationId, estateId);
    const config = await this.resolveConfigForEstate(organizationId, estateId);
    return organizationSettingsViewFromConfig(config, estate.version);
  }

  /** Resolve estate overrides over the organization defaults for runtime use. */
  async resolveConfigForEstate(
    organizationId: string,
    estateId: string,
  ): Promise<OrganizationConfig> {
    const estate = await this.requireEstateSettings(organizationId, estateId);
    const base = await this.configService.resolve();
    const withOverrides = mergeSettings(
      base.config,
      storedSettingsToInput(estate.operationalSettings),
    );
    const parsed = safeParseOrganizationConfig(withOverrides);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      );
    }
    return parsed.config;
  }

  async updateForEstate(
    context: SettingsContext,
    estateId: string,
    input: OrganizationSettingsUpdateInput,
  ): Promise<OrganizationSettingsView> {
    const repository = this.requireEstateRepository();
    const estate = await this.requireEstateSettings(context.organizationId, estateId);
    if (input.expectedVersion !== undefined && input.expectedVersion !== estate.version) {
      throw new AppError(
        409,
        'CONFLICT',
        'Settings changed since they were loaded. Refresh and try again.',
      );
    }

    const base = await this.configService.resolve();
    const currentConfig = mergeSettings(
      base.config,
      storedSettingsToInput(estate.operationalSettings),
    );
    const next = mergeSettings(currentConfig, input);
    const parsed = safeParseOrganizationConfig(next);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      );
    }

    const nextVersion = estate.version + 1;
    const nextView = organizationSettingsViewFromConfig(parsed.config, nextVersion);
    const updated = await repository.save(
      context.organizationId,
      estateId,
      estate.version,
      toStoredSettings(nextView),
    );
    if (!updated) {
      throw new AppError(
        409,
        'CONFLICT',
        'Settings changed since they were loaded. Refresh and try again.',
      );
    }

    const changed = Object.keys(input).filter(
      (key) =>
        key !== 'expectedVersion' &&
        input[key as keyof OrganizationSettingsUpdateInput] !== undefined,
    );
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'settings.updated',
      targetType: 'settings',
      targetId: estateId,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { estateId, version: updated.version, changed },
    });
    return organizationSettingsViewFromConfig(parsed.config, updated.version);
  }

  private async requireEstateSettings(organizationId: string, estateId: string) {
    const estate = await this.requireEstateRepository().find(organizationId, estateId);
    if (!estate) throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    return estate;
  }

  private requireEstateRepository(): PrismaEstateSettingsRepository {
    if (!this.estateSettings)
      throw new AppError(501, 'INTERNAL_ERROR', 'Estate settings are not available');
    return this.estateSettings;
  }

  /**
   * Merge a partial settings update into the active config, validate the whole
   * document, write the next version, and audit the change.
   *
   * The write path bypasses the short config cache so the optimistic version
   * check compares against the committed document, not a stale read.
   */
  async update(
    context: SettingsContext,
    input: OrganizationSettingsUpdateInput,
  ): Promise<OrganizationSettingsView> {
    const resolved = await this.configService.resolve({ bypassCache: true });

    if (input.expectedVersion !== undefined && input.expectedVersion !== resolved.version) {
      throw new AppError(
        409,
        'CONFLICT',
        'Settings changed since they were loaded. Refresh and try again.',
      );
    }

    const next = mergeSettings(resolved.config, input);
    const parsed = safeParseOrganizationConfig(next);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      );
    }

    const created = await this.configService.save(parsed.config, context.actorId, {
      expectedVersion: resolved.version,
    });

    const changed = Object.keys(input).filter(
      (key) =>
        key !== 'expectedVersion' &&
        input[key as keyof OrganizationSettingsUpdateInput] !== undefined,
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'settings.updated',
      targetType: 'settings',
      targetId: String(created.version),
      requestId: context.requestId,
      outcome: 'success',
      metadata: { version: created.version, changed },
    });

    return organizationSettingsViewFromConfig(parsed.config, created.version);
  }
}

function toStoredSettings(settings: OrganizationSettingsView): Prisma.InputJsonValue {
  return {
    onboarding: settings.onboarding,
    accessCodes: {
      defaultDurationHours: settings.accessCodes.defaultDurationHours,
      maxDurationHours: settings.accessCodes.maxDurationHours,
    },
    payments: settings.payments,
    sos: settings.sos,
  } as unknown as Prisma.InputJsonValue;
}

function storedSettingsToInput(value: Prisma.JsonValue): OrganizationSettingsUpdateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const stored = value as Record<string, unknown>;
  return {
    onboarding: stored.onboarding as OrganizationSettingsUpdateInput['onboarding'],
    accessCodes: stored.accessCodes as OrganizationSettingsUpdateInput['accessCodes'],
    payments: stored.payments as OrganizationSettingsUpdateInput['payments'],
    sos: stored.sos as OrganizationSettingsUpdateInput['sos'],
  };
}

/** Drop keys whose value is `undefined` so a partial payload cannot erase data. */
function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function mergeSettings(
  current: OrganizationConfig,
  input: OrganizationSettingsUpdateInput,
): OrganizationConfig {
  const feeInput = input.onboarding?.registrationFee;
  const registration = feeInput
    ? { ...current.fees.registration, ...withoutUndefined(feeInput) }
    : current.fees.registration;

  const accessCodes = input.accessCodes
    ? { ...current.accessCodes, ...withoutUndefined(input.accessCodes) }
    : current.accessCodes;

  const bankTransferInput = input.payments?.bankTransfer;
  const bankTransfer = bankTransferInput
    ? { ...current.payments.bankTransfer, ...withoutUndefined(bankTransferInput) }
    : current.payments.bankTransfer;

  return {
    ...current,
    fees: { ...current.fees, registration },
    accessCodes,
    payments: { ...current.payments, bankTransfer },
    sos: input.sos?.contacts ? { ...current.sos, contacts: input.sos.contacts } : current.sos,
  };
}
