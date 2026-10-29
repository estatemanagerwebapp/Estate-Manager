import type { QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import { useApiQuery } from './query';

/** How often a visible operator tab refreshes the sidebar badges. */
export const NAV_COUNTS_REFRESH_MS = 30_000;

/**
 * One request for every sidebar badge. Keeping this separate from the
 * dashboard summary means navigating the console does not pull the heavier
 * KPI aggregates on every screen.
 */
export function useNavigationCounts() {
  return useApiQuery(
    queryKeys.navigation.counts,
    () => api.getNavigationCounts(),
    'Could not load menu counters.',
    true,
    { refetchInterval: NAV_COUNTS_REFRESH_MS },
  );
}

/**
 * Immediately refresh the sidebar after an action that changes a queue
 * (marking a conversation read, resolving a complaint, confirming a booking).
 */
export function invalidateNavigationCounts(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.navigation.counts });
}
