import type { QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import { useApiQuery } from './query';

/**
 * @deprecated The sidebar is driven by `/sync` now. Kept as a compatibility
 * shim: it refreshes the sync snapshot so an action still bumps the badges
 * immediately instead of waiting for the next poll.
 */
export function useNavigationCounts() {
  return useApiQuery(
    queryKeys.navigation.counts,
    () => api.getNavigationCounts(),
    'Could not load menu counters.',
    false,
  );
}

/**
 * Immediately refresh badges after an action that changes a queue (marking a
 * conversation read, resolving a complaint, confirming a booking). Invalidate
 * the sync query, not the legacy counts endpoint.
 */
export function invalidateNavigationCounts(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.sync.snapshot });
}
