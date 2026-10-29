/**
 * Organization-level data import wire contracts.
 *
 * A single workbook onboards the organization: estates first, then properties,
 * facilities, resident onboarding drafts, and opening invoices. The importer is
 * preview-first and create-only; these types describe the persisted batch and
 * row results the operator reviews before committing.
 */

export const ORG_IMPORT_SHEETS = [
  'Estates',
  'Properties',
  'Facilities',
  'Residents',
  'Billing',
] as const;

export type OrgImportSheet = (typeof ORG_IMPORT_SHEETS)[number];

export const ORG_IMPORT_BATCH_STATUSES = [
  'PREVIEWED',
  'COMMITTED',
  'COMMIT_FAILED',
  'FAILED',
] as const;

export type OrgImportBatchStatus = (typeof ORG_IMPORT_BATCH_STATUSES)[number];

export const ORG_IMPORT_ROW_STATUSES = [
  'VALID',
  'ERROR',
  'DUPLICATE_IN_FILE',
  'COLLISION',
  'CREATED',
] as const;

export type OrgImportRowStatus = (typeof ORG_IMPORT_ROW_STATUSES)[number];

/** Per-sheet counters. */
export interface OrgImportSheetCounts {
  total: number;
  valid: number;
  error: number;
  duplicateInFile: number;
  collision: number;
  created: number;
}

/** Whole-batch counters, including the per-sheet breakdown. */
export interface OrgImportCounts extends OrgImportSheetCounts {
  failed: number;
  sheets: Record<OrgImportSheet, OrgImportSheetCounts>;
}

export interface OrgImportBatchDto {
  id: string;
  filename: string;
  /** SHA-256 hex fingerprint of the raw workbook bytes. */
  fingerprint: string;
  status: OrgImportBatchStatus;
  counts: OrgImportCounts;
  uploadedById: string;
  uploadedAt: string;
  committedAt: string | null;
}

export interface OrgImportRowDto {
  id: string;
  batchId: string;
  sheet: OrgImportSheet;
  /** 1-based physical row number in that worksheet. Row 1 is the header. */
  rowNumber: number;
  status: OrgImportRowStatus;
  errors: string[];
  /**
   * Short, human-readable identifier for the row (estate slug, property
   * identifier, facility name, resident email, or invoice period). The raw
   * workbook row is deliberately not exposed through the API.
   */
  reference: string;
  /** Domain entity created by this row, when committed. */
  entityType: string | null;
  entityId: string | null;
}

export interface OrgImportPreviewResponse {
  batch: OrgImportBatchDto;
  rows: OrgImportRowDto[];
}

export interface OrgImportDetailResponse {
  batch: OrgImportBatchDto;
  rows: OrgImportRowDto[];
}

export interface OrgImportListResponse {
  batches: OrgImportBatchDto[];
  total: number;
}

export interface OrgImportCreatedCounts {
  estates: number;
  properties: number;
  facilities: number;
  residents: number;
  invoices: number;
}

export interface OrgImportCommitResponse {
  batch: OrgImportBatchDto;
  created: OrgImportCreatedCounts;
}

export interface OrgImportTemplateSheet {
  name: OrgImportSheet;
  columns: string[];
}

export interface OrgImportTemplateInfo {
  filename: string;
  sheets: OrgImportTemplateSheet[];
  instructions: string;
}

/** Column headers for each sheet. Mirrors the server template generator. */
export const ORG_IMPORT_COLUMNS: Record<OrgImportSheet, readonly string[]> = {
  Estates: ['slug', 'name', 'address', 'status'],
  Properties: [
    'estate_slug',
    'type',
    'house_type',
    'street_name',
    'house_number',
    'block_name',
    'floor_number',
    'unit_number',
    'plot_number',
    'plot_name',
    'name',
    'status',
  ],
  Facilities: ['estate_slug', 'name', 'description', 'bookable', 'usage_fee_naira'],
  Residents: ['estate_slug', 'property_identifier', 'first_name', 'email', 'phone'],
  Billing: [
    'resident_email',
    'property_identifier',
    'period',
    'amount_naira',
    'due_date',
    'status',
  ],
};

/** Maximum data rows across all worksheets in one workbook. */
export const ORG_IMPORT_MAX_ROWS = 2000;
