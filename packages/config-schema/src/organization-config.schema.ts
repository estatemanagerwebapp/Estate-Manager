import { MODULE_KEYS, PERMISSIONS, ROLE_KEYS } from '@silverstone/shared';
import { z } from 'zod';

/**
 * Organization configuration.
 *
 * One deployment serves exactly one organization. This document describes how
 * that organization is structured — asset types, unit types, extra field
 * *definitions*, enabled modules, roles, fees and branding — without encoding
 * any deployment's data in code.
 *
 * Two rules matter for everything downstream:
 *  1. Configuration defines structure, never records. A custom field is a
 *     definition; the values live on domain rows.
 *  2. The database copy is authoritative once an organization is provisioned.
 *     The JSON file in `config/` supplies bootstrap defaults only.
 */

/** Version of the *document shape*, independent of the organization's version. */
export const CONFIG_SCHEMA_VERSION = '1.0.0' as const;

/** Configuration documents with a higher major version cannot be read safely. */
export const SUPPORTED_CONFIG_SCHEMA_MAJOR = 1;

export const CONFIG_ENTITY_KINDS = [
  'RESIDENT',
  'PROPERTY',
  'UNIT',
  'LAND_PARCEL',
  'ASSIGNMENT',
  'PAYMENT',
] as const;

export const CUSTOM_FIELD_TYPES = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT',
] as const;

export const ASSET_DETAIL_KINDS = ['PROPERTY', 'UNIT', 'LAND_PARCEL'] as const;
export const FEE_CADENCES = ['ONE_OFF', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'] as const;
export const PAYMENT_PROVIDERS = ['NONE', 'ZEST'] as const;
export const PAYMENT_ENVIRONMENTS = ['TEST', 'LIVE'] as const;

/**
 * Applies an object default by parsing it once at module load.
 *
 * Zod's `.default()` returns the supplied value verbatim, so passing a partial
 * object would bypass nested defaults. Parsing first guarantees that the
 * default really is a complete, valid document.
 *
 * The helper is generic over the object shape so that nested property types
 * are preserved in `z.output` (a concrete `ZodObject<Shape>` collapses to an
 * index signature of `unknown` otherwise).
 */
function defaulted<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  value: Record<string, unknown> = {},
): z.ZodDefault<z.ZodObject<Shape>> {
  // Parsed object output always satisfies the NoUndefined constraint that
  // `.default()` accepts. The cast silences the generic variance while the
  // `Shape` parameter preserves the concrete shape in the inferred output.
  const applyDefault = schema.default.bind(schema) as unknown as (
    def: z.output<z.ZodObject<Shape>>,
  ) => z.ZodDefault<z.ZodObject<Shape>>;
  return applyDefault(schema.parse(value));
}

const slug = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(48, `${label} must be 48 characters or fewer`)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      `${label} must start with a lowercase letter and contain only a-z, 0-9 and _`,
    );

const label = (max = 80) => z.string().trim().min(1, 'Label is required').max(max);

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a six-digit hex colour such as #FF5A1F');

/** Non-negative integer kobo. Never a float, never a currency string. */
const kobo = z
  .number()
  .int('Amount must be an integer number of kobo')
  .min(0, 'Amount must not be negative')
  .max(Number.MAX_SAFE_INTEGER, 'Amount is too large');

// --- Asset structure ---------------------------------------------------------

export const UnitTypeSchema = z.object({
  key: slug('Unit type key'),
  label: label(80),
  bedrooms: z.number().int().min(0).max(20).default(0),
  active: z.boolean().default(true),
});

export const AssetTypeSchema = z.object({
  key: slug('Asset type key'),
  label: label(80),
  /** Which typed 1:1 detail row accompanies an asset of this type. */
  detailKind: z.enum(ASSET_DETAIL_KINDS),
  /** Apartments, shops and similar: the asset is a container for units. */
  requiresUnits: z.boolean().default(false),
  /** Unit types permitted underneath this asset type. Empty when not applicable. */
  unitTypeKeys: z.array(slug('Unit type key')).default([]),
  defaultUnitTypeKey: slug('Default unit type key').nullish(),
  active: z.boolean().default(true),
});

