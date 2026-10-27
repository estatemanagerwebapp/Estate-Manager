import type { PropertyOptionsView, AuditEventDto } from '@silverstone/shared';
import { api, ApiRequestError } from './client';
import { useApiQuery } from './query';

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
  const { data, loading, error } = useApiQuery(
    ['property-options'],
    () => api.getPropertyOptions(),
    'Could not load property options.',
    enabled,
  );

  return {
    view: data as PropertyOptionsView | null,
    loading,
    error,
  };
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

/**
 * The dashboard KPI aggregate. `null` counters mean "hidden to this role"
 * (the role lacks the read permission), not "zero".
 */
export interface DashboardKpis {
  estates: number | null;
  activeProperties: number | null;
  totalProperties: number | null;
  users: number | null;
  residentDrafts: number | null;
  auditEventsLast30Days: number | null;
}

/**
 * Loads the operator dashboard in one pass: the KPI aggregate plus the most
 * recent audit events. The KPI and activity requests are independent, so they
 * fire in parallel and settle on their own — a 403 on `/activity` (role lacks
 * `audit.read`) must not take the KPI row down with it.
 *
 * The hook is intentionally self-contained so the dashboard page stays dumb
 * (the `useSystemHealth` pattern).
 */
export function useDashboard(enabled: boolean) {
  const kpisQuery = useApiQuery(
    ['dashboard', 'kpis'],
    () => api.getDashboardKpis(),
    'Could not load dashboard statistics.',
    enabled,
  );
  const activityQuery = useApiQuery(
    ['dashboard', 'activity', 5],
    () => api.getDashboardActivity(5),
    'Could not load recent activity.',
    enabled,
  );

  // A 403 means the role lacks `audit.read`: hide the feed, not the page.
  const activityDenied =
    activityQuery.errorObject instanceof ApiRequestError &&
    activityQuery.errorObject.status === 403;

  const error = kpisQuery.error ?? (activityDenied ? null : activityQuery.error);
  const loading = enabled && (kpisQuery.loading || activityQuery.loading);
  const activity: AuditEventDto[] | null = activityDenied
    ? null
    : (activityQuery.data?.events ?? null);

  return {
    kpis: (kpisQuery.data?.kpis ?? null) as DashboardKpis | null,
    activity,
    activityDenied,
    loading,
    error,
  };
}
