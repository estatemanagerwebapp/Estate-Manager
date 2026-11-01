import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import {
  ORG_IMPORT_COLUMNS,
  ORG_IMPORT_MAX_ROWS,
  ORG_IMPORT_SHEETS,
  type OrgImportSheet,
  type PropertyKind,
} from '@silverstone/shared';
import type { HouseTypeRecord } from '../properties/house-type-repository.js';
import { normalizeAddressFields, validatePropertyFields } from '../properties/property-rules.js';
import { deriveIdentifier } from '../../lib/property-identifier.js';
import { AppError } from '../../lib/errors.js';
import type { OrgImportValidationContext } from './org-import.repository.js';
import { invoiceKey, propertyKey } from './org-import.repository.js';

/** A validated row payload persisted as `OrganizationImportRow.data`. */
export type OrgImportPayload =
  | {
      kind: 'estate';
      slug: string;
      name: string;
      address: string | null;
      status: string;
    }
  | {
      kind: 'property';
      estateSlug: string;
      estateId: string | null;
      identifier: string;
      propertyKind: PropertyKind;
      houseTypeKey: string | null;
      fields: ReturnType<typeof normalizeAddressFields>;
      name: string | null;
      status: string;
    }
  | {
      kind: 'facility';
      estateSlug: string;
      estateId: string | null;
      name: string;
      description: string;
      bookable: boolean;
      usageFeeKobo: number;
    }
  | {
      kind: 'resident';
      estateSlug: string;
      estateId: string | null;
      propertyIdentifier: string;
      propertyId: string | null;
      firstName: string;
      email: string;
      phone: string | null;
    }
  | {
      kind: 'billing';
      residentEmail: string;
      userId: string;
      propertyId: string | null;
      propertyIdentifier: string | null;
      period: string;
      amountKobo: number;
      dueAt: string;
      status: string;
    };

export interface ParsedOrgRow {
  sheet: OrgImportSheet;
  rowNumber: number;
  status: 'VALID' | 'ERROR' | 'DUPLICATE_IN_FILE' | 'COLLISION';
  errors: string[];
  reference: string;
  payload: OrgImportPayload | null;
}

export interface OrgParseResult {
  rows: ParsedOrgRow[];
  fingerprint: string;
  dataRowTotal: number;
}

interface RawRow {
  rowNumber: number;
  raw: Record<string, string>;
}

type EstateRef = { id: string | null; slug: string; status: string };
type PropertyRef = {
  id: string | null;
  identifier: string;
  status: string;
  estateSlug: string;
};

const SLUG_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse and validate an organization import workbook. No domain records are
 * written here; the caller persists the returned rows as a PREVIEWED batch.
 */
