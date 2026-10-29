import {
  OrganizationConfigError,
  assertSupportedConfigSchemaVersion,
  parseOrganizationConfig,
} from './parse.js';
import {
  CONFIG_SCHEMA_VERSION,
  type AccessCodesConfig,
  type AssetModel,
  type Branding,
  type CustomField,
  type FeesConfig,
  type ModulesConfig,
  type OnboardingConfig,
  type OrganizationConfig,
  type OrganizationIdentity,
  type PaymentsConfig,
  type PropertyOptions,
  type RolesConfig,
  type SosConfig,
} from './organization-config.schema.js';

/**
 * A configuration document as stored in the database: the fully-defaulted
 * output of the schema with the code-stamped `schemaVersion` attached. This
 * concrete shape (not `Record<string, unknown>`) keeps callers — seed
 * scripts, repositories, migrations — from losing property types when the
 * payload is written to Prisma's `Json` column.
 */
export interface StoredConfigPayload {
  schemaVersion: string;
  organization: OrganizationIdentity;
  branding: Branding;
  assetModel: AssetModel;
  propertyOptions: PropertyOptions;
  modules: ModulesConfig;
  fees: FeesConfig;
  onboarding: OnboardingConfig;
  accessCodes: AccessCodesConfig;
  payments: PaymentsConfig;
  sos: SosConfig;
  roles: RolesConfig;
  customFields: CustomField[];
}

/** A row from the database's organization configuration table. */
export interface StoredConfigRecord {
  version: number;
  schemaVersion: string;
  payload: unknown;
  activatedAt?: Date | string | null;
}

export interface ResolvedOrganizationConfig {
  config: OrganizationConfig;
  /**
   * `bootstrap` means the deployment has not been provisioned yet and the
   * repository JSON is being used. Once a database document exists, it always
   * wins; bootstrap defaults are never merged into it.
   */
  source: 'database' | 'bootstrap';
  version: number;
}

export interface ResolveConfigInput {
  /** Already-validated bootstrap defaults loaded from `config/organization.default.json`. */
  bootstrap: OrganizationConfig;
  /** Active database document, when the deployment has been provisioned. */
  stored: StoredConfigRecord | null;
}

/**
 * Deterministic precedence: database → bootstrap.
 *
 * Deliberately *not* a deep merge. Merging would let repository defaults from a
 * newer release silently change a live organization's configuration.
 */
export function resolveOrganizationConfig({
  bootstrap,
  stored,
}: ResolveConfigInput): ResolvedOrganizationConfig {
  if (stored === null) {
    return { config: bootstrap, source: 'bootstrap', version: 0 };
  }

  if (!Number.isInteger(stored.version) || stored.version < 1) {
    throw new OrganizationConfigError(
      `Stored configuration version must be a positive integer, received ${String(stored.version)}`,
    );
  }

  assertSupportedConfigSchemaVersion(stored.schemaVersion);

  const config = parseOrganizationConfig(stored.payload);
  if (config.schemaVersion !== stored.schemaVersion) {
    throw new OrganizationConfigError(
      `Stored configuration metadata says ${stored.schemaVersion} but the document declares ${config.schemaVersion}`,
    );
  }

  return { config, source: 'database', version: stored.version };
}

/**
 * Serialises a validated configuration for storage. `schemaVersion` is always
 * stamped by code, never trusted from the caller.
 */
export function toStoredPayload(config: OrganizationConfig): StoredConfigPayload {
  return {
    organization: config.organization,
    branding: config.branding,
    assetModel: config.assetModel,
    propertyOptions: config.propertyOptions,
    modules: config.modules,
    fees: config.fees,
    onboarding: config.onboarding,
    accessCodes: config.accessCodes,
    payments: config.payments,
    sos: config.sos,
    roles: config.roles,
    customFields: config.customFields,
    schemaVersion: CONFIG_SCHEMA_VERSION,
  };
}
