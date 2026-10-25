import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

/**
 * Excel workbook parsing and validation for bulk property import.
 *
 * The parser reads a `.xlsx` workbook with `exceljs` (streaming reader),
 * validates each data row against the configured asset types / property
 * options, and produces a structured row-level result that the import
 * service persists as `ImportRow` records.
 *
 * The template is also generated here so the column headers never drift
 * from the active configuration.
 */

export interface ParsedImportRow {
  /** 1-based data row number (the header is row 0). */
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
  /** Configured asset types, used for type-key validation. */
  assetTypes: ReadonlyArray<{ key: string; label: string; active: boolean; detailKind: string }>;
  /** Configured property options (address components + identifier template). */
  propertyOptions: {
    addressComponents: ReadonlyArray<{
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
  /** Estate slug, for identifier derivation. */
  estateSlug: string;
  /** Estate id, for collision pre-check. */
  estateId: string;
  /** Existing property identifiers in the estate, for collision detection. */
  existingIdentifiers: Set<string>;
  /** The identifier renderer (injected to keep this module testable). */
  renderIdentifier: (input: {
    estateSlug: string;
    typeKey: string;
    addressComponents: Record<string, string>;
  }) => { identifier: string | null; incomplete: boolean; reasons: string[] };
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

  // Determine columns from the header row.
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, _colNumber) => {
    const value = String(cell.value ?? '').trim();
    headers.push(value);
  });

  const rowLimit = context.maxRows ?? 5000;
  const seenInFile = new Set<string>();
  const rows: ParsedImportRow[] = [];
  let dataRowCount = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    dataRowCount += 1;

    // Hard reject beyond the limit.
    if (dataRowCount > rowLimit) return;

    const raw: Record<string, string> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) {
        raw[header] = cellToString(cell.value);
      }
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
  const errors: string[] = [];

  // 1. typeKey must be a configured, active asset type.
  const typeKey = raw['type']?.trim() ?? '';
  if (!typeKey) {
    errors.push('Column "type" is required');
  } else {
    const assetType = context.assetTypes.find((type) => type.key === typeKey);
    if (!assetType) {
      errors.push(`Unknown property type "${typeKey}"; it is not in the configured asset types`);
    } else if (!assetType.active) {
      errors.push(`Property type "${assetType.label}" is not active and cannot be imported`);
    }
  }

  // 2. Address components: validate required + max length.
  const addressComponents: Record<string, string> = {};
  for (const component of context.propertyOptions.addressComponents) {
    const value = raw[component.key]?.trim() ?? '';
    if (value === '') {
      const isRequired =
        (component.requiredFor.length === 0 || component.requiredFor.includes(typeKey)) &&
        !component.notApplicableFor.includes(typeKey);
      if (isRequired && typeKey) {
        errors.push(`Missing required address component "${component.label}"`);
      }
    } else {
      if (value.length > component.maxLength) {
        errors.push(
          `Address component "${component.label}" exceeds ${component.maxLength} characters`,
        );
      }
      if (component.pattern) {
        try {
          const regex = new RegExp(component.pattern);
          if (!regex.test(value)) {
            errors.push(
              `Address component "${component.label}" does not match the required format`,
            );
          }
        } catch {
          // Malformed pattern in config: skip the check, flag the config issue.
          errors.push(`Configured pattern for "${component.label}" is invalid`);
        }
      }
    }
    addressComponents[component.key] = value;
  }

  // 3. If there are validation errors so far, mark as ERROR and skip the
  //    identifier / duplicate checks (they need a valid type).
  if (errors.length > 0) {
    return { status: 'ERROR', errors };
  }

  // 4. Render the identifier.
  const derived = context.renderIdentifier({
    estateSlug: context.estateSlug,
    typeKey,
    addressComponents,
  });

  if (derived.incomplete || derived.identifier === null) {
    errors.push(`Incomplete identifier: ${derived.reasons.join('; ')}`);
    return { status: 'ERROR', errors };
  }

  // 5. Collision with an existing property in the estate.
  if (context.existingIdentifiers.has(derived.identifier)) {
    return { status: 'COLLISION', errors: [] };
  }

  // 6. Duplicate within the file.
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
  // Rich text / formula cells: extract the string content.
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
 * Generates a template workbook for the current configuration. The caller
 * writes the returned buffer to the response.
 */
export function buildTemplate(
  estate: { id: string; slug: string; name: string },
  assetTypes: ImportRowContext['assetTypes'],
  propertyOptions: ImportRowContext['propertyOptions'],
  instructions: string,
): { buffer: Promise<Buffer>; columns: string[] } {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Silverstone Managers';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Properties');

  const columns = ['type', ...propertyOptions.addressComponents.map((c) => c.key)];

  // Set columns explicitly via the worksheet.columns setter; the array
  // starts as null in some exceljs versions, so assign it fresh.
  const columnInfos = columns.map((column) => ({
    header: column,
    key: column,
    width: 24,
  }));
  worksheet.columns = columnInfos as unknown as typeof worksheet.columns;

  // Sample row.
  const sampleRow: Record<string, string> = { type: assetTypes[0]?.key ?? '' };
  for (const component of propertyOptions.addressComponents) {
    sampleRow[component.key] = `sample_${component.key}`;
  }
  worksheet.addRow(sampleRow);

  // Instructions on a second sheet.
  const infoSheet = workbook.addWorksheet('Instructions');
  infoSheet.addRow(['Instructions']);
  infoSheet.addRow([instructions]);
  infoSheet.addRow([`Estate: ${estate.name} (${estate.slug})`]);
  infoSheet.addRow([
    'One property per row. The "type" column must be a configured asset type key.',
  ]);

  // exceljs returns a Node Buffer (typed against its own Buffer alias) that is
  // structurally identical to node:buffer's. Cast through unknown to keep
  // the signature honest without pulling in a duplicate Buffer type.
  const buffer: Promise<Buffer> = workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  return { buffer, columns };
}
