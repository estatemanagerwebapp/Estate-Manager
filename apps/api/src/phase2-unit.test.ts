/**
 * Phase 2 unit tests: identifier derivation, hierarchy rules, estate service
 * rules, and property service rules. No database — pure functions and
 * repository fakes only.
 */
import { describe, expect, it } from 'vitest';
import { deriveIdentifier, identifierConfigured } from './lib/property-identifier.js';
import { validateHierarchy, type HierarchyContext } from './modules/properties/property-rules.js';
import type { PropertyOptions, AssetType } from '@silverstone/config-schema';
import { validateAddressComponents } from './modules/properties/property.service.js';
import type { PropertyConfigSnapshot } from './modules/properties/property.service.js';

// --- Helper factories -----------------------------------------------------------

function makeOptions(overrides?: Partial<PropertyOptions>): PropertyOptions {
  return {
    addressComponents: [
      {
        key: 'street_name',
        label: 'Street name',
        requiredFor: ['land', 'house'],
        notApplicableFor: [],
        maxLength: 120,
        pattern: null,
      },
      {
        key: 'plot_number',
        label: 'Plot number',
        requiredFor: ['land'],
        notApplicableFor: [
          'house.bungalow',
          'house.terrace',
          'house.duplex',
          'house.apartment',
          'house.flat',
        ],
        maxLength: 32,
        pattern: null,
      },
      {
        key: 'house_number',
        label: 'House number',
        requiredFor: ['house.bungalow', 'house.terrace', 'house.duplex'],
        notApplicableFor: ['house.apartment', 'house.flat', 'land'],
        maxLength: 32,
        pattern: null,
      },
      {
        key: 'block_name',
        label: 'Block name',
        requiredFor: ['house.apartment', 'house.flat'],
        notApplicableFor: ['house.bungalow', 'house.terrace', 'house.duplex', 'land'],
        maxLength: 64,
        pattern: null,
      },
      {
        key: 'floor_number',
        label: 'Floor number',
        requiredFor: ['house.apartment', 'house.flat'],
        notApplicableFor: ['house.bungalow', 'house.terrace', 'house.duplex', 'land'],
        maxLength: 16,
        pattern: null,
      },
      {
        key: 'unit_number',
        label: 'Unit number',
        requiredFor: ['house.apartment', 'house.flat'],
        notApplicableFor: ['house.bungalow', 'house.terrace', 'house.duplex', 'land'],
        maxLength: 32,
        pattern: null,
      },
    ],
    identifierTemplate: '{estate_slug}',
    identifierMax: 120,
    ...overrides,
  } as unknown as PropertyOptions;
}

const apartmentBlockType: AssetType = {
  key: 'apartment_block',
  label: 'Apartment block',
  detailKind: 'PROPERTY',
  requiresUnits: true,
  unitTypeKeys: ['studio', 'one_bedroom', 'two_bedroom'],
  defaultUnitTypeKey: 'two_bedroom',
  active: true,
} as unknown as AssetType;

const houseType: AssetType = {
  key: 'house',
  label: 'House',
  detailKind: 'PROPERTY',
  requiresUnits: false,
  unitTypeKeys: [],
  defaultUnitTypeKey: null,
  active: true,
} as unknown as AssetType;

function hierarchyCtx(overrides: Partial<HierarchyContext> = {}): HierarchyContext {
  return {
    parentPropertyId: 'parent-1',
    propertyId: 'child-1',
    unitTypeKey: 'two_bedroom',
    estateId: 'estate-1',
    assetTypes: [apartmentBlockType, houseType],
    propertyOptions: makeOptions() as PropertyOptions,
    parentHasChildren: false,
    parentIdentifier: 'EST-001-01',
    parentTypeKey: 'apartment_block',
    ...overrides,
  };
}

// --- Identifier derivation ------------------------------------------------------