export async function parseOrgWorkbook(
  bytes: Buffer,
  input: {
    context: OrgImportValidationContext;
    houseTypes: ReadonlyArray<HouseTypeRecord>;
  },
): Promise<OrgParseResult> {
  const fingerprint = createHash('sha256').update(bytes).digest('hex');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);

  const sheets = readRawSheets(workbook);
  const dataRowTotal = [...sheets.values()].reduce((total, rows) => total + rows.length, 0);
  if (dataRowTotal === 0) {
    throw new AppError(
      400,
      'IMPORT_INVALID_FILE',
      'The workbook contains no data rows. Add rows under the header row and upload again.',
    );
  }
  if (dataRowTotal > ORG_IMPORT_MAX_ROWS) {
    throw new AppError(
      400,
      'IMPORT_REJECTED',
      `The workbook contains ${dataRowTotal} data rows; the limit is ${ORG_IMPORT_MAX_ROWS}. Split it into smaller workbooks.`,
    );
  }

  const availableEstates = new Map<string, EstateRef>();
  for (const [slug, estate] of input.context.estatesBySlug) {
    availableEstates.set(slug, { id: estate.id, slug: estate.slug, status: estate.status });
  }
  const availableProperties = new Map<string, PropertyRef>();
  for (const [key, property] of input.context.propertiesByKey) {
    availableProperties.set(key, {
      id: property.id,
      identifier: property.identifier,
      status: property.status,
      estateSlug: property.estateSlug,
    });
  }
  const facilityNames = new Set(input.context.facilityNames);
  const usedEmails = new Set(input.context.usedEmails);
  const invoiceKeys = new Set(input.context.invoiceKeys);

  const seenEstates = new Set<string>();
  const seenProperties = new Set<string>();
  const seenFacilities = new Set<string>();
  const seenResidentEmails = new Set<string>();
  const seenInvoiceKeys = new Set<string>();

  const rows: ParsedOrgRow[] = [];

  for (const sheet of ORG_IMPORT_SHEETS) {
    const rawRows = sheets.get(sheet) ?? [];
    for (const rawRow of rawRows) {
      const row =
        sheet === 'Estates'
          ? validateEstate(rawRow, { availableEstates, seenEstates })
          : sheet === 'Properties'
            ? validateProperty(rawRow, {
                availableEstates,
                availableProperties,
                seenProperties,
                houseTypes: input.houseTypes,
              })
            : sheet === 'Facilities'
              ? validateFacility(rawRow, {
                  availableEstates,
                  facilityNames,
                  seenFacilities,
                })
              : sheet === 'Residents'
                ? validateResident(rawRow, {
                    availableEstates,
                    availableProperties,
                    usedEmails,
                    seenResidentEmails,
                  })
                : validateBilling(rawRow, {
                    context: input.context,
                    activeResidentsByEmail: input.context.activeResidentsByEmail,
                    invoiceKeys,
                    seenInvoiceKeys,
                  });
      rows.push({ sheet, rowNumber: rawRow.rowNumber, ...row });
    }
  }

  return { rows, fingerprint, dataRowTotal };
}

function readRawSheets(workbook: ExcelJS.Workbook): Map<OrgImportSheet, RawRow[]> {
  const result = new Map<OrgImportSheet, RawRow[]>();
  for (const sheetName of ORG_IMPORT_SHEETS) {
    const worksheet = findWorksheet(workbook, sheetName);
    if (!worksheet) continue;

    const expected = ORG_IMPORT_COLUMNS[sheetName];
    const expectedNormalized = expected.map(normalizeHeader);
    const headerRow = worksheet.getRow(1);
    const columnByHeader = new Map<string, number>();
    headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const header = normalizeHeader(cellToString(cell.value));
      if (header.length > 0 && !columnByHeader.has(header)) {
        columnByHeader.set(header, columnNumber);
      }
    });

    const missing = expectedNormalized.filter((header) => !columnByHeader.has(header));
    if (missing.length > 0) {
      throw new AppError(
        400,
        'IMPORT_INVALID_FILE',
        `Sheet "${sheetName}" is missing required column(s): ${missing.join(', ')}.`,
      );
    }

    const rows: RawRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const raw: Record<string, string> = {};
      let hasValue = false;
      for (const header of expectedNormalized) {
        const columnNumber = columnByHeader.get(header);
        if (!columnNumber) continue;
        const value = cellToString(row.getCell(columnNumber).value).trim();
        raw[header] = value;
        if (value.length > 0) hasValue = true;
      }
      if (hasValue) rows.push({ rowNumber, raw });
    });
    result.set(sheetName, rows);
  }
  return result;
}

function findWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: OrgImportSheet,
): ExcelJS.Worksheet | undefined {
  const direct = workbook.getWorksheet(sheetName);
  if (direct) return direct;
  const wanted = sheetName.toLowerCase();
  return workbook.worksheets.find((worksheet) => worksheet.name.trim().toLowerCase() === wanted);
}