export const DEFAULT_UNIT_TYPES: UnitType[] = [
  UnitTypeSchema.parse({ key: 'studio', label: 'Studio' }),
  UnitTypeSchema.parse({ key: 'one_bedroom', label: 'One bedroom', bedrooms: 1 }),
  UnitTypeSchema.parse({ key: 'two_bedroom', label: 'Two bedroom', bedrooms: 2 }),
  UnitTypeSchema.parse({ key: 'three_bedroom', label: 'Three bedroom', bedrooms: 3 }),
  UnitTypeSchema.parse({ key: 'four_bedroom', label: 'Four bedroom', bedrooms: 4 }),
  UnitTypeSchema.parse({ key: 'penthouse', label: 'Penthouse', bedrooms: 4 }),
  UnitTypeSchema.parse({ key: 'shop', label: 'Shop' }),
  UnitTypeSchema.parse({ key: 'office', label: 'Office' }),
];

export const DEFAULT_ASSET_TYPES: AssetType[] = [
  AssetTypeSchema.parse({ key: 'house', label: 'House', detailKind: 'PROPERTY' }),
  AssetTypeSchema.parse({
    key: 'apartment_block',
    label: 'Apartment block',
    detailKind: 'PROPERTY',
    requiresUnits: true,
    unitTypeKeys: [
      'studio',
      'one_bedroom',
      'two_bedroom',
      'three_bedroom',
      'four_bedroom',
      'penthouse',
    ],
    defaultUnitTypeKey: 'two_bedroom',
  }),
  AssetTypeSchema.parse({ key: 'land_plot', label: 'Land plot', detailKind: 'LAND_PARCEL' }),
  AssetTypeSchema.parse({
    key: 'both',
    label: 'Both (land & house)',
    detailKind: 'PROPERTY',
  }),
];

export const AssetModelFields = z.object({
  types: z.array(AssetTypeSchema).min(1, 'Declare at least one asset type'),
  unitTypes: z.array(UnitTypeSchema).default([]),
  allowMultipleAssetsPerResident: z.boolean().default(true),
  requireApprovalForAssignmentChanges: z.boolean().default(true),
});

export const AssetModelSchema = defaulted(AssetModelFields, {
  types: DEFAULT_ASSET_TYPES,
  unitTypes: DEFAULT_UNIT_TYPES,
});

// --- Identity, branding ------------------------------------------------------

export const OrganizationIdentityFields = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(160),
  slug: slug('Organization slug'),
  /** IANA timezone. Display-only until scheduling modules land. */
  timezone: z.string().trim().min(1).default('Africa/Lagos'),
  locale: z.string().trim().min(1).default('en-NG'),
  currency: z.literal('NGN').default('NGN'),
});

export const OrganizationIdentitySchema = defaulted(OrganizationIdentityFields, {
  name: 'Organization',
  slug: 'organization',
});

export const BrandingFields = z.object({
  primaryColor: hexColor.default('#FF5A1F'),
  logoUrl: z.url().nullish(),
  portalName: z.string().trim().min(1).max(80).default('Resident Portal'),
  supportEmail: z.email().nullish(),
  supportPhone: z.string().trim().max(32).nullish(),
});

export const BrandingSchema = defaulted(BrandingFields);

// --- Modules -----------------------------------------------------------------

export const ModulesFields = z.object({
  // Foundation modules.
  estates: z.boolean().default(true),
  residents: z.boolean().default(true),
  properties: z.boolean().default(true),
  assignments: z.boolean().default(true),
  billing: z.boolean().default(true),
  payments: z.boolean().default(true),
  gateAccess: z.boolean().default(true),
  maintenance: z.boolean().default(true),
  // Modules whose workflows are not yet specified; off until designed.
  power: z.boolean().default(false),
  pettyCash: z.boolean().default(false),
  facilities: z.boolean().default(false),
  shortlet: z.boolean().default(false),
});

export const ModulesSchema = defaulted(ModulesFields);

// --- Money and onboarding ----------------------------------------------------

export const FeeFields = z.object({
  amountKobo: kobo.default(0),
  currency: z.literal('NGN').default('NGN'),
  cadence: z.enum(FEE_CADENCES).default('ONE_OFF'),
  refundable: z.boolean().default(false),
  description: z.string().trim().max(160).nullish(),
});

export const FeeSchema = defaulted(FeeFields, { amountKobo: 0 });

