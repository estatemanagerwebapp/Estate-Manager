/**
 * Phase 2 unit tests: identifier derivation, typed property rules, estate
 * service rules, and import workbook parsing. No database.
 */
import { describe, expect, it } from 'vitest';
import { deriveIdentifier } from './lib/property-identifier.js';
import {
  normalizeAddressFields,
  validatePropertyFields,
} from './modules/properties/property-rules.js';
import type { HouseTypeRecord } from './modules/properties/house-type-repository.js';
import { slugify } from './modules/estates/estate.service.js';
import { parseWorkbook, buildTemplate } from './modules/imports/excel-parser.js';

// --- Helpers -------------------------------------------------------------------

const houseTypes: HouseTypeRecord[] = [
  { key: 'bungalow', label: 'Bungalow', requiresUnitFields: false, active: true, sortOrder: 1 },
  { key: 'apartment', label: 'Apartment', requiresUnitFields: true, active: true, sortOrder: 4 },
];

const bungalow = houseTypes[0]!;
const apartment = houseTypes[1]!;

function derive(
  kind: 'HOUSE' | 'LAND' | 'BOTH',
  fields: Record<string, string | null>,
  houseType: HouseTypeRecord | null = bungalow,
) {
  return deriveIdentifier({
    estateSlug: 'silverstone',
    kind,
    houseType,
    streetName: fields.street_name ?? '',
    houseNumber: fields.house_number,
    blockName: fields.block_name,
    floorNumber: fields.floor_number,
    unitNumber: fields.unit_number,
    plotNumber: fields.plot_number,
  });
}

async function writeTestWorkbook(rows: string[][]): Promise<Buffer> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Properties');
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// --- Identifier derivation -----------------------------------------------------

describe('deriveIdentifier', () => {
  it('renders a land identifier from street and plot number', () => {
    const result = derive('LAND', { street_name: 'Main St', plot_number: '42' }, null);
    expect(result.incomplete).toBe(false);
    expect(result.identifier).toBe('silverstone-Main St-42');
  });

  it('renders a house identifier with a house number', () => {
    const result = derive('HOUSE', { street_name: 'Oak Ave', house_number: '17' });
    expect(result.incomplete).toBe(false);
    expect(result.identifier).toBe('silverstone-Oak Ave-17');
  });

  it('renders a unit-house identifier with block, floor, and unit', () => {
    const result = derive(
      'HOUSE',
      {
        street_name: 'Main St',
        block_name: 'Block A',
        floor_number: '3',
        unit_number: '12',
      },
      apartment,
    );
    expect(result.incomplete).toBe(false);
    expect(result.identifier).toBe('silverstone-Main St-Block A-3-12');
  });

  it('appends plot number for a both property', () => {
    const result = derive('BOTH', {
      street_name: 'Oak Ave',
      house_number: '17',
      plot_number: '42',
    });
    expect(result.incomplete).toBe(false);
    expect(result.identifier).toBe('silverstone-Oak Ave-17-42');
  });

  it('reports a missing required field', () => {
    const result = derive('LAND', { street_name: 'Main St' }, null);
    expect(result.incomplete).toBe(true);
    expect(result.identifier).toBeNull();
    expect(result.reasons.some((reason) => reason.includes('Plot number'))).toBe(true);
  });

  it('rejects an empty estate slug', () => {
    const result = deriveIdentifier({
      estateSlug: '   ',
      kind: 'LAND',
      houseType: null,
      streetName: 'Main St',
      plotNumber: '42',
    });
    expect(result.incomplete).toBe(true);
    expect(result.reasons.some((reason) => reason.includes('empty'))).toBe(true);
  });

  it('rejects an identifier over the database maximum', () => {
    const result = deriveIdentifier({
      estateSlug: 'a'.repeat(150),
      kind: 'LAND',
      houseType: null,
      streetName: 'b'.repeat(100),
      plotNumber: '42',
    });
    expect(result.incomplete).toBe(true);
    expect(result.reasons.some((reason) => reason.includes('characters'))).toBe(true);
  });

  it('preserves leading zeros', () => {
    const result = derive('LAND', { street_name: 'Main St', plot_number: '007' }, null);
    expect(result.identifier).toBe('silverstone-Main St-007');
  });

  it('requires a house type for house and both properties', () => {
    const result = derive('HOUSE', { street_name: 'Main St', house_number: '1' }, null);
    expect(result.incomplete).toBe(true);
    expect(result.reasons.some((reason) => reason.includes('house type'))).toBe(true);
  });
});

