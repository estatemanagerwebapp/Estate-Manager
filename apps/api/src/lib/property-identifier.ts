import type { PropertyOptions } from '@silverstone/config-schema';
import type { AddressComponents } from '@silverstone/shared';

/**
 * Central property-identifier derivation.
 *
 * A single, deterministic formatter is used by the manual property form and by
 * the Excel import validator so the two paths can never disagree. The identifier
 * is computed once at create time and stored as the canonical text; it is never
 * re-derived or silently rewritten after creation.
 *
 * Identifier formulas are **code-defaulted per type** (not configured through
 * the `identifierTemplate` field). The config's `identifierTemplate` /
 * `identifierMax` are kept for backward compatibility and display only:
 *   - land          → `{estate_slug}-{street_name}-{plot_number}`
 *   - house (bungalow/terrace/duplex) → `{estate_slug}-{street_name}-{house_number}`
 *   - house (apartment/flat) → `{estate_slug}-{block_name}-{floor}-{unit_number}`
 *
 * The required address components for a type are resolved from the configured
 * `addressComponents` block (keys are `street_name`, `plot_number`,
 * `house_number`, `block_name`, `floor_number`, `unit_number`; labels are
 * human-facing). With no address components configured the formula cannot
 * produce a complete identifier — that is the intended safety behaviour.
 */

export interface IdentifierInput {
  estateSlug: string;
  typeKey: string;
  /** For house properties: the nested house type key. Null for land. */
  houseTypeKey: string | null;
  addressComponents: AddressComponents;
  propertyOptions: PropertyOptions;
}

export interface IdentifierResult {
  identifier: string | null;
  /**
   * True when the template cannot currently produce a complete, non-empty
   * identifier for this asset type (a required component is missing).
   */
  incomplete: boolean;
  /** Human-readable reasons, for error messages and preview display. */
  reasons: string[];
}

/** Per-type identifier formula: the token keys each type fills in order. */
const FORMULAS: Record<string, string[]> = {
  land: ['estate_slug', 'street_name', 'plot_number'],
  'house.bungalow': ['estate_slug', 'street_name', 'house_number'],
  'house.terrace': ['estate_slug', 'street_name', 'house_number'],
  'house.duplex': ['estate_slug', 'street_name', 'house_number'],
  'house.apartment': ['estate_slug', 'street_name', 'block_name', 'floor_number', 'unit_number'],
  'house.flat': ['estate_slug', 'street_name', 'block_name', 'floor_number', 'unit_number'],
};

const SEPARATOR = '-';

/**
 * Renders the identifier for a property.
 *
 * - The token set is fixed per `(typeKey, houseTypeKey)`; unknown/missing
 *   component values are treated as missing required data.
 * - If a required component is missing/empty, the identifier is `incomplete`
 *   and no identifier is produced.
 * - If the rendered string is empty or contains only separators, it is rejected.
 * - Leading zeros in component values are preserved (values are strings, never
 *   coerced to numbers).
 */
export function deriveIdentifier(input: IdentifierInput): IdentifierResult {
  const { estateSlug, typeKey, houseTypeKey, addressComponents, propertyOptions } = input;
  const houseType = houseTypeKey ? `${typeKey}.${houseTypeKey}` : typeKey;
  const reasons: string[] = [];

  // An identifier can never be complete without an estate slug — it is the
  // leading token of every per-type formula.
  if (!estateSlug || String(estateSlug).trim() === '') {
    reasons.push('The estate slug is empty');
    return { identifier: null, incomplete: true, reasons };
  }

  const tokens = FORMULAS[houseType];

  if (!tokens) {
    reasons.push(`No identifier formula configured for property type "${houseType}"`);
    return { identifier: null, incomplete: true, reasons };
  }

  // Resolve which components this type requires, from config. A component is
  // required when it names this top-level type or the nested house type in
  // requiredFor (or applies to all, via empty requiredFor), and is not in
  // notApplicableFor for either.
  const components = propertyOptions.addressComponents;
  const requiredKeys = new Set<string>();
  for (const component of components) {
    const notApplicable =
      component.notApplicableFor.includes(typeKey) ||
      (houseTypeKey && component.notApplicableFor.includes(houseType));
    if (notApplicable) continue;
    const appliesToAll = component.requiredFor.length === 0;
    const explicitlyRequired =
      component.requiredFor.includes(typeKey) ||
      (houseTypeKey && component.requiredFor.includes(houseType));
    if (appliesToAll || explicitlyRequired) {
      requiredKeys.add(component.key);
    }
  }

  // Every token in the formula must have a non-empty value.
  const missing: string[] = [];
  for (const token of tokens) {
    if (token === 'estate_slug') continue; // always supplied by the caller
    const value = addressComponents[token];
    if (value === undefined || value === null || String(value).trim() === '') {
      const component = components.find((c) => c.key === token);
      missing.push(`${component?.label ?? token}`);
    }
  }

  // Also enforce any config-declared required components not already covered
  // by the formula (defensive — formula and config stay in step by design).
  for (const key of requiredKeys) {
    if (tokens.includes(key) || key === 'estate_slug') continue;
    const value = addressComponents[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      const component = components.find((c) => c.key === key);
      missing.push(`${component?.label ?? key}`);
    }
  }

  if (missing.length > 0) {
    reasons.push(
      `Missing required address component${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    );
    return { identifier: null, incomplete: true, reasons };
  }

  const rendered = tokens
    .map((token) => {
      if (token === 'estate_slug') return estateSlug;
      const value = addressComponents[token];
      return value === undefined || value === null ? '' : String(value);
    })
    .join(SEPARATOR);

  const trimmed = rendered.trim();
  if (trimmed.length === 0) {
    reasons.push('The identifier renders to an empty value');
    return { identifier: null, incomplete: true, reasons };
  }

  const collapsed = collapsedSeparators(trimmed);
  if (collapsed.length === 0) {
    reasons.push('The identifier renders to an empty value');
    return { identifier: null, incomplete: true, reasons };
  }

  const maxLength = propertyOptions.identifierMax ?? 120;
  if (collapsed.length > maxLength) {
    reasons.push(
      `The identifier is ${collapsed.length} characters; the configured maximum is ${maxLength}`,
    );
    return { identifier: null, incomplete: true, reasons };
  }

  return { identifier: collapsed, incomplete: false, reasons: [] };
}

/** Collapse runs of the common identifier separators produced by empty slots. */
function collapsedSeparators(value: string): string {
  // Collapse repeated -, /, ., _, or space runs into a single separator.
  return value.replace(/([-./_])\1+/g, '$1').replace(/^\s+|\s+$/g, '');
}

/**
 * Whether the configured formula can produce a *complete, unique* identifier
 * at all for a given estate. The per-type formulas always require at least one
 * address component, so this is true whenever address components are configured.
 */
export function identifierConfigured(propertyOptions: PropertyOptions): boolean {
  return propertyOptions.addressComponents.length > 0;
}
