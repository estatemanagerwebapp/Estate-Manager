import { History, ChevronDown } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { apiErrorMessage } from '../../api/query';
import { Button, Card, CardBody, CardHeader, ErrorBanner, Skeleton } from '../../components/ui';
import { ActivityRow } from '../../components/DashboardWidgets';

const PAGE_SIZE = 20;

/**
 * Full audit activity log.
 *
 * Lists the organisation's most recent audit events, newest first, with
 * "Load more" cursor pagination (the API clamps each page to [1,50]).
 * Requires `audit.read` — the route is wrapped in `RequirePermission` in
 * `main.tsx`, so this page only renders for roles that can read the log.
 *
 * The first page is cached like every other screen. "Load more" appends a
 * cursor page; the header Refresh re-reads the pages already loaded.
 */
export function ActivityPage() {
  const {
    data,
    isLoading,
    isError,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['activity'],
    queryFn: ({ pageParam }) => api.getDashboardActivity(PAGE_SIZE, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const events = data?.pages.flatMap((page) => page.events) ?? [];
  const error = isError ? apiErrorMessage(queryError, 'Could not load activity.') : null;
  const loading = isLoading;

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
          <History aria-hidden size={20} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-(--color-ink-muted)">
            Recent events across the deployment, most recent first.
          </p>
        </div>
      </header>

      <main className="mt-8">
        {error && !events.length && <ErrorBanner message={error} onRetry={() => void refetch()} />}

        <Card>
          <CardHeader
            title="Audit log"
            subtitle={`${events.length} event${events.length === 1 ? '' : 's'} shown`}
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="flex flex-col gap-3 p-5" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-2 w-2 rounded-full" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : !events.length ? (
              <p className="p-5 text-xs text-(--color-ink-muted)">No events recorded yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100 px-5">
                {events.map((event) => (
                  <ActivityRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </CardBody>

          {hasNextPage && !loading && (
            <div className="flex justify-center border-t border-slate-200/80 p-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                <ChevronDown aria-hidden size={14} />
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