export const FeesFields = z.object({
  /** Charged once, after profile completion, before account activation. */
  registration: FeeSchema,
  /** Optional; no amount is assumed for any deployment. */
  serviceCharge: FeeSchema.nullish(),
});

export const FeesSchema = defaulted(FeesFields);

export const ResidentCodeFields = z.object({
  /** Length of the persistent onboarding code (8–32). */
  length: z.number().int().min(8).max(32).default(10),
  /**
   * Codes are persistent: no TTL, no attempt cap, not single-use. A
   * resident may return and resume onboarding at any time with the same
   * code (until it completes or the admin revokes it).
   */
  persistent: z.literal(true).default(true),
});

export const ResidentCodeSchema = defaulted(ResidentCodeFields);

export const OnboardingFields = z.object({
  residentCode: ResidentCodeSchema,
  requireEmail: z.boolean().default(true),
  requireGovernmentId: z.boolean().default(true),
  requireNextOfKin: z.boolean().default(true),
  dependantsEnabled: z.boolean().default(true),
  maxDependants: z.number().int().min(0).max(20).default(5),
  /** Non-negotiable invariant: no portal account before a verified payment. */
  createAccountOnlyAfterVerifiedPayment: z.literal(true).default(true),
});

export const OnboardingSchema = defaulted(OnboardingFields);

export const PaymentsFields = z.object({
  provider: z.enum(PAYMENT_PROVIDERS).default('NONE'),
  environment: z.enum(PAYMENT_ENVIRONMENTS).default('TEST'),
  /**
   * Amounts are always resolved server-side from configuration or an invoice.
   * Encoded as a literal so a client can never request its own price.
   */
  serverControlledAmounts: z.literal(true).default(true),
});

export const PaymentsSchema = defaulted(PaymentsFields);

// --- Roles and custom fields -------------------------------------------------

export const RoleGrantSchema = z.object({
  role: z.enum(ROLE_KEYS),
  permissions: z.array(z.enum(PERMISSIONS)).min(1),
});

export const RolesFields = z.object({
  /** Additive or narrowing grants; omitted roles fall back to the shared baseline. */
  grants: z.array(RoleGrantSchema).default([]),
});

export const RolesSchema = defaulted(RolesFields);

export const CustomFieldSchema = z.object({
  key: slug('Custom field key'),
  label: label(80),
  entity: z.enum(CONFIG_ENTITY_KINDS),
  type: z.enum(CUSTOM_FIELD_TYPES),
  required: z.boolean().default(false),
  /** Only meaningful for SELECT and MULTI_SELECT. */
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(64),
        label: label(80),
      }),
    )
    .default([]),
  /** Restrict the definition to a single asset type, when relevant. */
  assetTypeKey: slug('Asset type key').nullish(),
  helpText: z.string().trim().max(280).nullish(),
  /** Sensitive definitions must be excluded from logs and exports by default. */
  pii: z.boolean().default(false),
});

// --- Property options (Phase 2) ------------------------------------------------

/**
 * Structured address components. Each component is a stable, code-level
 * definition: `key` is a slug used by forms, imports and identifiers;
 * `label` is the human-facing name. `requiredFor` lists the asset type keys
 * where the component must be supplied; when empty the component applies to
 * every asset type and is required unless overridden by `notApplicableFor`.
 *
 * Deliberately configurable: no Silverstone address convention is assumed.
 * A deployment ships with an empty component set until an administrator
 * configures the real structure.
 */
export const AddressComponentSchema = z.object({
  key: slug('Address component key'),
  label: label(80),
  /** Asset type keys that require this component. Empty = every type. */
  requiredFor: z.array(slug('Asset type key')).default([]),
  /** Asset type keys where this component does not apply (overrides required). */
  notApplicableFor: z.array(slug('Asset type key')).default([]),
  /** Optional regex the component value must match when supplied. */
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[\w\s\-./]+$/, 'Pattern must be a simple regex character set')
    .nullish(),
  maxLength: z.number().int().min(1).max(120).default(64),
});

