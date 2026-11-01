import { MODULE_KEYS, PERMISSIONS, ROLE_KEYS, SOS_CONTACT_CATEGORIES } from '@silverstone/shared';
import { z } from 'zod';

/**
 * Organization configuration.
 *
 * One deployment serves exactly one organization. This document describes how
 * that organization behaves — enabled modules, roles, fees, onboarding,
 * access codes, payments, SOS contacts and branding — without encoding any
 * deployment's data in code.
 *
 * The database copy is authoritative once an organization is provisioned. The
 * JSON file in `config/` supplies bootstrap defaults only.
 */

/** Version of the *document shape*, independent of the organization's version. */
export const CONFIG_SCHEMA_VERSION = '1.0.0' as const;

/** Configuration documents with a higher major version cannot be read safely. */
export const SUPPORTED_CONFIG_SCHEMA_MAJOR = 1;

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

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a six-digit hex colour such as #FF5A1F');

/** Non-negative integer kobo. Never a float, never a currency string. */
const kobo = z
  .number()
  .int('Amount must be an integer number of kobo')
  .min(0, 'Amount must not be negative')
  .max(Number.MAX_SAFE_INTEGER, 'Amount is too large');

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

/** Bounds for a resident-issued gate access code, expressed in hours. */
export const ACCESS_CODE_DURATION_MIN_HOURS = 1;
/** A code may not be issued for more than a year. */
export const ACCESS_CODE_DURATION_MAX_HOURS = 365 * 24;
/** Thirty days, preserved as the default after moving the setting to hours. */
export const DEFAULT_ACCESS_CODE_DURATION_HOURS = 30 * 24;

export const AccessCodesFields = z.object({
  /** Default validity when a resident generates a code without a duration. */
  defaultDurationHours: z
    .number()
    .int('Duration must be a whole number of hours')
    .min(ACCESS_CODE_DURATION_MIN_HOURS)
    .max(ACCESS_CODE_DURATION_MAX_HOURS)
    .default(DEFAULT_ACCESS_CODE_DURATION_HOURS),
  /**
   * Ceiling the estate office allows residents to request. Residents can never
   * issue or extend a code beyond this window.
   */
  maxDurationHours: z
    .number()
    .int('Duration must be a whole number of hours')
    .min(ACCESS_CODE_DURATION_MIN_HOURS)
    .max(ACCESS_CODE_DURATION_MAX_HOURS)
    .default(ACCESS_CODE_DURATION_MAX_HOURS),
});

/**
 * Accept the pre-hours `defaultDurationDays` field from a stored document and
 * convert it once. Without this, an estate that had customised its window
 * would silently fall back to the schema default when this version first
 * reads the document.
 */
export const AccessCodesSchema = z.preprocess(
  (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    if (
      record.defaultDurationHours === undefined &&
      typeof record.defaultDurationDays === 'number'
    ) {
      return { ...record, defaultDurationHours: record.defaultDurationDays * 24 };
    }
    return value;
  },
  defaulted(AccessCodesFields).superRefine((value, ctx) => {
    if (value.defaultDurationHours > value.maxDurationHours) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultDurationHours'],
        message: 'Default duration cannot exceed the maximum duration',
      });
    }
  }),
);

export const BankTransferDetailsFields = z.object({
  bankName: z.string().trim().max(120).nullable().default(null),
  accountName: z.string().trim().max(120).nullable().default(null),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10,20}$/, 'Account number must be 10–20 digits')
    .nullable()
    .default(null),
  sortCode: z.string().trim().max(20).nullable().default(null),
  instructions: z.string().trim().max(500).nullable().default(null),
});

export const BankTransferDetailsSchema = defaulted(BankTransferDetailsFields);

export const PaymentsFields = z.object({
  provider: z.enum(PAYMENT_PROVIDERS).default('NONE'),
  environment: z.enum(PAYMENT_ENVIRONMENTS).default('TEST'),
  /**
   * Amounts are always resolved server-side from configuration or an invoice.
   * Encoded as a literal so a client can never request its own price.
   */
  serverControlledAmounts: z.literal(true).default(true),
  /** Instructions shown to residents who pay by bank transfer. */
  bankTransfer: BankTransferDetailsSchema,
});

export const PaymentsSchema = defaulted(PaymentsFields);

export const SosContactSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1, 'Contact label is required').max(80),
  phone: z
    .string()
    .trim()
    .min(3, 'Phone number is required')
    .max(32)
    .regex(/^[+0-9()\-\s]+$/, 'Phone number contains invalid characters'),
  category: z.enum(SOS_CONTACT_CATEGORIES).default('OTHER'),
  notes: z.string().trim().max(200).nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100).default(0),
});

export const SosFields = z.object({
  /** Predefined emergency numbers shown on the SOS surfaces. */
  contacts: z.array(SosContactSchema).max(12, 'At most 12 emergency contacts').default([]),
});

export const SosSchema = defaulted(SosFields);

// --- Roles ------------------------------------------------------------------

export const RoleGrantSchema = z.object({
  role: z.enum(ROLE_KEYS),
  permissions: z.array(z.enum(PERMISSIONS)).min(1),
});

export const RolesFields = z.object({
  /** Additive or narrowing grants; omitted roles fall back to the shared baseline. */
  grants: z.array(RoleGrantSchema).default([]),
});

export const RolesSchema = defaulted(RolesFields);

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
    modules: ModulesSchema,
    fees: FeesSchema,
    onboarding: OnboardingSchema,
    accessCodes: AccessCodesSchema,
    payments: PaymentsSchema,
    sos: SosSchema,
    roles: RolesSchema,
  })
  .superRefine((config, ctx) => {
    const contactIds = new Set<string>();
    for (const [index, contact] of (
      (config.sos?.contacts ?? []) as z.output<typeof SosContactSchema>[]
    ).entries()) {
      if (contactIds.has(contact.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sos', 'contacts', index, 'id'],
          message: `Duplicate emergency contact id "${contact.id}"`,
        });
      }
      contactIds.add(contact.id);
    }

    // Bank-transfer details are all-or-nothing: a half-configured account
    // would show a resident an unusable payment instruction.
    const bankTransfer = config.payments.bankTransfer;
    const bankFields = [
      ['bankName', bankTransfer.bankName],
      ['accountName', bankTransfer.accountName],
      ['accountNumber', bankTransfer.accountNumber],
    ] as const;
    if (bankFields.some(([, value]) => typeof value === 'string' && value.trim().length > 0)) {
      for (const [field, value] of bankFields) {
        if (typeof value !== 'string' || value.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['payments', 'bankTransfer', field],
            message: 'Bank name, account name and account number are required together',
          });
        }
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
export type Fee = z.output<typeof FeeSchema>;
export type FeesConfig = z.output<typeof FeesSchema>;
export type ModulesConfig = z.output<typeof ModulesSchema>;
export type OnboardingConfig = z.output<typeof OnboardingSchema>;
export type AccessCodesConfig = z.output<typeof AccessCodesSchema>;
export type BankTransferDetails = z.output<typeof BankTransferDetailsSchema>;
export type PaymentsConfig = z.output<typeof PaymentsSchema>;
export type SosContact = z.output<typeof SosContactSchema>;
export type SosConfig = z.output<typeof SosSchema>;
export type RolesConfig = z.output<typeof RolesSchema>;

/** Re-exported so consumers can validate module keys against configuration. */
export { MODULE_KEYS };
