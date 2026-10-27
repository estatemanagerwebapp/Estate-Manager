import { RefreshCw } from 'lucide-react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';

/**
 * Global "refresh the data on this screen" control.
 *
 * The SPA serves cached reads by default. This button is the single explicit
 * way to re-pull the queries that are currently mounted, without remounting
 * the page or losing its filters. Inactive screens stay cached.
 */
export function RefreshButton() {
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;

  return (
    <button
      type="button"
      onClick={() => {
        void queryClient.invalidateQueries({ refetchType: 'active' });
      }}
      disabled={fetching}
      aria-label="Refresh data"
      title="Refresh data"
      aria-busy={fetching}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-(--color-ink-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-ink) disabled:cursor-wait disabled:opacity-60"
    >
      <RefreshCw aria-hidden size={13} className={fetching ? 'animate-spin' : undefined} />
      <span className="hidden sm:inline">{fetching ? 'Refreshing…' : 'Refresh'}</span>
    </button>
  );
}
