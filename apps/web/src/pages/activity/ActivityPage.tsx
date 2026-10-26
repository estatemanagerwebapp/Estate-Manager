import { useCallback, useEffect, useRef, useState } from 'react';
import { History, ChevronDown } from 'lucide-react';
import { type AuditEventDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { Button, Card, CardBody, CardHeader, ErrorBanner, Skeleton } from '../../components/ui';
import { ActivityRow } from '../../components/DashboardWidgets';

/**
 * Full audit activity log.
 *
 * Lists the organisation's most recent audit events, newest first, with
 * "Load more" cursor pagination (the API clamps each page to [1,50]).
 * Requires `audit.read` — the route is wrapped in `RequirePermission` in
 * `main.tsx`, so this page only renders for roles that can read the log.
 */
export function ActivityPage() {
  const [events, setEvents] = useState<AuditEventDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const PAGE_SIZE = 20;

  const loadPage = useCallback(async (after?: string) => {
    if (after) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const body = await api.getDashboardActivity(PAGE_SIZE, after);
      if (!mounted.current) return;
      setEvents((prev) => (after ? [...prev, ...body.events] : body.events));
      setNextCursor(body.nextCursor);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof ApiRequestError ? err.message : 'Could not load activity.');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPage();
    return () => {
      mounted.current = false;
    };
  }, [loadPage]);

  const hasMore = nextCursor !== null;

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
        {error && !events.length && (
          <ErrorBanner message={error} onRetry={() => void loadPage(nextCursor ?? undefined)} />
        )}

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

          {hasMore && !loading && (
            <div className="flex justify-center border-t border-slate-200/80 p-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={loadingMore}
                onClick={() => void loadPage(nextCursor ?? undefined)}
              >
                <ChevronDown aria-hidden size={14} />
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
