import type { PropertyKind } from '@silverstone/shared';

/**
 * Central property-identifier derivation.
 *
 * A single deterministic formatter is used by the manual property form and by
 * the Excel import validator so the two paths can never disagree. The
 * identifier is computed once at create time and stored as canonical text; it
 * is never re-derived or silently rewritten after creation.
 *
 * The formulas are explicit per property kind (there is no configurable
 * template and no "identifier not configured" state):
 *   - LAND   → {estate_slug}-{street_name}-{plot_number}
 *   - HOUSE  → {estate_slug}-{street_name}-{house_number}            (house)
 *              {estate_slug}-{street_name}-{block}-{floor}-{unit}     (unit)
 *   - BOTH   → the HOUSE formula followed by {plot_number}
 *
 * `requiresUnitFields` comes from the house-type row, not from JSON config.
 */

export interface IdentifierHouseType {
  key: string;
  requiresUnitFields: boolean;
}

export interface IdentifierInput {
  estateSlug: string;
  kind: PropertyKind;
  /** Required for HOUSE/BOTH; null for LAND. */
  houseType: IdentifierHouseType | null;
  streetName: string;
  houseNumber?: string | null;
  blockName?: string | null;
  floorNumber?: string | null;
  unitNumber?: string | null;
  plotNumber?: string | null;
}

export interface IdentifierResult {
  identifier: string | null;
  /**
   * True when the formula cannot produce a complete, non-empty identifier for
   * this property kind (a required field is missing).
   */
  incomplete: boolean;
  /** Human-readable reasons, for error messages and preview display. */
  reasons: string[];
}

/** Maximum identifier length approved for the registry (matches the DB column). */
export const IDENTIFIER_MAX = 200;

const SEPARATOR = '-';

/**
 * Renders the identifier for a property.
 *
 * - The token set is fixed per kind and house type.
 * - Missing/empty required values make the result incomplete; no identifier is
 *   produced.
 * - Repeated separators from empty optional slots are collapsed.
 * - Leading zeros are preserved (values are strings, never coerced to numbers).
 */
export function deriveIdentifier(input: IdentifierInput): IdentifierResult {
  const reasons: string[] = [];
  const estateSlug = clean(input.estateSlug);
  if (!estateSlug) {
    reasons.push('The estate slug is empty');
    return { identifier: null, incomplete: true, reasons };
  }

  const tokens: Array<{ key: string; label: string; value: string | null | undefined }> = [
    { key: 'estate_slug', label: 'Estate', value: estateSlug },
    { key: 'street_name', label: 'Street name', value: input.streetName },
  ];

  if (input.kind === 'HOUSE' || input.kind === 'BOTH') {
    if (!input.houseType) {
      reasons.push('A house type is required for house properties');
      return { identifier: null, incomplete: true, reasons };
    }

    if (input.houseType.requiresUnitFields) {
      tokens.push(
        { key: 'block_name', label: 'Block name', value: input.blockName },
        { key: 'floor_number', label: 'Floor number', value: input.floorNumber },
        { key: 'unit_number', label: 'Unit number', value: input.unitNumber },
      );
    } else {
      tokens.push({ key: 'house_number', label: 'House number', value: input.houseNumber });
    }
  }

  if (input.kind === 'LAND' || input.kind === 'BOTH') {
    tokens.push({ key: 'plot_number', label: 'Plot number', value: input.plotNumber });
  }

  const missing = tokens
    .filter((token) => clean(token.value).length === 0)
    .map((token) => token.label);
  if (missing.length > 0) {
    reasons.push(
      `Missing required address field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    );
    return { identifier: null, incomplete: true, reasons };
  }

  const rendered = tokens.map((token) => clean(token.value)).join(SEPARATOR);
  const collapsed = collapsedSeparators(rendered);
  if (collapsed.length === 0) {
    reasons.push('The identifier renders to an empty value');
    return { identifier: null, incomplete: true, reasons };
  }
  if (collapsed.length > IDENTIFIER_MAX) {
    reasons.push(
      `The identifier is ${collapsed.length} characters; the maximum is ${IDENTIFIER_MAX}`,
    );
    return { identifier: null, incomplete: true, reasons };
  }

  return { identifier: collapsed, incomplete: false, reasons: [] };
}

/** Collapse runs of the common identifier separators produced by empty slots. */
function collapsedSeparators(value: string): string {
  return value.replace(/([-./_])\1+/g, '$1').replace(/^\s+|\s+$/g, '');
}

function clean(value: string | null | undefined): string {
  return value === undefined || value === null ? '' : String(value).trim();
}
