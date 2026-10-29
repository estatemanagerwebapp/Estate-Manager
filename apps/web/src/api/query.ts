import { keepPreviousData, QueryClient, useQuery, type QueryKey } from '@tanstack/react-query';
import { ApiRequestError } from './client';

/**
 * SPA data cache.
 *
 * The console is a long-lived operator tool: switching between Properties,
 * Estates and Users should be instant. Every read goes through TanStack Query
 * with an infinite `staleTime`, so a page paints from the in-memory cache and
 * never re-hits the API on mount. The header's Refresh button invalidates the
 * active queries; mutations clear the cache entries they affect at the call
 * site (via `refresh()` or `queryClient.invalidateQueries`).
 *
 * Session data is deliberately not persisted: a full reload starts empty and
 * signing out clears the client (see `AuthContext`).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Number.POSITIVE_INFINITY,
      // Keep inactive pages around for an hour so a quick trip to another
      // screen and back is still instant. Memory is bounded by the number of
      // distinct list filters an operator actually uses.
      gcTime: 60 * 60 * 1000,
      // `staleTime: Infinity` means a normal mount never refetches. A query
      // marked stale by the header refresh (or a mutation) *does* refetch on
      // its next mount, which keeps invalidated screens fresh without polling.
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Client errors (401/403/404/409/422) are deterministic; retrying them
      // only doubles load. Transient network/5xx failures get one retry.
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && typeof error.status === 'number') {
          if (error.status < 500) return false;
        }
        return failureCount < 1;
      },
    },
  },
});

export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/**
 * Thin wrapper around `useQuery` that preserves the shape the existing pages
 * already use (`data`, `loading`, `error`).
 *
 * - `loading` is only true when there is no cached value to paint. If a query
 *   is cached, the first render already has data — no skeleton flash.
 * - `placeholderData` keeps the previous page visible while a filter change is
 *   fetching, instead of blanking the table.
 */
export function useApiQuery<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  fallbackError: string,
  enabled = true,
  options: { refetchInterval?: number | false } = {},
) {
  const query = useQuery({
    queryKey,
    queryFn,
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval,
  });

  return {
    data: query.data ?? null,
    loading: enabled ? query.isPending : false,
    fetching: query.isFetching,
    error: query.error ? apiErrorMessage(query.error, fallbackError) : null,
    errorObject: query.error,
    refresh: query.refetch,
    query,
  };
}
