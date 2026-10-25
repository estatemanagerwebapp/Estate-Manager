/**
 * Phase 2 estate & property registry wire contracts.
 *
 * These types describe the envelope payloads only; the estates / properties
 * / imports modules in `apps/api` are the ones that produce them.
 *
 * Identifier philosophy: a property's `identifier` is a canonical,
 * human-facing registration code derived at create time from configured
 * address components via a central template. It is NOT a substitute for the
 * stable database UUID (`id`) used in relationships, and it is never
 * re-derived or silently rewritten after creation.
 */

// --- Estates -----------------------------------------------------------------

export const ESTATE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type EstateStatus = (typeof ESTATE_STATUSES)[number];

/** Safe, public projection of an estate. */
export interface EstateDto {
  id: string;
  organizationId: string;
  /** Lowercase slug, unique per organization; used as `{estate_slug}` in identifiers. */
  slug: string;
  name: string;
  /** Free-text location/description; not part of the identifier. */
  address: string | null;
  status: EstateStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEstateInput {
  name: string;
  /** Optional explicit slug; when omitted the API derives one from the name. */
  slug?: string;
  address?: string;
}

export interface UpdateEstateInput {
  name?: string;
  address?: string;
}

export interface EstateListResponse {
  estates: EstateDto[];
  total: number;
}

export interface EstateDetailResponse {
  estate: EstateDto;
  /** Count of registered properties (any status). */
  propertyCount: number;
  /** Count of ACTIVE properties. */
  activePropertyCount: number;
}

export interface SetEstateStatusResponse {
  ok: true;
  estate: EstateDto;
}

// --- Properties ----------------------------------------------------------------

export const PROPERTY_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

/**
 * Structured address components. Keys are defined by the organization
 * configuration (`propertyOptions.addressComponents`), not hardcoded.
 * Values are strings; leading zeros are preserved (values are never coerced
 * to numbers).
 */
export type AddressComponents = Record<string, string>;

export interface PropertyDto {
  id: string;
  estateId: string;
  /**
   * Stable registration identifier, derived at create time from the
   * configured identifier template. Immutable after creation.
   */
  identifier: string;
  /**
   * Config asset type key (e.g. `house`, `apartment_block`, `land_plot`).
   * Validated against the organization configuration at write time.
   */
  typeKey: string;
  /** Human-facing label, when the configured type has one. */
  typeLabel: string;
  status: PropertyStatus;
  /** Parent property id for unit-in-building relationships; null when top-level. */
  parentPropertyId: string | null;
  parentProperty: {
    id: string;
    identifier: string;
  } | null;
  /**
   * When this property is a unit (child of an apartment block etc.), the
   * configured unit type key from the parent's permitted unit types.
   */
  unitTypeKey: string | null;
  /**
   * When this property's asset type requires units (e.g. apartment block),
   * the configured default unit type key for new units under it.
   */
  defaultUnitTypeKey: string | null;
  /** Raw structured address components as configured. */
  addressComponents: AddressComponents;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePropertyInput {
  estateId: string;
  typeKey: string;
  parentPropertyId?: string;
  /** Address component values keyed by configured component key. */
  addressComponents?: AddressComponents;
}

export interface UpdatePropertyInput {
  status?: PropertyStatus;
  /** Address components may be updated; the identifier is NOT. */
  addressComponents?: AddressComponents;
}

export interface PropertyListResponse {
  properties: PropertyDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PropertyDetailResponse {
  property: PropertyDto;
}

// --- Property options (read-only config view) ----------------------------------

export interface PropertyOptionsView {
  /** Configuration version the options were resolved from. */
  configVersion: number;
  /** Whether a valid, complete identifier can currently be derived. */
  identifierConfigured: boolean;
  addressComponents: Array<{
    key: string;
    label: string;
    /** Human-readable list of which asset types require this. */
    requiredForLabels: string[];
    /** Asset type keys where this component does not apply (overrides required). */
    notApplicableFor: string[];
    /** Optional regex the component value must match when supplied. */
    pattern: string | null;
    /** Maximum character length for the component value. */
    maxLength: number;
  }>;
  /** The identifier template string, e.g. `{estate_slug}-{block}-{unit}`. */
  identifierTemplate: string;
  /** Maximum character length for the derived identifier. */
  identifierMax: number;
  /** Available asset type options (code + label + active). */
  assetTypes: Array<{ key: string; label: string; active: boolean; detailKind: string }>;
  /** Available unit type options. */
  unitTypes: Array<{ key: string; label: string; bedrooms: number; active: boolean }>;
}

// --- Import batches ------------------------------------------------------------

export const IMPORT_BATCH_STATUSES = [
  'PREVIEWED',
  'COMMITTED',
  'COMMIT_FAILED',
  'FAILED',
] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

export interface ImportBatchDto {
  id: string;
  estateId: string;
  estateName: string;
  filename: string;
  /** SHA-256 hex fingerprint of the uploaded file contents. */
  fingerprint: string;
  status: ImportBatchStatus;
  /** The organization configuration version pinned at upload time. */
  configVersion: number;
  /** True when the active config has advanced past the batch's pinned version. */
  configDrift: boolean;
  counts: {
    total: number;
    valid: number;
    error: number;
    duplicateInFile: number;
    collision: number;
    created: number;
    skippedCollision: number;
    failed: number;
  };
  uploadedById: string;
  uploadedAt: string;
  committedAt: string | null;
}

export type ImportRowStatus =
  | 'VALID'
  | 'ERROR'
  | 'DUPLICATE_IN_FILE'
  | 'COLLISION'
  | 'CREATED'
  | 'DUPLICATE_EXISTING';

export interface ImportRowDto {
  id: string;
  batchId: string;
  /** 1-based physical row number in the first worksheet of the uploaded workbook.
   Row 1 is the required header. Data rows retain their original worksheet
   row numbers; fully blank rows are skipped without renumbering. */
  rowNumber: number;
  status: ImportRowStatus;
  /** Structured error reasons; empty when the row is valid/created. */
  errors: string[];
  /** Set when the row resulted in a created property. */
  propertyId: string | null;
}

export interface ImportPreviewResponse {
  batch: ImportBatchDto;
  /** Row-level results, capped for preview; the full set is persisted. */
  rows: ImportRowDto[];
  /** When true, the active config has changed since this batch was validated. */
  configDrift: boolean;
  /** Human-readable guidance when config drift is detected. */
  guidance?: string;
}

export interface ImportCommitResponse {
  batch: ImportBatchDto;
  /** The created property ids, in commit order. */
  createdPropertyIds: string[];
}

/**
 * Template download descriptor. The template is generated server-side from
 * the active configuration so its columns never drift from allowed values.
 *
 * The actual download is a binary `.xlsx` workbook — this interface describes
 * its structural metadata, it is not the HTTP response body.
 *
 * The generated workbook's first worksheet is header-only: row 1 holds the
 * column headers and no importable sample row follows. Re-uploading the
 * unchanged template therefore creates no properties.
 */
export interface ImportTemplateInfo {
  estateId: string;
  estateName: string;
  configVersion: number;
  /** Column headers in the order they appear in the template. */
  columns: string[];
  /** Free-text instructions embedded in the worksheet's Instructions sheet. */
  instructions: string;
}

// --- New audit event types (Phase 2) -------------------------------------------

export const PHASE2_AUDIT_EVENT_TYPES = [
  'estate.created',
  'estate.updated',
  'estate.status_changed',
  'property.created',
  'property.updated',
  'property.status_changed',
  'import.previewed',
  'import.completed',
  'import.commit_failed',
  'propertyOptions.updated',
] as const;

export type Phase2AuditEventType = (typeof PHASE2_AUDIT_EVENT_TYPES)[number];

// --- Property options update request -------------------------------------------

/**
 * Request body for updating the property-options block of the organization
 * configuration. The caller must supply `baseVersion` for optimistic
 * concurrency; a stale version is refused with 409.
 */
export interface UpdatePropertyOptionsRequest {
  /** The config version the caller is building on. */
  baseVersion: number;
  /** The new property-options block. */
  propertyOptions: {
    addressComponents: Array<{
      key: string;
      label: string;
      requiredFor: string[];
      notApplicableFor: string[];
      pattern?: string | null;
      maxLength: number;
    }>;
    identifierTemplate: string;
    identifierMax: number;
  };
}
