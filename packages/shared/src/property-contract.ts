/**
 * Phase 2 estate & property registry wire contracts.
 *
 * These types describe the envelope payloads only; the estates / properties
 * / imports modules in `apps/api` are the ones that produce them.
 *
 * Identifier philosophy: a property's `identifier` is a canonical,
 * human-facing registration code derived at create time from the typed
 * kind/house-type/address fields by one central formatter. It is NOT a
 * substitute for the stable database UUID (`id`) used in relationships, and it
 * is never re-derived or silently rewritten after creation.
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

export const PROPERTY_KINDS = ['HOUSE', 'LAND', 'BOTH'] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
  HOUSE: 'House',
  LAND: 'Land',
  BOTH: 'Both',
};

/**
 * A row from the organization's real house-type catalogue. `requiresUnitFields`
 * is the address-shape switch: apartment/flat use block + floor + unit, while
 * bungalow/terrace/duplex use a house number.
 */
export interface HouseTypeDto {
  key: string;
  label: string;
  requiresUnitFields: boolean;
  active: boolean;
}

export interface HouseTypesResponse {
  houseTypes: HouseTypeDto[];
}

export interface PropertyDto {
  id: string;
  estateId: string;
  /**
   * Stable registration identifier, derived at create time from the typed
   * address fields. Immutable after creation.
   */
  identifier: string;
  /** Human-facing name; null for legacy/import-created records. */
  name: string | null;
  kind: PropertyKind;
  kindLabel: string;
  /** House type key for HOUSE/BOTH; null for LAND. */
  houseType: string | null;
  houseTypeLabel: string | null;
  /** True when the house type uses block/floor/unit instead of a house number. */
  houseTypeRequiresUnitFields: boolean;
  streetName: string;
  houseNumber: string | null;
  blockName: string | null;
  floorNumber: string | null;
  unitNumber: string | null;
  plotNumber: string | null;
  plotName: string | null;
  status: PropertyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePropertyInput {
  estateId: string;
  kind: PropertyKind;
  /** Required for HOUSE and BOTH; must be an active house-type key. */
  houseType?: string | null;
  /** Human-facing property name. Optional; import-created rows leave it null. */
  name?: string;
  streetName: string;
  houseNumber?: string | null;
  blockName?: string | null;
  floorNumber?: string | null;
  unitNumber?: string | null;
  plotNumber?: string | null;
  plotName?: string | null;
}

export interface UpdatePropertyInput {
  status?: PropertyStatus;
  /** Human-facing property name; optional — left undefined means unchanged. */
  name?: string | null;
  /** Address fields may be updated; the identifier is NOT re-derived. */
  streetName?: string;
  houseNumber?: string | null;
  blockName?: string | null;
  floorNumber?: string | null;
  unitNumber?: string | null;
  plotNumber?: string | null;
  plotName?: string | null;
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

// --- Import batches ------------------------------------------------------------

export const IMPORT_BATCH_STATUSES = ['PREVIEWED', 'COMMITTED', 'COMMIT_FAILED', 'FAILED'] as const;
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
  /** Rows identified as generated samples from the legacy workbook template. */
  legacySampleRows: number;
  uploadedById: string;
  uploadedAt: string;
  committedAt: string | null;
}

export type ImportRowStatus =
  'VALID' | 'ERROR' | 'DUPLICATE_IN_FILE' | 'COLLISION' | 'CREATED' | 'DUPLICATE_EXISTING';

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
  /** Row-level results for every parsed row (at most the 5,000-row workbook limit). */
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
  'estate.deleted',
  'property.created',
  'property.updated',
  'property.status_changed',
  'property.deleted',
  'import.previewed',
  'import.completed',
  'import.commit_failed',
  'propertyOptions.updated',
] as const;

export type Phase2AuditEventType = (typeof PHASE2_AUDIT_EVENT_TYPES)[number];