// --- Typed property rules -------------------------------------------------------

describe('validatePropertyFields', () => {
  const base = normalizeAddressFields({ streetName: 'Main St' });

  it('accepts a bungalow with a house number', () => {
    const result = validatePropertyFields({
      kind: 'HOUSE',
      houseType: bungalow,
      ...base,
      houseNumber: '17',
    });
    expect(result.valid).toBe(true);
  });

  it('requires block, floor, and unit for an apartment', () => {
    const result = validatePropertyFields({ kind: 'HOUSE', houseType: apartment, ...base });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.blockName).toMatch(/required/i);
    expect(result.fieldErrors.floorNumber).toMatch(/required/i);
    expect(result.fieldErrors.unitNumber).toMatch(/required/i);
  });

  it('rejects a house number on an apartment', () => {
    const result = validatePropertyFields({
      kind: 'HOUSE',
      houseType: apartment,
      ...base,
      houseNumber: '17',
      blockName: 'Block A',
      floorNumber: '3',
      unitNumber: '12',
    });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.houseNumber).toMatch(/does not apply/i);
  });

  it('requires street, plot number, and plot name for land', () => {
    const result = validatePropertyFields({ kind: 'LAND', houseType: null, ...base });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.plotNumber).toMatch(/required/i);
    expect(result.fieldErrors.plotName).toMatch(/required/i);
  });

  it('rejects house fields on land', () => {
    const result = validatePropertyFields({
      kind: 'LAND',
      houseType: null,
      ...base,
      houseNumber: '17',
      plotNumber: '42',
      plotName: 'North plot',
    });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.houseNumber).toMatch(/does not apply/i);
  });

  it('requires both house and land fields for both', () => {
    const result = validatePropertyFields({
      kind: 'BOTH',
      houseType: bungalow,
      ...base,
      houseNumber: '17',
      plotNumber: '42',
      plotName: 'North plot',
    });
    expect(result.valid).toBe(true);
  });

  it('enforces field maximum lengths', () => {
    const result = validatePropertyFields({
      kind: 'HOUSE',
      houseType: bungalow,
      ...normalizeAddressFields({ streetName: 'x'.repeat(121), houseNumber: '1' }),
    });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.streetName).toMatch(/120 characters/);
  });
});

// --- Estate service rules ------------------------------------------------------

describe('estate service: slugify', () => {
  it('converts mixed-case names to lowercase hyphenated slugs', () => {
    expect(slugify('Silver Stone Garden')).toBe('silver-stone-garden');
  });

  it('strips special characters and normalises separators to hyphens', () => {
    expect(slugify('Estate #5 (West)')).toBe('estate-5-west');
    expect(slugify('Clove_Apartments')).toBe('clove-apartments');
  });

  it('caps at 63 characters', () => {
    expect(slugify('a'.repeat(100))).toHaveLength(63);
  });

  it('falls back to "estate" when the name has no valid characters', () => {
    expect(slugify('!!!')).toBe('estate');
  });
});

// --- Import workbook parsing ---------------------------------------------------

