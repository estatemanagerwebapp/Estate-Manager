import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, CalendarDays, Check } from 'lucide-react';
import type {
  BookingDto,
  ResidentNotificationDto,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Skeleton,
  EmptyState,
  ErrorBanner,
} from '../../components/ui';

/**
 * Resident notifications page (S10).
 *
 * The inbox shows the bookings the resident is waiting on plus their
 * recent notifications, with an unread count in the heading. A
 * notification can be marked read, and its link opens the page it points
 * at.
 */
export function ResidentNotificationsPage() {
  const [notifications, setNotifications] = useState<ResidentNotificationDto[]>([]);
  const [upcoming, setUpcoming] = useState<BookingDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getResidentNotifications();
      setNotifications(data.recentNotifications);
      setUpcoming(data.upcomingBookings);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not load your notifications.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(notification: ResidentNotificationDto) {
    setBusyId(notification.id);
    setError(null);
    try {
      await api.markResidentNotificationRead(notification.id);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not mark the notification as read.',
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading unreadCount={0} />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading unreadCount={unreadCount} />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Card>
        <CardHeader
          title="Upcoming bookings"
          subtitle="Facilities you have requested and are waiting on."
        />
        <CardBody>
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming bookings"
              body="Request a facility booking to see it here."
            />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200/80 px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays
                      aria-hidden
                      size={14}
                      className="text-(--color-ink-muted)"
                    />
                    <span className="text-sm font-semibold text-(--color-ink)">
                      {booking.facilityName}
                    </span>
                    <Badge tone={booking.status === 'CONFIRMED' ? 'success' : 'warning'}>
                      {booking.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-(--color-ink-muted)">
                    {formatWindow(booking)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recent notifications"
          subtitle="Updates from the estate office and your own requests."
        />
        <CardBody>
          {notifications.length === 0 ? (
            <EmptyState
              title="Nothing new"
              body="Updates will appear here as they happen."
            />
          ) : (
            <ul className="space-y-2">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`rounded-md border px-3 py-3 ${
                    notification.read
                      ? 'border-slate-200/80'
                      : 'border-slate-300 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-(--color-ink)">
                          {notification.title}
                        </span>
                        <Badge tone={kindTone(notification.kind)}>
                          {notification.kind}
                        </Badge>
                        {!notification.read && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-(--color-primary)">
                            <BellRing aria-hidden size={11} />
                            New
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-(--color-ink)">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-xs text-(--color-ink-muted)">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {notification.linkTo && (
                        <Link
                          to={notification.linkTo}
                          className="text-xs font-medium text-(--color-primary) underline underline-offset-2"
                        >
                          View
                        </Link>
                      )}
                      {!notification.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === notification.id}
                          onClick={() => void markRead(notification)}
                        >
                          <Check aria-hidden size={13} className="mr-1" />
                          Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function PageHeading({ unreadCount }: { unreadCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Bell aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Notifications</h1>
      {unreadCount > 0 && (
        <span
          className="inline-flex items-center rounded-full bg-(--color-primary) px-2 py-0.5 text-xs font-semibold text-white"
          aria-label={`${unreadCount} unread notifications`}
        >
          {unreadCount}
        </span>
      )}
    </div>
  );
}

function kindTone(kind: ResidentNotificationDto['kind']) {
  if (kind === 'BROADCAST') return 'danger' as const;
  if (kind === 'BOOKING') return 'success' as const;
  if (kind === 'COMPLANT') return 'warning' as const;
  if (kind === 'ANNOUNCEMENT') return 'neutral' as const;
  return 'neutral' as const;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWindow(booking: BookingDto): string {
  const starts = new Date(booking.startsAt);
  const ends = new Date(booking.endsAt);
  const day = starts.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = (date: Date) =>
    date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time(starts)}–${time(ends)}`;
}