describe('deriveIdentifier', () => {
  it('renders a complete land identifier when all required components are present', () => {
    const result = deriveIdentifier({
      estateSlug: 'silverstone',
      typeKey: 'land',
      houseTypeKey: null,
      addressComponents: { street_name: 'Main St', plot_number: '42' },
      propertyOptions: makeOptions(),
    });
    expect(result.incomplete).toBe(false);
    expect(result.identifier).toBe('silverstone-Main St-42');
    expect(result.reasons).toHaveLength(0);
  });

  it('renders a complete house identifier for bungalow/terrace/duplex', () => {
    for (const houseType of ['bungalow', 'terrace', 'duplex']) {
      const result = deriveIdentifier({
        estateSlug: 'silverstone',
        typeKey: 'house',
        houseTypeKey: houseType,
        addressComponents: { street_name: 'Oak Ave', house_number: '17' },
        propertyOptions: makeOptions(),
      });
      expect(result.incomplete).toBe(false);
      expect(result.identifier).toBe(`silverstone-Oak Ave-17`);
      expect(result.reasons).toHaveLength(0);
    }
  });

  it('renders a complete house identifier for apartment/flat', () => {
    for (const houseType of ['apartment', 'flat']) {
      const result = deriveIdentifier({
        estateSlug: 'silverstone',
        typeKey: 'house',
        houseTypeKey: houseType,
        addressComponents: {
          street_name: 'Main St',
          block_name: 'Block A',
          floor_number: '3',
          unit_number: '12',
        },
        propertyOptions: makeOptions(),
      });
      expect(result.incomplete).toBe(false);
      expect(result.identifier).toBe(`silverstone-Main St-Block A-3-12`);
      expect(result.reasons).toHaveLength(0);
    }
  });

  it('reports incomplete when a required component is missing', () => {
    const result = deriveIdentifier({
      estateSlug: 'silverstone',
      typeKey: 'land',
      houseTypeKey: null,
      addressComponents: { street_name: 'Main St' }, // plot missing
      propertyOptions: makeOptions(),
    });
    expect(result.incomplete).toBe(true);
    expect(result.identifier).toBeNull();
    expect(result.reasons.some((r) => r.includes('Plot number'))).toBe(true);
  });

  it('reports incomplete when a required component is an empty string', () => {
    const result = deriveIdentifier({
      estateSlug: 'silverstone',
      typeKey: 'land',
      houseTypeKey: null,
      addressComponents: { street_name: '', plot_number: '42' },
      propertyOptions: makeOptions(),
    });
    expect(result.incomplete).toBe(true);
    expect(result.identifier).toBeNull();
  });

  it('rejects an empty estate slug', () => {
    const result = deriveIdentifier({
      estateSlug: '',
      typeKey: 'land',
      houseTypeKey: null,
      addressComponents: { street_name: 'Main St', plot_number: '42' },
      propertyOptions: makeOptions({ identifierTemplate: '{estate_slug}' }),
    });
    expect(result.incomplete).toBe(true);
    expect(result.identifier).toBeNull();
    expect(result.reasons.some((r) => r.includes('empty'))).toBe(true);
  });

  it('rejects an identifier that exceeds the configured maximum', () => {
    const result = deriveIdentifier({
      estateSlug: 'a'.repeat(120),
      typeKey: 'land',
      houseTypeKey: null,
      addressComponents: { street_name: 'b'.repeat(60), plot_number: '42' },
      propertyOptions: makeOptions({ identifierTemplate: '{estate_slug}', identifierMax: 8 }),
    });
    expect(result.incomplete).toBe(true);
    expect(result.identifier).toBeNull();
    expect(result.reasons.some((r) => r.includes('characters'))).toBe(true);
  });

  it('preserves leading zeros in component values', () => {
    const result = deriveIdentifier({
      estateSlug: 'est',
      typeKey: 'land',
      houseTypeKey: null,
      addressComponents: { street_name: 'Main St', plot_number: '007' },
      propertyOptions: makeOptions(),
    });
    expect(result.identifier).toBe('est-Main St-007');
  });

  it('does not require a component that is notApplicableFor the asset type', () => {
    // plot_number is required for land but notApplicableFor house types, so a
    // house bungalow with no plot number still derives its identifier fine.
    const result = deriveIdentifier({
      estateSlug: 'est',
      typeKey: 'house',
      houseTypeKey: 'bungalow',
      addressComponents: { street_name: 'Oak Ave', house_number: '17' },
      propertyOptions: makeOptions(),
    });
    expect(result.incomplete).toBe(false);
    expect(result.identifier).toBe('est-Oak Ave-17');
  });

  it('does not accept a house property without a house type key', () => {
    const result = deriveIdentifier({
      estateSlug: 'est',
      typeKey: 'house',
      houseTypeKey: null,
      addressComponents: {},
      propertyOptions: makeOptions(),
    });
    expect(result.incomplete).toBe(true);
    expect(result.reasons.some((r) => r.includes('No identifier formula'))).toBe(true);
  });

  it('identifies a configured identifier when addressComponents is non-empty', () => {
    expect(identifierConfigured(makeOptions())).toBe(true);
  });

  it('does not identify a configured identifier when addressComponents is empty', () => {
    expect(identifierConfigured(makeOptions({ addressComponents: [] }) as PropertyOptions)).toBe(
      false,
    );
  });
});