describe('excel-parser: parseWorkbook', () => {
  it('returns rowLimitExceeded=true when data rows exceed maxRows', async () => {
    const file = await writeTestWorkbook([
      ['type', 'house_type', 'street_name', 'plot_number', 'plot_name'],
      ...Array.from({ length: 5001 }, (_, i) => [
        'land',
        '',
        'Main St',
        String(i + 1).padStart(3, '0'),
        'North',
      ]),
    ]);

    const result = await parseWorkbook(file, {
      houseTypes,
      estateSlug: 'est',
      existingIdentifiers: new Set(),
      maxRows: 5000,
    });
    expect(result.rowLimitExceeded).toBe(true);
    expect(result.dataRowTotal).toBe(5001);
  });

  it('does not exceed the limit for in-range data', async () => {
    const file = await writeTestWorkbook([
      ['type', 'house_type', 'street_name', 'plot_number', 'plot_name'],
      ['land', '', 'Oak Ave', '17', 'North'],
      ['land', '', 'Pine Rd', '42', 'South'],
    ]);
    const result = await parseWorkbook(file, {
      houseTypes,
      estateSlug: 'est',
      existingIdentifiers: new Set(),
      maxRows: 5000,
    });
    expect(result.rowLimitExceeded).toBe(false);
    expect(result.dataRowTotal).toBe(2);
    expect(result.rows.every((row) => row.status === 'VALID')).toBe(true);
  });

  it('detects in-file duplicates', async () => {
    const file = await writeTestWorkbook([
      ['type', 'house_type', 'street_name', 'plot_number', 'plot_name'],
      ['land', '', 'Oak Ave', '17', 'North'],
      ['land', '', 'Oak Ave', '17', 'North'],
    ]);
    const result = await parseWorkbook(file, {
      houseTypes,
      estateSlug: 'est',
      existingIdentifiers: new Set(),
      maxRows: 5000,
    });
    expect(result.rows[0]?.status).toBe('VALID');
    expect(result.rows[1]?.status).toBe('DUPLICATE_IN_FILE');
  });

  it('detects a collision with an existing identifier', async () => {
    const file = await writeTestWorkbook([
      ['type', 'house_type', 'street_name', 'plot_number', 'plot_name'],
      ['land', '', 'Oak Ave', '17', 'North'],
    ]);
    const result = await parseWorkbook(file, {
      houseTypes,
      estateSlug: 'est',
      existingIdentifiers: new Set(['est-Oak Ave-17']),
      maxRows: 5000,
    });
    expect(result.rows[0]?.status).toBe('COLLISION');
  });

  it('requires house_type for house rows and rejects it for land', async () => {
    const file = await writeTestWorkbook([
      ['type', 'house_type', 'street_name', 'house_number'],
      ['house', '', 'Oak Ave', '17'],
      ['house', 'bungalow', 'Oak Ave', '17'],
      ['land', 'bungalow', 'Oak Ave', ''],
    ]);
    const result = await parseWorkbook(file, {
      houseTypes,
      estateSlug: 'est',
      existingIdentifiers: new Set(),
      maxRows: 5000,
    });
    expect(result.rows[0]?.status).toBe('ERROR');
    expect(result.rows[1]?.status).toBe('VALID');
    expect(result.rows[2]?.status).toBe('ERROR');
  });

  it('reports physical worksheet row numbers and skips blank rows', async () => {
    const file = await writeTestWorkbook([
      ['type', 'house_type', 'street_name', 'plot_number', 'plot_name'],
      ['land', '', 'Oak Ave', '17', 'North'],
      [],
      ['land', '', 'Pine Rd', '42', 'South'],
    ]);
    const result = await parseWorkbook(file, {
      houseTypes,
      estateSlug: 'est',
      existingIdentifiers: new Set(),
      maxRows: 5000,
    });
    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(result.dataRowTotal).toBe(2);
  });
});

describe('excel-parser: buildTemplate', () => {
  it('builds the exact property columns', () => {
    const result = buildTemplate(
      { id: 'est-1', slug: 'est', name: 'Test Estate' },
      houseTypes,
      'One property per row.',
    );
    expect(result.columns).toEqual([
      'type',
      'house_type',
      'street_name',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
      'plot_number',
      'plot_name',
    ]);
    expect(result.buffer).toBeDefined();
  });

  it('produces a header-only first worksheet and keeps guidance on sheet two', async () => {
    const result = buildTemplate(
      { id: 'est-1', slug: 'est', name: 'Test Estate' },
      houseTypes,
      'One property per row.',
    );
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await result.buffer) as unknown as Buffer);
    expect(workbook.worksheets[0]?.name).toBe('Properties');
    expect(workbook.worksheets[0]?.actualRowCount).toBe(1);
    expect(workbook.worksheets[1]?.name).toBe('Instructions');
  });
});
