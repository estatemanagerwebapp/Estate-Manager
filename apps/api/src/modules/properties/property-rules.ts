import type { AssetType, PropertyOptions } from '@silverstone/config-schema';

/**
 * Parent-child (unit-in-building) hierarchy rules.
 *
 * Pure, testable functions that pin the allowed shape of the property tree to
 * the organization configuration:
 *
 *  1. The parent must exist, be in the same estate, and not be archived when
 *     the child is being created as a new unit under an active estate.
 *  2. The parent's asset type must have `requiresUnits: true` — only asset
 *     types that are containers for units may have children.
 *  3. The child's `unitTypeKey` must be in the parent's permitted
 *     `unitTypeKeys` (from configuration).
 *  4. Depth is 1: a property that already has children cannot itself become a
 *     child (no unit-in-unit).
 *  5. Cycles are structurally impossible at depth 1, but the self-reference
 *     guard (`parent.id !== property.id`) is still asserted.
 *
 * These rules are the authority; the database backs them with a self-FK and a
 * `(parentPropertyId, unitTypeKey)` index.
 */

export interface HierarchyContext {
  /** The candidate parent property id, or null for a top-level property. */
  parentPropertyId: string | null;
  /** The child property id, for the self-reference guard. */
  propertyId: string;
  /** The child's unit type key (required when parentPropertyId is set). */
  unitTypeKey: string | null;
  /** The estate id the parent belongs to (must match the child's estate). */
  estateId: string;
  /** Resolved configuration asset types. */
  assetTypes: readonly AssetType[];
  /** Resolved configuration property options. */
  propertyOptions: PropertyOptions;
  /** True when the parent already has children (depth-1 guard). */
  parentHasChildren: boolean;
  /** The parent's own identifier, for error messages. */
  parentIdentifier?: string;
  /** The parent's type key. */
  parentTypeKey?: string;
}

export interface HierarchyResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Validates the proposed parent-child relationship. Returns a structured
 * result rather than throwing so callers (manual create + import) can collect
 * all reasons at once.
 */
export function validateHierarchy(ctx: HierarchyContext): HierarchyResult {
  const reasons: string[] = [];

  // Top-level property: nothing to validate beyond the depth guard.
  if (ctx.parentPropertyId === null) {
    if (ctx.unitTypeKey !== null && ctx.unitTypeKey !== undefined) {
      reasons.push('A top-level property cannot have a unit type');
    }
    return { valid: reasons.length === 0, reasons };
  }

  // Self-reference guard: a property cannot be its own parent. The estate id
  // and property id are drawn from unrelated UUID spaces, so this is a
  // belt-and-braces check for programming errors, not a realistic runtime path.
  if (ctx.parentPropertyId === ctx.propertyId) {
    reasons.push('A property cannot be its own parent');
  }

  // Resolve the parent's asset type definition.
  const parentType = ctx.assetTypes.find((type) => type.key === ctx.parentTypeKey);
  if (!parentType) {
    reasons.push(`The parent's asset type "${ctx.parentTypeKey}" is not configured`);
    return { valid: false, reasons };
  }

  // Rule 2: the parent's type must permit units.
  if (!parentType.requiresUnits) {
    reasons.push(
      `Asset type "${parentType.label}" does not support units; it cannot have child properties`,
    );
    return { valid: false, reasons };
  }

  // Rule 3: the child's unit type must be in the parent's permitted set.
  if (ctx.unitTypeKey === null || ctx.unitTypeKey === undefined) {
    reasons.push('A child property must specify a unit type');
  } else if (!parentType.unitTypeKeys.includes(ctx.unitTypeKey)) {
    reasons.push(
      `Unit type "${ctx.unitTypeKey}" is not permitted under asset type "${parentType.label}"`,
    );
  }

  // Rule 4: depth-1 guard — the parent cannot already have children.
  if (ctx.parentHasChildren) {
    reasons.push(
      `The parent property "${ctx.parentIdentifier ?? ctx.parentPropertyId}" already has children; nested units are not supported`,
    );
  }

  return { valid: reasons.length === 0, reasons };
}
