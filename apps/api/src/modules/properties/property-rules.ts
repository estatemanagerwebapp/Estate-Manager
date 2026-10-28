import type { PropertyKind } from '@silverstone/shared';
import type { HouseTypeRecord } from './house-type-repository.js';

/**
 * Property address-shape rules.
 *
 * The rules are pure and shared by the manual create/update path and the Excel
 * import parser. There is no runtime configuration: the kind is one of HOUSE,
 * LAND or BOTH, and the selected house type decides whether a house uses a
 * house number or block/floor/unit fields.
 */

export interface PropertyAddressFields {
  streetName?: string | null;
  houseNumber?: string | null;
  blockName?: string | null;
  floorNumber?: string | null;
  unitNumber?: string | null;
  plotNumber?: string | null;
  plotName?: string | null;
}

export interface PropertyFieldInput extends PropertyAddressFields {
  kind: PropertyKind;
  /** The resolved house-type row; null for LAND. */
  houseType: HouseTypeRecord | null;
}

export interface PropertyFieldValidation {
  valid: boolean;
  reasons: string[];
  /** First error per API field, for structured 400 responses. */
  fieldErrors: Record<string, string>;
}

const MAX_LENGTHS = {
  streetName: 120,
  houseNumber: 32,
  blockName: 64,
  floorNumber: 16,
  unitNumber: 32,
  plotNumber: 32,
  plotName: 64,
} as const;

const LABELS = {
  streetName: 'Street name',
  houseNumber: 'House number',
  blockName: 'Block name',
  floorNumber: 'Floor number',
  unitNumber: 'Unit number',
  plotNumber: 'Plot number',
  plotName: 'Plot name',
} as const;

/** Trim every address value and turn blank strings into null. */
export function normalizeAddressFields(fields: PropertyAddressFields): PropertyAddressFields {
  return {
    streetName: clean(fields.streetName) ?? '',
    houseNumber: clean(fields.houseNumber),
    blockName: clean(fields.blockName),
    floorNumber: clean(fields.floorNumber),
    unitNumber: clean(fields.unitNumber),
    plotNumber: clean(fields.plotNumber),
    plotName: clean(fields.plotName),
  };
}

/**
 * Validate the address shape for the selected kind and house type.
 * Call `normalizeAddressFields` first so blank values are null.
 */
export function validatePropertyFields(input: PropertyFieldInput): PropertyFieldValidation {
  const reasons: string[] = [];
  const fieldErrors: Record<string, string> = {};
  const add = (field: string, message: string): void => {
    reasons.push(message);
    if (!fieldErrors[field]) fieldErrors[field] = message;
  };

  if (!['HOUSE', 'LAND', 'BOTH'].includes(input.kind)) {
    add('kind', 'Property type must be House, Land, or Both');
    return { valid: false, reasons, fieldErrors };
  }

  checkLength(input, 'streetName', add);
  if (!input.streetName || input.streetName.length === 0) {
    add('streetName', 'Street name is required');
  }

  if (input.kind === 'LAND') {
    if (input.houseType) add('houseType', 'House type does not apply to land properties');
    reject(input.houseNumber, 'houseNumber', 'House number', add);
    reject(input.blockName, 'blockName', 'Block name', add);
    reject(input.floorNumber, 'floorNumber', 'Floor number', add);
    reject(input.unitNumber, 'unitNumber', 'Unit number', add);
    require(input.plotNumber, 'plotNumber', 'Plot number', add);
    require(input.plotName, 'plotName', 'Plot name', add);
    checkLength(input, 'plotNumber', add);
    checkLength(input, 'plotName', add);
    return { valid: reasons.length === 0, reasons, fieldErrors };
  }

  // HOUSE and BOTH
  if (!input.houseType) {
    add('houseType', 'Select a house type');
  } else if (input.houseType.requiresUnitFields) {
    reject(input.houseNumber, 'houseNumber', 'House number', add);
    require(input.blockName, 'blockName', 'Block name', add);
    require(input.floorNumber, 'floorNumber', 'Floor number', add);
    require(input.unitNumber, 'unitNumber', 'Unit number', add);
    checkLength(input, 'blockName', add);
    checkLength(input, 'floorNumber', add);
    checkLength(input, 'unitNumber', add);
  } else {
    reject(input.blockName, 'blockName', 'Block name', add);
    reject(input.floorNumber, 'floorNumber', 'Floor number', add);
    reject(input.unitNumber, 'unitNumber', 'Unit number', add);
    require(input.houseNumber, 'houseNumber', 'House number', add);
    checkLength(input, 'houseNumber', add);
  }

  if (input.kind === 'BOTH') {
    require(input.plotNumber, 'plotNumber', 'Plot number', add);
    require(input.plotName, 'plotName', 'Plot name', add);
    checkLength(input, 'plotNumber', add);
    checkLength(input, 'plotName', add);
  } else {
    reject(input.plotNumber, 'plotNumber', 'Plot number', add);
    reject(input.plotName, 'plotName', 'Plot name', add);
  }

  return { valid: reasons.length === 0, reasons, fieldErrors };
}

function require(
  value: string | null | undefined,
  field: string,
  label: string,
  add: (field: string, message: string) => void,
): void {
  if (!value) add(field, `${label} is required`);
}

function reject(
  value: string | null | undefined,
  field: string,
  label: string,
  add: (field: string, message: string) => void,
): void {
  if (value) add(field, `${label} does not apply to this property type`);
}

function checkLength(
  input: PropertyAddressFields,
  field: keyof typeof MAX_LENGTHS,
  add: (field: string, message: string) => void,
): void {
  const value = input[field];
  const max = MAX_LENGTHS[field];
  if (value && value.length > max) {
    add(field, `${LABELS[field]} must be ${max} characters or fewer`);
  }
}

function clean(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}
