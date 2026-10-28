import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { PropertyKind } from '@silverstone/shared';
import type { HouseTypeRecord } from '../properties/house-type-repository.js';
import {
  normalizeAddressFields,
  validatePropertyFields,
  type PropertyAddressFields,
} from '../properties/property-rules.js';
import { deriveIdentifier } from '../../lib/property-identifier.js';

/**
 * Excel workbook parsing and validation for bulk property import.
 *
 * The parser reads a `.xlsx` workbook with `exceljs`, validates each data row
 * against the same typed property rules as the manual form, and produces a
 * structured row-level result that the import service persists as `ImportRow`
 * records. The template is generated from the same static column list so the
 * workbook and the database/module model cannot drift.
 */

/** The exact workbook columns. Keep in sync with the template. */
export const IMPORT_COLUMNS = [
  'type',
  'house_type',
  'street_name',
  'house_number',
  'block_name',
  'floor_number',
  'unit_number',
  'plot_number',
  'plot_name',
] as const;

export interface ParsedImportRow {
  /** 1-based physical row number in the first worksheet. Row 1 is the header. */
  rowNumber: number;
  /** The raw cell values as strings. */
  raw: Record<string, string>;
  /** Validated status. */
  status: 'VALID' | 'ERROR' | 'DUPLICATE_IN_FILE' | 'COLLISION';
  /** Structured error reasons; empty when valid. */
  errors: string[];
}

export interface ParseResult {
  rows: ParsedImportRow[];
  /** Number of data rows (excluding the header). */
  dataRowTotal: number;
  /** Whether the row limit was exceeded. */
  rowLimitExceeded: boolean;
  /** SHA-256 hex fingerprint of the raw file bytes. */
  fingerprint: string;
}

export interface ImportRowContext {
  /** Active house-type catalogue rows. */
  houseTypes: ReadonlyArray<HouseTypeRecord>;
  /** Estate slug, for identifier derivation. */
  estateSlug: string;
  /** Existing property identifiers in the estate, for collision detection. */
  existingIdentifiers: Set<string>;
  /** Max data rows allowed in a single workbook. */
  maxRows?: number;
}

/**
 * Reads the workbook, parses every data row and returns row-level results.
 * No database writes happen here — the import service persists the results.
 */
export async function parseWorkbook(
  filePath: string,
  context: ImportRowContext,
): Promise<ParseResult> {
  const bytes = await fs.readFile(filePath);
  const fingerprint = createHash('sha256').update(bytes).digest('hex');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return {
      rows: [],
      dataRowTotal: 0,
      rowLimitExceeded: false,
      fingerprint,
    };
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? '').trim());
  });

  const rowLimit = context.maxRows ?? 5000;
  const seenInFile = new Set<string>();
  const rows: ParsedImportRow[] = [];
  let dataRowCount = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    dataRowCount += 1;
    if (dataRowCount > rowLimit) return;

    const raw: Record<string, string> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) raw[header] = cellToString(cell.value);
    });

    const result = validateRow(raw, context, seenInFile);
    rows.push({ rowNumber, raw, status: result.status, errors: result.errors });
  });

  return {
    rows,
    dataRowTotal: dataRowCount,
    rowLimitExceeded: dataRowCount > rowLimit,
    fingerprint,
  };
}

