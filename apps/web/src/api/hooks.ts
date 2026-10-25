import { useEffect, useState } from 'react';
import type { PropertyOptionsView } from '@silverstone/shared';
import { api, ApiRequestError } from './client';

/**
 * Shared hooks that fetch the organisation's property-options view.
 *
 * The options view carries the `configVersion` that the property-options
 * screen relies on for optimistic-concurrency checks, plus the address
 * components and type catalogues the register forms render.
 */

/**
 * Loads the property-options view. The request goes through the shared API
 * client so it inherits the envelope unwrapping, the structured
 * `ApiRequestError` shape and the global 401 → clear-session handling.
 */
export function usePropertyOptions(enabled: boolean) {
  const [view, setView] = useState<PropertyOptionsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getPropertyOptions()
      .then((data) => {
        if (!cancelled) setView(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError ? err.message : 'Could not load property options.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { view, loading, error };
}

/**
 * The asset types that can be assigned to a new top-level property.
 *
 * The API's `assertConfiguredTypeKey` accepts any *active* asset type —
 * including `LAND_PARCEL` kinds — so the client mirrors exactly that rule
 * and does not narrow the list by `detailKind`. The unit-type catalogue is
 * a separate list and is not registerable as a top-level property.
 */
export function registerableAssetTypes(view: PropertyOptionsView | null): Array<{
  key: string;
  label: string;
}> {
  if (!view) return [];
  return view.assetTypes
    .filter((type) => type.active)
    .map((type) => ({ key: type.key, label: type.label }));
}