export const DEFAULT_PROPERTY_OPTIONS = {
  addressComponents: [
    {
      key: 'address',
      label: 'Address',
      requiredFor: [],
      notApplicableFor: [],
      maxLength: 120,
    },
    {
      key: 'number_of_plots',
      label: 'Number of plots',
      requiredFor: ['land_plot', 'both'],
      notApplicableFor: ['house'],
      maxLength: 8,
      pattern: '\\d+',
    },
    {
      key: 'plot_name',
      label: 'Plot name',
      requiredFor: ['land_plot', 'both'],
      notApplicableFor: ['house'],
      maxLength: 64,
    },
    {
      key: 'house_type',
      label: 'House type',
      requiredFor: ['house', 'both'],
      notApplicableFor: ['land_plot'],
      maxLength: 48,
    },
  ] as unknown[],
  /**
   * Placeholder tokens: `{estate_slug}` plus `{componentKey}` for each
   * declared address component. Rendered by one central formatter.
   */
  identifierTemplate: '{estate_slug}',
  identifierMax: 120,
};

export const PropertyOptionsFields = z.object({
  addressComponents: z.array(AddressComponentSchema).default([]),
  identifierTemplate: z
    .string()
    .trim()
    .min(1, 'Identifier template is required')
    .max(200, 'Identifier template must be 200 characters or fewer')
    .default('{estate_slug}'),
  identifierMax: z.number().int().min(8).max(200).default(120),
});

export const PropertyOptionsSchema = defaulted(PropertyOptionsFields);

// --- Root document -----------------------------------------------------------

export const OrganizationConfigSchema = z
  .object({
    schemaVersion: z
      .literal(CONFIG_SCHEMA_VERSION, {
        error: `Unsupported configuration schemaVersion. Expected "${CONFIG_SCHEMA_VERSION}".`,
      })
      .default(CONFIG_SCHEMA_VERSION),
    organization: OrganizationIdentitySchema,
    branding: BrandingSchema,
    assetModel: AssetModelSchema,
    propertyOptions: PropertyOptionsSchema,
    modules: ModulesSchema,
    fees: FeesSchema,
    onboarding: OnboardingSchema,
    payments: PaymentsSchema,
    roles: RolesSchema,
    customFields: z.array(CustomFieldSchema).default([]),
  })
  .superRefine((config, ctx) => {
    const assetKeys = new Set<string>();
    for (const [index, assetType] of ((config.assetModel?.types ?? []) as AssetType[]).entries()) {
      if (assetKeys.has(assetType.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['assetModel', 'types', index, 'key'],
          message: `Duplicate asset type key "${assetType.key}"`,
        });
      }
      assetKeys.add(assetType.key);
    }

    const unitKeys = new Set<string>();
    for (const [index, unitType] of (
      (config.assetModel?.unitTypes ?? []) as UnitType[]
    ).entries()) {
      if (unitKeys.has(unitType.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['assetModel', 'unitTypes', index, 'key'],
          message: `Duplicate unit type key "${unitType.key}"`,
        });
      }
      unitKeys.add(unitType.key);
    }

    for (const [index, assetType] of ((config.assetModel?.types ?? []) as AssetType[]).entries()) {
      if (!assetType.requiresUnits) {
        if (assetType.unitTypeKeys.length > 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['assetModel', 'types', index, 'unitTypeKeys'],
            message: `Asset type "${assetType.key}" does not require units; unitTypeKeys must be empty`,
          });
        }
        continue;
      }

      if (assetType.unitTypeKeys.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['assetModel', 'types', index, 'unitTypeKeys'],
          message: `Asset type "${assetType.key}" requires units; declare at least one unit type`,
        });
      }

      for (const unitKey of assetType.unitTypeKeys) {
        if (!unitKeys.has(unitKey)) {
          ctx.addIssue({
            code: 'custom',
            path: ['assetModel', 'types', index, 'unitTypeKeys'],
            message: `Asset type "${assetType.key}" references unknown unit type "${unitKey}"`,
          });
        }
      }

      if (
        assetType.defaultUnitTypeKey &&
        !assetType.unitTypeKeys.includes(assetType.defaultUnitTypeKey)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['assetModel', 'types', index, 'defaultUnitTypeKey'],
          message: `Default unit type "${assetType.defaultUnitTypeKey}" is not permitted for asset type "${assetType.key}"`,
        });
      }
    }

    // --- Property options (Phase 2) -------------------------------------------
    const componentKeys = new Set<string>();
    for (const [index, component] of (
      (config.propertyOptions?.addressComponents ?? []) as z.output<typeof AddressComponentSchema>[]
    ).entries()) {
      if (componentKeys.has(component.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['propertyOptions', 'addressComponents', index, 'key'],
          message: `Duplicate address component key "${component.key}"`,
        });
      }
      componentKeys.add(component.key);
      for (const typeKey of [...component.requiredFor, ...component.notApplicableFor]) {
        if (!assetKeys.has(typeKey)) {
          ctx.addIssue({
            code: 'custom',
            path: ['propertyOptions', 'addressComponents', index, 'requiredFor'],
            message: `Address component "${component.key}" references unknown asset type "${typeKey}"`,
          });
        }
      }
    }

    // The identifier template may only reference {estate_slug} or declared
    // address components. Unknown placeholders would render empty tokens and
    // produce misleading identifiers.
    const template = (config.propertyOptions?.identifierTemplate as string) ?? '';
    const placeholderPattern = /\{([a-z][a-z0-9_]{0,47})\}/g;
    for (const match of template.matchAll(placeholderPattern)) {
      const token = match[1];
      if (token !== 'estate_slug' && !componentKeys.has(token ?? '')) {
        ctx.addIssue({
          code: 'custom',
          path: ['propertyOptions', 'identifierTemplate'],
          message: `Identifier template references unknown placeholder {${token}}`,
        });
      }
    }

    const fieldKeys = new Set<string>();
    for (const [index, field] of config.customFields.entries()) {
      const identity = `${field.entity}:${field.assetTypeKey ?? '*'}:${field.key}`;
      if (fieldKeys.has(identity)) {
        ctx.addIssue({
          code: 'custom',
          path: ['customFields', index, 'key'],
          message: `Duplicate custom field "${field.key}" for ${field.entity}`,
        });
      }
      fieldKeys.add(identity);

      const isSelect = field.type === 'SELECT' || field.type === 'MULTI_SELECT';
      if (isSelect && field.options.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['customFields', index, 'options'],
          message: `Custom field "${field.key}" is a ${field.type} and needs at least one option`,
        });
      }
      if (!isSelect && field.options.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['customFields', index, 'options'],
          message: `Custom field "${field.key}" is a ${field.type}; options are only valid for select fields`,
        });
      }
      if (field.assetTypeKey && !assetKeys.has(field.assetTypeKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['customFields', index, 'assetTypeKey'],
          message: `Custom field "${field.key}" references unknown asset type "${field.assetTypeKey}"`,
        });
      }
    }

    const grantedRoles = new Set<string>();
    for (const [index, grant] of (
      (config.roles?.grants ?? []) as z.output<typeof RoleGrantSchema>[]
    ).entries()) {
      if (grantedRoles.has(grant.role)) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles', 'grants', index, 'role'],
          message: `Role "${grant.role}" is granted more than once`,
        });
      }
      grantedRoles.add(grant.role);
    }
  });

