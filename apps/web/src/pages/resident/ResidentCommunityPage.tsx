import { Megaphone, AlertTriangle, Info, Siren } from 'lucide-react';
import type { EstateBroadcastDto } from '@silverstone/shared';
import { api } from '../../api/client';
import { useApiQuery } from '../../api/query';
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Skeleton,
  EmptyState,
  ErrorBanner,
} from '../../components/ui';

/**
 * Resident community page (S7).
 *
 * Read-only feed: the estate office's latest announcements plus the active
 * broadcast for the resident's estate. The broadcast is shown as a banner,
 * coloured by its priority.
 */
export function ResidentCommunityPage() {
  const { data, loading, error, refresh } = useApiQuery(
    ['resident', 'community'],
    () => api.getResidentCommunity(),
    'Could not load community updates.',
  );
  const announcements = data?.announcements ?? [];
  const broadcast = data?.broadcast ?? null;

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <Skeleton className="h-20" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading />

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

      {broadcast && <BroadcastBanner broadcast={broadcast} />}

      <Card>
        <CardHeader title="Latest announcements" subtitle="Updates from the estate office." />
        <CardBody>
          {announcements.length === 0 ? (
            <EmptyState
              title="No announcements"
              body="When the estate office posts an update, it will appear here."
            />
          ) : (
            <ul className="space-y-4">
              {announcements.map((announcement) => (
                <li key={announcement.id} className="border-l-2 border-slate-100 pl-3">
                  <p className="text-sm font-semibold text-(--color-ink)">{announcement.title}</p>
                  <p className="mt-0.5 text-xs text-(--color-ink-muted)">
                    {formatDate(announcement.publishedAt)}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm text-(--color-ink)">
                    {announcement.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function BroadcastBanner({ broadcast }: { broadcast: EstateBroadcastDto }) {
  const Icon =
    broadcast.priority === 'CRITICAL'
      ? Siren
      : broadcast.priority === 'WARNING'
        ? AlertTriangle
        : Info;

  return (
    <div
      role="status"
      className={`rounded-md border px-4 py-3 ${
        broadcast.priority === 'CRITICAL'
          ? 'border-red-200 bg-red-50'
          : broadcast.priority === 'WARNING'
            ? 'border-amber-200 bg-amber-50'
            : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          aria-hidden
          size={16}
          className={
            broadcast.priority === 'CRITICAL'
              ? 'text-red-700'
              : broadcast.priority === 'WARNING'
                ? 'text-amber-700'
                : 'text-(--color-primary)'
          }
        />
        <span className="text-sm font-semibold text-(--color-ink)">{broadcast.title}</span>
        <Badge tone={priorityTone(broadcast.priority)}>{broadcast.priority}</Badge>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-(--color-ink)">{broadcast.body}</p>
      <p className="mt-2 text-xs text-(--color-ink-muted)">
        Issued {formatDate(broadcast.issuedAt)}
        {broadcast.expiresAt ? ` · expires ${formatDate(broadcast.expiresAt)}` : ''}
      </p>
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <Megaphone aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Community</h1>
    </div>
  );
}

function priorityTone(priority: EstateBroadcastDto['priority']) {
  if (priority === 'CRITICAL') return 'danger' as const;
  if (priority === 'WARNING') return 'warning' as const;
  return 'neutral' as const;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