function validateEstate(
  row: RawRow,
  state: {
    availableEstates: Map<string, EstateRef>;
    seenEstates: Set<string>;
  },
): Omit<ParsedOrgRow, 'sheet' | 'rowNumber'> {
  const raw = row.raw;
  const slug = normalizeSlug(raw.slug ?? '');
  const name = (raw.name ?? '').trim();
  const address = (raw.address ?? '').trim();
  const statusResult = parseEnum(raw.status ?? '', ['ACTIVE', 'ARCHIVED'], 'ACTIVE');
  const errors: string[] = [];

  if (!slug) errors.push('Column "slug" is required.');
  else if (!SLUG_PATTERN.test(slug)) {
    errors.push(
      'Column "slug" must start with a lowercase letter and contain only lowercase letters, digits, hyphens and underscores.',
    );
  }
  if (!name) errors.push('Column "name" is required.');
  else if (name.length > 160) errors.push('Column "name" must be 160 characters or fewer.');
  if (address.length > 500) errors.push('Column "address" must be 500 characters or fewer.');
  if (statusResult.error) errors.push(statusResult.error);

  const reference = slug || '(missing slug)';
  if (errors.length > 0) {
    return { status: 'ERROR', errors, reference, payload: null };
  }

  if (state.seenEstates.has(slug)) {
    return {
      status: 'DUPLICATE_IN_FILE',
      errors: [`Estate slug "${slug}" appears more than once in this workbook.`],
      reference,
      payload: null,
    };
  }
  if (state.availableEstates.has(slug)) {
    return {
      status: 'COLLISION',
      errors: [`Estate slug "${slug}" already exists in this organization.`],
      reference,
      payload: null,
    };
  }

  state.seenEstates.add(slug);
  state.availableEstates.set(slug, { id: null, slug, status: statusResult.value });
  return {
    status: 'VALID',
    errors: [],
    reference,
    payload: {
      kind: 'estate',
      slug,
      name,
      address: address || null,
      status: statusResult.value,
    },
  };
}