/**
 * Fully-defaulted baseline. `OrganizationConfigSchema.parse({})` is valid by
 * design: a deployment can start with no configuration file at all.
 */
export function buildBaselineConfig(): OrganizationConfig {
  return OrganizationConfigSchema.parse({});
}

export type OrganizationConfig = z.output<typeof OrganizationConfigSchema>;
export type OrganizationConfigInput = z.input<typeof OrganizationConfigSchema>;
export type OrganizationIdentity = z.output<typeof OrganizationIdentitySchema>;
export type Branding = z.output<typeof BrandingSchema>;
export type AssetType = z.output<typeof AssetTypeSchema>;
export type UnitType = z.output<typeof UnitTypeSchema>;
export type CustomField = z.output<typeof CustomFieldSchema>;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export type ConfigEntityKind = (typeof CONFIG_ENTITY_KINDS)[number];
export type Fee = z.output<typeof FeeSchema>;
export type FeesConfig = z.output<typeof FeesSchema>;
export type ModulesConfig = z.output<typeof ModulesSchema>;
export type OnboardingConfig = z.output<typeof OnboardingSchema>;
export type PaymentsConfig = z.output<typeof PaymentsSchema>;
export type RolesConfig = z.output<typeof RolesSchema>;
export type AssetModel = z.output<typeof AssetModelSchema>;
export type PropertyOptions = z.output<typeof PropertyOptionsSchema>;
export type AddressComponent = z.output<typeof AddressComponentSchema>;

/** Re-exported so consumers can validate module keys against configuration. */
export { MODULE_KEYS };
