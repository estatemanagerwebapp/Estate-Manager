import { useEffect, useState } from 'react';
import type { PropertyOptionsView, AuditEventDto } from '@silverstone/shared';
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
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [activity, setActivity] = useState<AuditEventDto[] | null>(null);
  const [activityDenied, setActivityDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      const [kpiResult, activityResult] = await Promise.allSettled([
        api.getDashboardKpis(),
        api.getDashboardActivity(5),
      ]);

      if (cancelled) return;

      if (kpiResult.status === 'fulfilled') {
        setKpis(kpiResult.value.kpis);
      } else {
        setError(
          kpiResult.reason instanceof ApiRequestError
            ? kpiResult.reason.message
            : 'Could not load dashboard statistics.',
        );
      }

      if (activityResult.status === 'fulfilled') {
        setActivity(activityResult.value.events);
        setActivityDenied(false);
      } else if (activityResult.reason instanceof ApiRequestError) {
        // 403 means the role lacks `audit.read`: hide the feed, not the page.
        setActivityDenied(activityResult.reason.status === 403);
        setActivity(null);
      } else {
        setError('Could not load recent activity.');
        setActivity(null);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { kpis, activity, activityDenied, loading, error };
}