function validateProperty(
  row: RawRow,
  state: {
    availableEstates: Map<string, EstateRef>;
    availableProperties: Map<string, PropertyRef>;
    seenProperties: Set<string>;
    houseTypes: ReadonlyArray<HouseTypeRecord>;
  },
): Omit<ParsedOrgRow, 'sheet' | 'rowNumber'> {
  const raw = row.raw;
  const estateSlug = normalizeSlug(raw.estate_slug ?? '');
  const estate = state.availableEstates.get(estateSlug);
  const typeValue = (raw.type ?? '').trim().toLowerCase();
  const kind: PropertyKind | null =
    typeValue === 'house'
      ? 'HOUSE'
      : typeValue === 'land'
        ? 'LAND'
        : typeValue === 'both'
          ? 'BOTH'
          : null;
  const houseTypeValue = (raw.house_type ?? '').trim();
  const statusResult = parseEnum(raw.status ?? '', ['ACTIVE', 'ARCHIVED'], 'ACTIVE');
  const name = (raw.name ?? '').trim();
  const errors: string[] = [];

  if (!estateSlug) errors.push('Column "estate_slug" is required.');
  else if (!estate) errors.push(`Unknown estate slug "${estateSlug}".`);
  else if (estate.status !== 'ACTIVE') {
    errors.push(`Estate "${estateSlug}" is archived and cannot receive properties.`);
  }

  if (!typeValue) errors.push('Column "type" is required (house, land, or both).');
  else if (!kind) errors.push(`Unknown property type "${typeValue}"; use house, land, or both.`);

  let houseType: HouseTypeRecord | null = null;
  if (kind === 'LAND') {
    if (houseTypeValue) errors.push('Column "house_type" does not apply to land.');
  } else if (kind) {
    if (!houseTypeValue) {
      errors.push('Column "house_type" is required for house and both properties.');
    } else {
      houseType =
        state.houseTypes.find(
          (candidate) => candidate.key.toLowerCase() === houseTypeValue.toLowerCase(),
        ) ?? null;
      if (!houseType) errors.push(`Unknown or inactive house type "${houseTypeValue}".`);
    }
  }

  if (name.length > 120) errors.push('Column "name" must be 120 characters or fewer.');
  if (statusResult.error) errors.push(statusResult.error);

  const fields = normalizeAddressFields({
    streetName: raw.street_name,
    houseNumber: raw.house_number,
    blockName: raw.block_name,
    floorNumber: raw.floor_number,
    unitNumber: raw.unit_number,
    plotNumber: raw.plot_number,
    plotName: raw.plot_name,
  });

  let identifier = '';
  if (kind && estateSlug) {
    const validation = validatePropertyFields({ kind, houseType, ...fields });
    if (!validation.valid) errors.push(...validation.reasons);
    const derived = deriveIdentifier({
      estateSlug,
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
      errors.push(`Incomplete identifier: ${derived.reasons.join('; ')}`);
    } else {
      identifier = derived.identifier;
    }
  }

  const reference = `${estateSlug || '(missing estate)'} / ${identifier || '(unresolved identifier)'}`;
  if (errors.length > 0) {
    return { status: 'ERROR', errors, reference, payload: null };
  }

  const key = propertyKey(estateSlug, identifier);
  if (state.seenProperties.has(key)) {
    return {
      status: 'DUPLICATE_IN_FILE',
      errors: [`Property "${identifier}" appears more than once in this workbook.`],
      reference,
      payload: null,
    };
  }
  if (state.availableProperties.has(key)) {
    return {
      status: 'COLLISION',
      errors: [`Property "${identifier}" already exists in estate "${estateSlug}".`],
      reference,
      payload: null,
    };
  }

  state.seenProperties.add(key);
  state.availableProperties.set(key, {
    id: null,
    identifier,
    status: statusResult.value,
    estateSlug,
  });
  return {
    status: 'VALID',
    errors: [],
    reference,
    payload: {
      kind: 'property',
      estateSlug,
      estateId: estate?.id ?? null,
      identifier,
      propertyKind: kind!,
      houseTypeKey: houseType?.key ?? null,
      fields,
      name: name || null,
      status: statusResult.value,
    },
  };
}

function validateFacility(
  row: RawRow,
  state: {
    availableEstates: Map<string, EstateRef>;
    facilityNames: Set<string>;
    seenFacilities: Set<string>;
  },
): Omit<ParsedOrgRow, 'sheet' | 'rowNumber'> {
  const raw = row.raw;
  const estateSlug = normalizeSlug(raw.estate_slug ?? '');
  const estate = state.availableEstates.get(estateSlug);
  const name = (raw.name ?? '').trim();
  const description = (raw.description ?? '').trim();
  const fee = parseNairaToKobo(raw.usage_fee_naira ?? '');
  const bookable = parseBoolean(raw.bookable ?? '', true);
  const errors: string[] = [];

  if (!estateSlug) errors.push('Column "estate_slug" is required.');
  else if (!estate) errors.push(`Unknown estate slug "${estateSlug}".`);
  else if (estate.status !== 'ACTIVE') {
    errors.push(`Estate "${estateSlug}" is archived and cannot receive facilities.`);
  }
  if (!name) errors.push('Column "name" is required.');
  else if (name.length > 160) errors.push('Column "name" must be 160 characters or fewer.');
  if (!description) errors.push('Column "description" is required.');
  else if (description.length > 2000) {
    errors.push('Column "description" must be 2000 characters or fewer.');
  }
  if (fee.error) errors.push(fee.error);
  if (bookable.error) errors.push(bookable.error);

  const reference = `${estateSlug || '(missing estate)'} / ${name || '(missing name)'}`;
  if (errors.length > 0) {
    return { status: 'ERROR', errors, reference, payload: null };
  }

  const key = `${estateSlug}\u0000${name.toLowerCase()}`;
  if (state.seenFacilities.has(key)) {
    return {
      status: 'DUPLICATE_IN_FILE',
      errors: [`Facility "${name}" appears more than once in this workbook.`],
      reference,
      payload: null,
    };
  }
  if (state.facilityNames.has(key)) {
    return {
      status: 'COLLISION',
      errors: [`Facility "${name}" already exists in estate "${estateSlug}".`],
      reference,
      payload: null,
    };
  }

  state.seenFacilities.add(key);
  state.facilityNames.add(key);
  return {
    status: 'VALID',
    errors: [],
    reference,
    payload: {
      kind: 'facility',
      estateSlug,
      estateId: estate?.id ?? null,
      name,
      description,
      bookable: bookable.value,
      usageFeeKobo: fee.value,
    },
  };
}

function validateResident(
  row: RawRow,
  state: {
    availableEstates: Map<string, EstateRef>;
    availableProperties: Map<string, PropertyRef>;
    usedEmails: Set<string>;
    seenResidentEmails: Set<string>;
  },
): Omit<ParsedOrgRow, 'sheet' | 'rowNumber'> {
  const raw = row.raw;
  const estateSlug = normalizeSlug(raw.estate_slug ?? '');
  const estate = state.availableEstates.get(estateSlug);
  const propertyIdentifier = (raw.property_identifier ?? '').trim();
  const property = propertyIdentifier
    ? state.availableProperties.get(propertyKey(estateSlug, propertyIdentifier))
    : undefined;
  const firstName = (raw.first_name ?? '').trim();
  const email = (raw.email ?? '').trim().toLowerCase();
  const phone = (raw.phone ?? '').trim();
  const errors: string[] = [];

  if (!estateSlug) errors.push('Column "estate_slug" is required.');
  else if (!estate) errors.push(`Unknown estate slug "${estateSlug}".`);
  else if (estate.status !== 'ACTIVE') {
    errors.push(`Estate "${estateSlug}" is archived and cannot receive residents.`);
  }
  if (!propertyIdentifier) errors.push('Column "property_identifier" is required.');
  else if (!property) {
    errors.push(
      `Unknown property "${propertyIdentifier}" in estate "${estateSlug || '(missing estate)'}".`,
    );
  } else if (property.status !== 'ACTIVE') {
    errors.push(`Property "${propertyIdentifier}" is archived.`);
  }
  if (!firstName) errors.push('Column "first_name" is required.');
  else if (firstName.length > 120) {
    errors.push('Column "first_name" must be 120 characters or fewer.');
  }
  if (!email) errors.push('Column "email" is required.');
  else if (email.length > 255 || !EMAIL_PATTERN.test(email)) {
    errors.push('Column "email" must be a valid email address.');
  }
  if (phone.length > 40) errors.push('Column "phone" must be 40 characters or fewer.');

  const reference = `${estateSlug || '(missing estate)'} / ${propertyIdentifier || '(missing property)'} / ${email || '(missing email)'}`;
  if (errors.length > 0) {
    return { status: 'ERROR', errors, reference, payload: null };
  }

  if (state.seenResidentEmails.has(email)) {
    return {
      status: 'DUPLICATE_IN_FILE',
      errors: [`Resident email "${email}" appears more than once in this workbook.`],
      reference,
      payload: null,
    };
  }
  if (state.usedEmails.has(email)) {
    return {
      status: 'COLLISION',
      errors: [`A user or onboarding draft with email "${email}" already exists.`],
      reference,
      payload: null,
    };
  }

  state.seenResidentEmails.add(email);
  state.usedEmails.add(email);
  return {
    status: 'VALID',
    errors: [],
    reference,
    payload: {
      kind: 'resident',
      estateSlug,
      estateId: estate?.id ?? null,
      propertyIdentifier,
      propertyId: property?.id ?? null,
      firstName,
      email,
      phone: phone || null,
    },
  };
}

function validateBilling(
  row: RawRow,
  state: {
    context: OrgImportValidationContext;
    activeResidentsByEmail: OrgImportValidationContext['activeResidentsByEmail'];
    invoiceKeys: Set<string>;
    seenInvoiceKeys: Set<string>;
  },
): Omit<ParsedOrgRow, 'sheet' | 'rowNumber'> {
  const raw = row.raw;
  const residentEmail = (raw.resident_email ?? '').trim().toLowerCase();
  const resident = state.activeResidentsByEmail.get(residentEmail);
  const propertyIdentifier = (raw.property_identifier ?? '').trim();
  const period = (raw.period ?? '').trim();
  const amount = parseNairaToKobo(raw.amount_naira ?? '', { required: true });
  const dueAt = parseDateValue(raw.due_date ?? '');
  const statusResult = parseEnum(raw.status ?? '', ['UNPAID', 'OVERDUE'], 'UNPAID');
  const errors: string[] = [];

  if (!residentEmail) errors.push('Column "resident_email" is required.');
  else if (!resident) {
    errors.push(
      `No active resident account with email "${residentEmail}". Complete onboarding before importing billing rows.`,
    );
  }
  if (!period) errors.push('Column "period" is required.');
  else if (period.length > 48) errors.push('Column "period" must be 48 characters or fewer.');
  if (amount.error) errors.push(amount.error);
  if (dueAt.error) errors.push(dueAt.error);
  if (statusResult.error) errors.push(statusResult.error);

  let propertyId = resident?.propertyId ?? null;
  if (propertyIdentifier) {
    if (!resident?.estateSlug) {
      errors.push(
        `Resident "${residentEmail}" has no completed property; remove property_identifier or complete onboarding first.`,
      );
    } else {
      const property = state.context.propertiesByKey.get(
        propertyKey(resident.estateSlug, propertyIdentifier),
      );
      if (!property) {
        errors.push(`Unknown property "${propertyIdentifier}" in estate "${resident.estateSlug}".`);
      } else if (property.status !== 'ACTIVE') {
        errors.push(`Property "${propertyIdentifier}" is archived.`);
      } else {
        propertyId = property.id;
      }
    }
  }

  const reference = `${residentEmail || '(missing email)'} / ${period || '(missing period)'}`;
  if (errors.length > 0) {
    return { status: 'ERROR', errors, reference, payload: null };
  }

  const key = invoiceKey(resident!.id, period, amount.value);
  if (state.seenInvoiceKeys.has(key)) {
    return {
      status: 'DUPLICATE_IN_FILE',
      errors: [`This invoice appears more than once in the workbook.`],
      reference,
      payload: null,
    };
  }
  if (state.invoiceKeys.has(key)) {
    return {
      status: 'COLLISION',
      errors: [
        `An invoice for "${residentEmail}" with period "${period}" and amount ${amount.value / 100} already exists.`,
      ],
      reference,
      payload: null,
    };
  }

  state.seenInvoiceKeys.add(key);
  state.invoiceKeys.add(key);
  return {
    status: 'VALID',
    errors: [],
    reference,
    payload: {
      kind: 'billing',
      residentEmail,
      userId: resident!.id,
      propertyId,
      propertyIdentifier: propertyIdentifier || resident!.propertyIdentifier,
      period,
      amountKobo: amount.value,
      dueAt: dueAt.value.toISOString(),
      status: statusResult.value,
    },
  };
}

// --- Value helpers ------------------------------------------------------------

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function parseEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): { value: T; error: string | null } {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return { value: fallback, error: null };
  if ((allowed as readonly string[]).includes(trimmed)) {
    return { value: trimmed as T, error: null };
  }
  return {
    value: fallback,
    error: `Column value "${value}" must be one of: ${allowed.join(', ')}.`,
  };
}

