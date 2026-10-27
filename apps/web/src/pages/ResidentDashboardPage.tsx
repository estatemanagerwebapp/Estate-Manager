import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  FileText,
  KeyRound,
  Megaphone,
  MessageSquareWarning,
  Bell,
  Home,
} from 'lucide-react';
import type { ResidentDashboardView } from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Skeleton,
  EmptyState,
  ErrorBanner,
} from '../components/ui';

/**
 * Resident dashboard home (S11).
 *
 * One request renders the whole home: the welcome header, the resident's
 * property, their finance summary, their access codes, what the estate
 * office has told them, and their recent notifications. Each card links
 * into the page that owns the detail.
 */
export function ResidentDashboardPage() {
  const [view, setView] = useState<ResidentDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getResidentDashboard();
      setView(data);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not load your dashboard.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <Skeleton className="h-44" />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error ?? 'Could not load your dashboard.'} onRetry={() => void load()} />
      </div>
    );
  }

  const { profile, property, finance, codes, estateOffice, notifications } = view;
  const primaryProperty = property[0];
  const propertyLabel = primaryProperty
    ? `${primaryProperty.identifier} · ${primaryProperty.estate.name}`
    : (profile.property
      ? `${profile.property.identifier} · ${profile.property.estate.name}`
      : null);
  const firstName = profile.fullName?.split(' ')[0] ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-(--color-ink)">
          {firstName ? `Welcome back, ${firstName}` : 'Welcome to your dashboard'}
        </h1>
        <p className="mt-0.5 text-sm text-(--color-ink-muted)">
          {propertyLabel ?? 'Your resident portal — everything about your home in one place.'}
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* My property */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Home aria-hidden size={14} />
                My property
              </span>
            }
            actions={<ViewLink to="/resident/app/properties" label="View" />}
          />
          <CardBody>
            {!primaryProperty ? (
              <EmptyState
                title="No property assigned"
                body="Your property details appear here once you are assigned."
              />
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-(--color-ink)">
                  {primaryProperty.identifier}
                </p>
                <p className="text-xs text-(--color-ink-muted)">
                  {primaryProperty.estate.name}
                </p>
                <p className="text-xs text-(--color-ink-muted)">
                  {primaryProperty.fullAddress}
                </p>
                <Badge tone={primaryProperty.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {primaryProperty.typeLabel}
                </Badge>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Finance */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <FileText aria-hidden size={14} />
                Invoices & payments
              </span>
            }
            actions={<ViewLink to="/resident/app/invoices" label="View" />}
          />
          <CardBody>
            {finance.outstandingCount === 0 ? (
              <EmptyState title="All settled" body="You have no outstanding invoices." />
            ) : (
              <div className="space-y-1">
                <p className="text-2xl font-semibold text-(--color-ink)">
                  {formatKobo(finance.outstandingTotalKobo)}
                </p>
                <p className="text-xs text-(--color-ink-muted)">
                  {finance.outstandingCount} outstanding invoice
                  {finance.outstandingCount === 1 ? '' : 's'}
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Access codes */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <KeyRound aria-hidden size={14} />
                Access codes
              </span>
            }
            actions={<ViewLink to="/resident/app/codes" label="View" />}
          />
          <CardBody>
            <div className="space-y-1">
              <p className="text-2xl font-semibold text-(--color-ink)">{codes.activeCount}</p>
              <p className="text-xs text-(--color-ink-muted)">
                active code{codes.activeCount === 1 ? '' : 's'}
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Estate office */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <MessageSquareWarning aria-hidden size={14} />
                Estate office
              </span>
            }
            actions={<ViewLink to="/resident/app/community" label="View" />}
          />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-(--color-ink)">Open complaints</span>
              <Badge tone={estateOffice.openComplaints > 0 ? 'warning' : 'neutral'}>
                {estateOffice.openComplaints}
              </Badge>
            </div>

            {estateOffice.activeBroadcast && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-(--color-ink)">
                  <Megaphone aria-hidden size={12} />
                  {estateOffice.activeBroadcast.title}
                </p>
                <p className="mt-1 whitespace-pre-line text-xs text-(--color-ink-muted)">
                  {estateOffice.activeBroadcast.body}
                </p>
              </div>
            )}

            {estateOffice.latestAnnouncement ? (
              <div className="rounded-md border border-slate-200/80 px-3 py-2">
                <p className="text-xs font-semibold text-(--color-ink)">
                  {estateOffice.latestAnnouncement.title}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-(--color-ink-muted)">
                  {estateOffice.latestAnnouncement.body}
                </p>
              </div>
            ) : (
              !estateOffice.activeBroadcast && (
                <EmptyState
                  title="Nothing new"
                  body="Announcements from the estate office appear here."
                />
              )
            )}
          </CardBody>
        </Card>

        {/* Upcoming bookings */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarDays aria-hidden size={14} />
                Upcoming bookings
              </span>
            }
            actions={<ViewLink to="/resident/app/bookings" label="View" />}
          />
          <CardBody>
            {notifications.upcomingBookings.length === 0 ? (
              <EmptyState
                title="No bookings"
                body="Facility bookings you request appear here."
              />
            ) : (
              <ul className="space-y-2">
                {notifications.upcomingBookings.slice(0, 3).map((booking) => (
                  <li key={booking.id} className="text-sm">
                    <span className="font-semibold text-(--color-ink)">
                      {booking.facilityName}
                    </span>
                    <span className="block text-xs text-(--color-ink-muted)">
                      {formatDate(booking.startsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Recent notifications */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Bell aria-hidden size={14} />
                Recent notifications
              </span>
            }
            actions={<ViewLink to="/resident/app/notifications" label="View" />}
          />
          <CardBody>
            {notifications.recentNotifications.length === 0 ? (
              <EmptyState
                title="Nothing new"
                body="Updates from the estate office appear here."
              />
            ) : (
              <ul className="space-y-2">
                {notifications.recentNotifications.map((notification) => (
                  <li key={notification.id} className="text-sm">
                    <span className="font-semibold text-(--color-ink)">
                      {notification.title}
                    </span>
                    <span className="block text-xs text-(--color-ink-muted)">
                      {formatDate(notification.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ViewLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="text-xs font-medium text-(--color-primary) underline underline-offset-2"
    >
      {label}
    </Link>
  );
}

function formatKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
