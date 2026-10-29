import type {
  HouseTypesResponse,
  AuditEventDto,
  DashboardAttentionItemDto,
  DashboardKpisDto,
} from '@silverstone/shared';
import { api, ApiRequestError } from './client';
import { useApiQuery } from './query';
import { queryKeys } from './query-keys';

/**
 * Loads the active house-type catalogue. This is a real domain table, so the
 * form and the import template read the same source.
 */
export function useHouseTypes(enabled: boolean) {
  const { data, loading, error } = useApiQuery(
    queryKeys.houseTypes,
    () => api.getHouseTypes(),
    'Could not load house types.',
    enabled,
  );

  return {
    view: data as HouseTypesResponse | null,
    loading,
    error,
  };
}

/**
 * The dashboard KPI aggregate. `null` counters mean "hidden to this role"
 * (the role lacks the read permission, or the module is disabled), not
 * "zero".
 */
export type DashboardKpis = DashboardKpisDto;

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
    queryKeys.dashboard.kpis,
    () => api.getDashboardKpis(),
    'Could not load dashboard statistics.',
    enabled,
  );
  const activityQuery = useApiQuery(
    queryKeys.dashboard.activity(5),
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
    attention: (kpisQuery.data?.attention ?? null) as DashboardAttentionItemDto[] | null,
    activity,
    activityDenied,
    loading,
    error,
  };
}