describe('configured property field validation', () => {
  const config = {
    assetTypes: [],
    unitTypes: [],
    configVersion: 1,
    propertyOptions: {
      addressComponents: [
        {
          key: 'house_number',
          label: 'House number',
          requiredFor: ['house.bungalow', 'house.terrace', 'house.duplex'],
          notApplicableFor: ['house.apartment', 'house.flat', 'land'],
          maxLength: 8,
          pattern: '\\d+[A-Za-z]?',
        },
        {
          key: 'block_name',
          label: 'Block name',
          requiredFor: ['house.apartment', 'house.flat'],
          notApplicableFor: ['house.bungalow', 'house.terrace', 'house.duplex', 'land'],
          maxLength: 4,
          pattern: null,
        },
      ],
      identifierTemplate: '{estate_slug}',
      identifierMax: 120,
    },
  } as unknown as PropertyConfigSnapshot;

  it('accepts valid values and an omitted field made not applicable', () => {
    expect(() =>
      validateAddressComponents(config, 'house', 'apartment', { block_name: '0-9' }),
    ).not.toThrow();
  });

  it('rejects a missing required field and a value that fails its configured pattern', () => {
    expect(() => validateAddressComponents(config, 'house', 'bungalow', {})).toThrow(
      /House number.*required/,
    );
    expect(() =>
      validateAddressComponents(config, 'house', 'bungalow', { house_number: 'bad' }),
    ).toThrow(/required format/);
  });

  it('rejects a supplied value for a component not applicable to the house type', () => {
    expect(() =>
      validateAddressComponents(config, 'house', 'apartment', { house_number: '0-9', block_name: 'N' }),
    ).toThrow(/not applicable/);
    expect(() =>
      validateAddressComponents(config, 'house', 'apartment', {
        block_name: 'NORTH',
      }),
    ).toThrow(/4 characters/);
  });

  it('requires house_number for bungalow but not for apartment', () => {
    expect(() =>
      validateAddressComponents(config, 'house', 'bungalow', {}),
    ).toThrow(/House number.*required/);
    // house_number is notApplicableFor apartment; apartment requires block_name instead.
    expect(() =>
      validateAddressComponents(config, 'house', 'apartment', { block_name: 'N' }),
    ).not.toThrow();
  });
});

// --- Hierarchy rules -------------------------------------------------------------

describe('validateHierarchy', () => {
  it('accepts a valid child unit under an apartment block with no existing children', () => {
    const result = validateHierarchy(hierarchyCtx());
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('rejects a child without a unit type key', () => {
    const result = validateHierarchy(hierarchyCtx({ unitTypeKey: null }));
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('unit type'))).toBe(true);
  });

  it("rejects a unit type not in the parent's permitted set", () => {
    const result = validateHierarchy(hierarchyCtx({ unitTypeKey: 'penthouse' }));
    // penthouse is not in apartment_block's unitTypeKeys above
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('not permitted'))).toBe(true);
  });

  it('rejects a top-level property that carries a unit type key', () => {
    const result = validateHierarchy(
      hierarchyCtx({
        parentPropertyId: null,
        unitTypeKey: 'two_bedroom',
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('top-level'))).toBe(true);
  });

  it('accepts a top-level property with no unit type key', () => {
    const result = validateHierarchy(
      hierarchyCtx({
        parentPropertyId: null,
        unitTypeKey: null,
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a child when the parent already has children (depth-1 guard)', () => {
    const result = validateHierarchy(hierarchyCtx({ parentHasChildren: true }));
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('already has children'))).toBe(true);
  });

  it('rejects a self-referencing parent', () => {
    const result = validateHierarchy(
      hierarchyCtx({ parentPropertyId: 'child-1', propertyId: 'child-1' }),
    );
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('its own parent'))).toBe(true);
  });

  it('rejects a child under a non-unit-supporting asset type', () => {
    const result = validateHierarchy(
      hierarchyCtx({
        parentTypeKey: 'house',
        parentIdentifier: 'EST-002',
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('does not support units'))).toBe(true);
  });

  it("rejects a child when the parent's asset type is not configured", () => {
    const result = validateHierarchy(
      hierarchyCtx({
        parentTypeKey: 'unknown_type',
        parentIdentifier: 'EST-099',
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('not configured'))).toBe(true);
  });
});

