import type { PropertyOptions } from '@silverstone/config-schema';
import type { AddressComponents } from '@silverstone/shared';

/**
 * Central property-identifier derivation.
 *
 * A single, deterministic formatter is used by the manual property form and by
 * the Excel import validator so the two paths can never disagree. The identifier
 * is rendered from the configured `identifierTemplate` plus the property's
 * address-component values and the estate slug. It is computed once at create
 * time and stored as the canonical text; it is never re-derived or silently
 * rewritten after creation.
 *
 * No Silverstone convention is assumed. With no address components configured
 * the default template `{estate_slug}` renders the estate slug for every
 * property in that estate, so the *second* property collides with the first —
 * the intended safety behaviour until an admin configures a uniquely-deriving
 * template.
 */

export interface IdentifierInput {
  estateSlug: string;
  typeKey: string;
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

/**
 * Renders the identifier for a property.
 *
 * - If a required component (for the asset type) is missing/empty, the
 *   identifier is `incomplete` and no identifier is produced.
 * - If the rendered string is empty or contains only separators, it is rejected.
 * - Leading zeros in component values are preserved (values are strings, never
 *   coerced to numbers).
 */
export function deriveIdentifier(input: IdentifierInput): IdentifierResult {
  const { estateSlug, typeKey, addressComponents, propertyOptions } = input;
  const components = propertyOptions.addressComponents;

  // Determine which components are required for this asset type.
  const requiredKeys = new Set<string>();
  for (const component of components) {
    const inRequiredFor =
      component.requiredFor.length > 0 && component.requiredFor.includes(typeKey);
    const appliesToAll = component.requiredFor.length === 0;
    const notApplicable = component.notApplicableFor.includes(typeKey);
    if (notApplicable) continue;
    // A component is required when it applies to all types (empty requiredFor)
    // or when it explicitly names this type.
    if (inRequiredFor || appliesToAll) {
      requiredKeys.add(component.key);
    }
  }

  // Validate the required components are present and non-empty.
  const missing: string[] = [];
  for (const key of requiredKeys) {
    const value = addressComponents[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      const component = components.find((c) => c.key === key);
      missing.push(`${component?.label ?? key}`);
    }
  }

  // Render the template.
  const template = propertyOptions.identifierTemplate;
  const reasons: string[] = [];

  // If any required component is missing, the identifier is incomplete.
  if (missing.length > 0) {
    reasons.push(
      `Missing required address component${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    );
    return { identifier: null, incomplete: true, reasons };
  }

  const rendered = template.replace(/\{([a-z][a-z0-9_]{0,47})\}/gi, (_whole, token: string) => {
    if (token === 'estate_slug') return estateSlug;
    const value = addressComponents[token];
    return value === undefined || value === null ? '' : String(value);
  });

  const trimmed = rendered.trim();
  if (trimmed.length === 0) {
    reasons.push('The identifier renders to an empty value');
    return { identifier: null, incomplete: true, reasons };
  }

  // Collapse runs of separators produced by empty optional components
  // (e.g. "estate--block" becomes "estate-block") so the identifier is clean.
  const collapsed = collapsedSeparators(trimmed);
  if (collapsed.length === 0) {
    reasons.push('The identifier renders to an empty value');
    return { identifier: null, incomplete: true, reasons };
  }

  if (collapsed.length > propertyOptions.identifierMax) {
    reasons.push(
      `The identifier is ${collapsed.length} characters; the configured maximum is ${propertyOptions.identifierMax}`,
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
 * Whether the configured template can produce a *complete, unique* identifier
 * at all for a given estate. With no address components configured the
 * default template renders the estate slug for every property, so only one
 * property can ever exist — creation is effectively unavailable for a second
 * property. This helper is used to gate the UI and to surface a clear message
 * on the property-options endpoint.
 */
export function identifierConfigured(propertyOptions: PropertyOptions): boolean {
  // A template with at least one address-component placeholder can distinguish
  // properties within an estate. The bare `{estate_slug}` default cannot.
  return propertyOptions.addressComponents.length > 0;
}