function validateRow(
  raw: Record<string, string>,
  context: ImportRowContext,
  seenInFile: Set<string>,
): { status: ParsedImportRow['status']; errors: string[] } {
  const typeValue = (raw.type ?? '').trim().toLowerCase();
  const kind: PropertyKind | null =
    typeValue === 'house'
      ? 'HOUSE'
      : typeValue === 'land'
        ? 'LAND'
        : typeValue === 'both'
          ? 'BOTH'
          : null;
  if (!typeValue) {
    return { status: 'ERROR', errors: ['Column "type" is required (house, land, or both)'] };
  }
  if (!kind) {
    return {
      status: 'ERROR',
      errors: [`Unknown property type "${typeValue}"; use house, land, or both`],
    };
  }

  const houseTypeValue = (raw.house_type ?? '').trim();
  let houseType: HouseTypeRecord | null = null;
  if (kind === 'LAND') {
    if (houseTypeValue) {
      return { status: 'ERROR', errors: ['Column "house_type" does not apply to land'] };
    }
  } else {
    if (!houseTypeValue) {
      return {
        status: 'ERROR',
        errors: ['Column "house_type" is required for house and both properties'],
      };
    }
    houseType = context.houseTypes.find((type) => type.key === houseTypeValue) ?? null;
    if (!houseType) {
      return {
        status: 'ERROR',
        errors: [`Unknown or inactive house type "${houseTypeValue}"`],
      };
    }
  }

  const fields: PropertyAddressFields = normalizeAddressFields({
    streetName: raw.street_name,
    houseNumber: raw.house_number,
    blockName: raw.block_name,
    floorNumber: raw.floor_number,
    unitNumber: raw.unit_number,
    plotNumber: raw.plot_number,
    plotName: raw.plot_name,
  });

  const validation = validatePropertyFields({ kind, houseType, ...fields });
  if (!validation.valid) {
    return { status: 'ERROR', errors: validation.reasons };
  }

  const derived = deriveIdentifier({
    estateSlug: context.estateSlug,
    kind,
    houseType: houseType
      ? { key: houseType.key, requiresUnitFields: houseType.requiresUnitFields }
      : null,
    streetName: fields.streetName ?? '',
    houseNumber: fields.houseNumber,
    blockName: fields.blockName,
    floorNumber: fields.floorNumber,
    unitNumber: fields.unitNumber,
    plotNumber: fields.plotNumber,
  });
  if (derived.incomplete || derived.identifier === null) {
    return { status: 'ERROR', errors: [`Incomplete identifier: ${derived.reasons.join('; ')}`] };
  }

  if (context.existingIdentifiers.has(derived.identifier)) {
    return { status: 'COLLISION', errors: [] };
  }
  if (seenInFile.has(derived.identifier)) {
    return { status: 'DUPLICATE_IN_FILE', errors: [] };
  }
  seenInFile.add(derived.identifier);

  return { status: 'VALID', errors: [] };
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return String(value);
  const asObject = value as { richText?: Array<{ text?: string }>; result?: unknown };
  if (Array.isArray(asObject.richText)) {
    return asObject.richText.map((part) => part.text ?? '').join('');
  }
  if (asObject.result !== undefined) {
    return String(asObject.result);
  }
  return String(value);
}

/**
 * Generates the header-only template workbook. The caller writes the returned
 * buffer to the response.
 */
export function buildTemplate(
  estate: { id: string; slug: string; name: string },
  houseTypes: ReadonlyArray<HouseTypeRecord>,
  instructions: string,
): { buffer: Promise<Buffer>; columns: string[] } {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Silverstone Managers';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Properties');
  const columns = [...IMPORT_COLUMNS];
  worksheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: 24,
  })) as unknown as typeof worksheet.columns;

  const infoSheet = workbook.addWorksheet('Instructions');
  infoSheet.addRow(['Instructions']);
  infoSheet.addRow([instructions]);
  infoSheet.addRow([`Estate: ${estate.name} (${estate.slug})`]);
  infoSheet.addRow(['Allowed type values: house, land, both.']);
  infoSheet.addRow([
    `House types: ${houseTypes.map((type) => `${type.key} (${type.label})`).join(', ') || 'none configured'}`,
  ]);
  infoSheet.addRow([
    'House properties use either house_number or block_name + floor_number + unit_number, depending on the selected house type.',
  ]);
  infoSheet.addRow([
    'Land and both properties require plot_number and plot_name. Import rows must satisfy the same rules as the manual form.',
  ]);
  infoSheet.addRow(['Silverstone template format: 3']);

  const buffer: Promise<Buffer> = workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  return { buffer, columns };
}