// --- Estate service rules ---------------------------------------------------------

import { slugify } from './modules/estates/estate.service.js';

describe('estate service: slugify', () => {
  it('converts mixed-case names to lowercase hyphenated slug', () => {
    expect(slugify('Silver Stone Garden')).toBe('silver-stone-garden');
  });

  it('strips special characters and normalises separators to hyphens', () => {
    expect(slugify('Estate #5 (West)')).toBe('estate-5-west');
    expect(slugify('Clove_Apartments')).toBe('clove-apartments');
  });

  it('caps at 63 characters', () => {
    const longName = 'a'.repeat(100);
    expect(slugify(longName)).toHaveLength(63);
  });

  it('falls back to "estate" when the name has no valid characters', () => {
    expect(slugify('!!!')).toBe('estate');
  });
});

// --- Property repository: createInTxSkipDuplicates contract ---------------------

// These are integration-level tests; unit tests here focus on the pure logic.
// The repository method is exercised in the integration test suite.

// --- Import row validation logic (excel-parser) ---------------------------------

import { parseWorkbook, buildTemplate } from './modules/imports/excel-parser.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface TestContext {
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

function makeTestContext(overrides?: Partial<TestContext>): TestContext {
  const options = makeOptions();
  return {
    propertyOptions: {
      addressComponents:
        options.addressComponents as unknown as TestContext['propertyOptions']['addressComponents'],
      identifierTemplate: options.identifierTemplate,
      identifierMax: options.identifierMax,
    },
    ...overrides,
  };
}

async function writeTestWorkbook(rows: string[][]): Promise<string> {
  const ExcelJS = await import('exceljs');
  const dir = await mkdtemp(join(tmpdir(), 'import-test-'));
  const file = join(dir, 'test.xlsx');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Properties');
  for (const row of rows) {
    ws.addRow(row);
  }
  await wb.xlsx.writeFile(file);
  // cleanup asynchronously
  setTimeout(() => rm(dir, { recursive: true, force: true }).catch(() => {}), 0);
  return file;
}