function parseBoolean(value: string, fallback: boolean): { value: boolean; error: string | null } {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return { value: fallback, error: null };
  if (['true', 'yes', 'y', '1'].includes(trimmed)) return { value: true, error: null };
  if (['false', 'no', 'n', '0'].includes(trimmed)) return { value: false, error: null };
  return {
    value: fallback,
    error: `Column value "${value}" must be true/false (or yes/no).`,
  };
}

function parseNairaToKobo(
  value: string,
  options: { required?: boolean } = {},
): { value: number; error: string | null } {
  const cleaned = value
    .trim()
    .replace(/[₦,\s]/g, '')
    .replace(/^NGN/i, '');
  if (!cleaned) {
    if (options.required) {
      return { value: 0, error: 'Column "amount_naira" is required.' };
    }
    return { value: 0, error: null };
  }
  const naira = Number(cleaned);
  if (!Number.isFinite(naira) || naira < 0) {
    return { value: 0, error: `Amount "${value}" must be a non-negative number.` };
  }
  if (options.required && naira <= 0) {
    return { value: 0, error: 'Invoice amount must be greater than zero.' };
  }
  const kobo = Math.round(naira * 100);
  if (!Number.isSafeInteger(kobo)) {
    return { value: 0, error: `Amount "${value}" is too large.` };
  }
  // `amount_kobo` and `usage_fee_kobo` are PostgreSQL INTEGER columns.
  if (kobo > 2_147_483_647) {
    return {
      value: 0,
      error: `Amount "${value}" is too large; the maximum is 21,474,836.47 naira.`,
    };
  }
  return { value: kobo, error: null };
}

