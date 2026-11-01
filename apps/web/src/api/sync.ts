import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SyncDomain, SyncSnapshotDto } from '@silverstone/shared';
import { api } from './client';
import { useApiQuery } from './query';
import { queryKeys } from './query-keys';

/**
 * How often a visible tab asks for changes. TanStack pauses the interval while
 * the tab is hidden, so a background tab costs nothing and a returning tab
 * refreshes on its next tick.
 */
export const SYNC_INTERVAL_MS = 5_000;

/**
 * Which cached screens a domain change must refresh.
 *
 * Keys are prefixes: `['resident', 'finance']` invalidates every finance query,
 * and `['dashboard']` covers both the operator and guard summaries. Keeping the
 * map in one place means a new screen only has to be added here once.
 */
export const DOMAIN_QUERY_KEYS: Record<SyncDomain, ReadonlyArray<readonly unknown[]>> = {
  bookings: [
    ['bookings'],
    ['facilities'],
    ['resident', 'facilities'],
    ['resident', 'dashboard'],
    ['dashboard'],
  ],
  messages: [['messages'], ['resident', 'messages'], ['resident', 'dashboard'], ['dashboard']],
  payments: [
    ['invoices'],
    ['payments'],
    ['resident', 'finance'],
    ['resident', 'dashboard'],
    ['dashboard'],
  ],
  codes: [
    ['access-codes'],
    ['verifications'],
    ['resident', 'codes'],
    ['resident', 'dashboard'],
    ['dashboard'],
  ],
  sos: [['sos'], ['resident', 'sos'], ['resident', 'dashboard'], ['dashboard']],
  community: [['resident', 'community'], ['resident', 'dashboard'], ['dashboard']],
  notifications: [
    ['resident', 'notifications'],
    ['resident', 'dashboard'],
  ],
};

/**
 * Poll the live-sync endpoint and invalidate only the screens that changed.
 *
 * The first response is a baseline (`changed: []`); its `generatedAt` becomes
 * the cursor for the next poll. Nothing is invalidated from the baseline, so a
 * page that just mounted is not refetched for no reason.
 */
export function useSyncSnapshot(enabled: boolean) {
  const queryClient = useQueryClient();
  const cursor = useRef<string | undefined>(undefined);
  const processed = useRef<string | null>(null);

  const { data, loading, error } = useApiQuery(
    queryKeys.sync.snapshot,
    () => api.getSync(cursor.current),
    'Live updates are unavailable.',
    enabled,
    { refetchInterval: SYNC_INTERVAL_MS },
  );

  useEffect(() => {
    if (!data) return;
    cursor.current = data.generatedAt;
    if (processed.current === data.generatedAt) return;
    processed.current = data.generatedAt;

    for (const domain of data.changed) {
      for (const key of DOMAIN_QUERY_KEYS[domain]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    }
  }, [data, queryClient]);

  return {
    snapshot: (data ?? null) as SyncSnapshotDto | null,
    loading,
    error,
  };
}