describe('excel-parser: parseWorkbook row limit', () => {
  it('returns rowLimitExceeded=true when data rows exceed maxRows', async () => {
    const file = await writeTestWorkbook([
      ['type', 'street_name', 'plot_number'],
      ...Array.from({ length: 5001 }, (_, i) => [
        'land',
        'Main St',
        String(i + 1).padStart(3, '0'),
      ]),
    ]);

    const result = await parseWorkbook(file, {
      assetTypes: [{ key: 'land', label: 'Land', active: true, detailKind: 'LAND_PARCEL' }],
      ...makeTestContext(),
      estateSlug: 'est',
      estateId: 'est-1',
      existingIdentifiers: new Set(),
      renderIdentifier: () => ({ identifier: 'x', incomplete: false, reasons: [] }),
      maxRows: 5000,
    });
    expect(result.rowLimitExceeded).toBe(true);
    expect(result.dataRowTotal).toBe(5001);
  });

  it('returns rowLimitExceeded=false when data rows are within the limit', async () => {
    const file = await writeTestWorkbook([
      ['type', 'street_name', 'plot_number'],
      ['land', 'Oak Ave', '17'],
      ['land', 'Pine Rd', '42'],
    ]);

    const result = await parseWorkbook(file, {
      assetTypes: [{ key: 'land', label: 'Land', active: true, detailKind: 'LAND_PARCEL' }],
      ...makeTestContext(),
      estateSlug: 'est',
      estateId: 'est-1',
      existingIdentifiers: new Set(),
      renderIdentifier: () => ({ identifier: 'x', incomplete: false, reasons: [] }),
      maxRows: 5000,
    });
    expect(result.rowLimitExceeded).toBe(false);
    expect(result.dataRowTotal).toBe(2);
  });

  it('detects in-file duplicates', async () => {
    const file = await writeTestWorkbook([
      ['type', 'street_name', 'plot_number'],
      ['land', 'Oak Ave', '17'],
      ['land', 'Oak Ave', '17'], // duplicate
    ]);

    const result = await parseWorkbook(file, {
      assetTypes: [{ key: 'land', label: 'Land', active: true, detailKind: 'LAND_PARCEL' }],
      ...makeTestContext(),
      estateSlug: 'est',
      estateId: 'est-1',
      existingIdentifiers: new Set(),
      renderIdentifier: () => ({ identifier: 'est-001-01', incomplete: false, reasons: [] }),
      maxRows: 5000,
    });
    expect(result.rows[0]?.status).toBe('VALID');
    expect(result.rows[1]?.status).toBe('DUPLICATE_IN_FILE');
  });

  it('detects collision with an existing identifier', async () => {
    const file = await writeTestWorkbook([
      ['type', 'street_name', 'plot_number'],
      ['land', 'Oak Ave', '17'],
    ]);

    const result = await parseWorkbook(file, {
      assetTypes: [{ key: 'land', label: 'Land', active: true, detailKind: 'LAND_PARCEL' }],
      ...makeTestContext(),
      estateSlug: 'est',
      estateId: 'est-1',
      existingIdentifiers: new Set(['est-001-01']),
      renderIdentifier: () => ({ identifier: 'est-001-01', incomplete: false, reasons: [] }),
      maxRows: 5000,
    });
    expect(result.rows[0]?.status).toBe('COLLISION');
  });

  it('reports physical worksheet row numbers and skips blank rows without renumbering', async () => {
    const file = await writeTestWorkbook([
      ['type', 'street_name', 'plot_number'],
      ['land', 'Oak Ave', '17'],
      [], // a physically blank worksheet row
      ['land', 'Pine Rd', '42'],
    ]);

    const result = await parseWorkbook(file, {
      assetTypes: [{ key: 'land', label: 'Land', active: true, detailKind: 'LAND_PARCEL' }],
      ...makeTestContext(),
      estateSlug: 'est',
      estateId: 'est-1',
      existingIdentifiers: new Set(),
      renderIdentifier: () => ({ identifier: 'x', incomplete: false, reasons: [] }),
      maxRows: 5000,
    });

    // Row 1 is the header, the blank row 3 is skipped, and the row after it
    // keeps its own physical number: rows are never renumbered.
    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(result.dataRowTotal).toBe(2);
  });
});

describe('excel-parser: buildTemplate', () => {
  it('builds a template with the expected columns', () => {
    const result = buildTemplate(
      { id: 'est-1', slug: 'est', name: 'Test Estate' },
      [{ key: 'land', label: 'Land', active: true, detailKind: 'LAND_PARCEL' }],
      makeTestContext().propertyOptions,
      'One property per row.',
    );
    expect(result.columns).toEqual([
      'type',
      'street_name',
      'plot_number',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
    ]);
    expect(result.buffer).toBeDefined();
  });

  it('produces a header-only first worksheet and keeps the guidance on the Instructions sheet', async () => {
    const result = buildTemplate(
      { id: 'est-1', slug: 'est', name: 'Test Estate' },
      [{ key: 'land', label: 'Land', active: true, detailKind: 'LAND_PARCEL' }],
      makeTestContext().propertyOptions,
      'One property per row.',
    );

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await result.buffer) as unknown as Buffer);

    const sheet = workbook.worksheets[0];
    expect(sheet?.name).toBe('Properties');
    // Row 1 holds the headers and nothing follows it: the template carries no
    // importable sample row, so re-uploading it unchanged imports nothing.
    expect(sheet?.actualRowCount).toBe(1);
    const headers = (sheet?.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual([
      'type',
      'street_name',
      'plot_number',
      'house_number',
      'block_name',
      'floor_number',
      'unit_number',
    ]);
    // The sample-row guidance lives on the second sheet, never as data.
    expect(workbook.worksheets[1]?.name).toBe('Instructions');
  });
});