function parseDateValue(value: string): { value: Date; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { value: new Date(0), error: 'Column "due_date" is required.' };
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return {
      value: new Date(0),
      error: `Column "due_date" value "${value}" is not a valid date.`,
    };
  }
  return { value: date, error: null };
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
  if (asObject.result !== undefined) return String(asObject.result);
  return String(value);
}

/**
 * Read only the Billing resident emails before the full validation context is
 * loaded. This lets the repository fetch just the invoices that could collide
 * instead of every invoice in the organization. Header validation is the same
 * as the full parse.
 */
export async function extractBillingResidentEmails(bytes: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheets = readRawSheets(workbook);
  return (sheets.get('Billing') ?? [])
    .map((row) => (row.raw.resident_email ?? '').trim().toLowerCase())
    .filter((email) => email.length > 0);
}

// --- Template -----------------------------------------------------------------

export interface OrgTemplateInput {
  houseTypes: ReadonlyArray<HouseTypeRecord>;
  estates: ReadonlyArray<{ slug: string; name: string; status: string }>;
  instructions: string;
}

export function buildOrgTemplate(input: OrgTemplateInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Silverstone Managers';
  workbook.created = new Date();

  for (const sheetName of ORG_IMPORT_SHEETS) {
    const worksheet = workbook.addWorksheet(sheetName);
    const columns = ORG_IMPORT_COLUMNS[sheetName];
    worksheet.columns = columns.map((column) => ({
      header: column,
      key: column,
      width: 24,
    })) as unknown as typeof worksheet.columns;
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [{ header: 'Instructions', key: 'instruction', width: 120 }];
  const lines = [
    input.instructions,
    '',
    'Commit order: Estates → Properties → Facilities → Residents → Billing.',
    'Estates: slug must be lowercase and unique. Properties reference estate_slug.',
    'Properties: type is house, land, or both. House/both rows require house_type; land rows leave it blank.',
    'Facilities: estate_slug must exist; name and description are required; usage_fee_naira is a flat fee per booking.',
    'Residents: creates onboarding drafts only, assigned to estate_slug + property_identifier. Email must be unique.',
    'Billing: creates unpaid invoices for residents who already have an active account. It does not create accounts or payments.',
    'Billing rows cannot reference residents created in the same workbook; complete their onboarding first.',
    'Amounts are naira. Dates use YYYY-MM-DD or ISO timestamps.',
    'Existing slugs, property identifiers, facility names, resident emails, and invoice keys are reported as collisions.',
  ];
  for (const line of lines) instructions.addRow([line]);
  instructions.getRow(1).font = { bold: true };

  const reference = workbook.addWorksheet('Reference');
  reference.columns = [
    { header: 'kind', key: 'kind', width: 24 },
    { header: 'key', key: 'key', width: 32 },
    { header: 'label', key: 'label', width: 48 },
    { header: 'detail', key: 'detail', width: 32 },
  ];
  for (const houseType of input.houseTypes) {
    reference.addRow([
      'house_type',
      houseType.key,
      houseType.label,
      houseType.requiresUnitFields ? 'block + floor + unit' : 'house number',
    ]);
  }
  for (const estate of input.estates) {
    reference.addRow(['estate', estate.slug, estate.name, estate.status]);
  }
  reference.getRow(1).font = { bold: true };

  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}
