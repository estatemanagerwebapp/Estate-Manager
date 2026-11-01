import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Building, CalendarDays, Clock3, Users } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { OperatorBookingDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { useCan } from '../auth/useCan';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Skeleton,
} from '../components/ui';
import { OperatorPageHeader } from '../components/operator';
import { formatDateTime } from '../lib/format';

type BookingView = 'active' | 'past';

function isActiveBooking(booking: OperatorBookingDto, now: number): boolean {
  return (
    (booking.status === 'REQUESTED' || booking.status === 'CONFIRMED') &&
    new Date(booking.endsAt).getTime() >= now
  );
}

export function FacilityDetailPage() {
  const { facilityId = '' } = useParams();
  const can = useCan();
  const [view, setView] = useState<BookingView>('active');
  const facilityQuery = useApiQuery(
    queryKeys.facilities.detail(facilityId),
    () => api.getOperatorFacility(facilityId),
    'Could not load this facility.',
    Boolean(facilityId),
  );
  const bookingsQuery = useApiQuery(
    queryKeys.bookings.list({ facilityId, limit: 200 }),
    () => api.listOperatorBookings({ facilityId, limit: 200 }),
    'Could not load facility bookings.',
    Boolean(facilityId) && can['booking.read'],
  );

  const facility = facilityQuery.data?.facility;
  const bookings = bookingsQuery.data?.bookings ?? [];
  const now = Date.now();
  const activeBookings = useMemo(
    () =>
      bookings
        .filter((booking) => isActiveBooking(booking, now))
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [bookings, now],
  );
  const pastBookings = useMemo(
    () =>
      bookings
        .filter((booking) => !isActiveBooking(booking, now))
        .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)),
    [bookings, now],
  );
  const visibleBookings = view === 'active' ? activeBookings : pastBookings;
  const loadError =
    facilityQuery.errorObject instanceof ApiRequestError &&
    facilityQuery.errorObject.code === 'FORBIDDEN'
      ? 'You do not have permission to view this facility.'
      : facilityQuery.error;

  if (facilityQuery.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (loadError || !facility) {
    return (
      <div className="space-y-4">
        <Link
          to="/app/facilities"
          className="inline-flex items-center gap-2 text-sm text-(--color-primary)"
        >
          <ArrowLeft size={16} /> Back to facilities
        </Link>
        <ErrorBanner
          message={loadError ?? 'Facility not found.'}
          onRetry={() => void facilityQuery.refresh()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        to="/app/facilities"
        className="inline-flex items-center gap-2 text-sm font-medium text-(--color-ink-muted) hover:text-(--color-primary)"
      >
        <ArrowLeft size={16} /> Facilities
      </Link>
      <OperatorPageHeader
        icon={<Building aria-hidden size={19} className="text-(--color-primary)" />}
        title={facility.name}
        description={`${facility.estate.name} · Facility management`}
      />

      <Card>
        <CardHeader title="Facility details" subtitle="Hours, rules and booking requirements" />
        <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Status">
            <Badge
              tone={facility.archivedAt ? 'neutral' : facility.bookable ? 'success' : 'warning'}
            >
              {facility.archivedAt ? 'Archived' : facility.bookable ? 'Bookable' : 'Suspended'}
            </Badge>
          </Detail>
          <Detail label="Opening hours">
            <span className="inline-flex items-center gap-2">
              <Clock3 size={15} /> {facility.openingTime}–{facility.closingTime}
            </span>
          </Detail>
          <Detail label="Minimum notice">
            {facility.bookingThresholdHours == null
              ? 'No minimum'
              : `${facility.bookingThresholdHours} hours`}
          </Detail>
          <Detail label="Usage fee">
            {facility.usageFeeKobo === 0
              ? 'Free'
              : `₦${(facility.usageFeeKobo / 100).toLocaleString('en-NG')}`}
          </Detail>
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-medium text-(--color-ink-muted)">Description and rules</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-(--color-ink)">
              {facility.description}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Bookings"
          subtitle="Review upcoming requests and booking history"
          actions={
            <span className="inline-flex items-center gap-2 text-xs text-(--color-ink-muted)">
              <CalendarDays size={15} /> {bookings.length} loaded
            </span>
          }
        />
        {!can['booking.read'] ? (
          <CardBody>
            <p className="text-sm text-(--color-ink-muted)">
              You do not have permission to view facility bookings.
            </p>
          </CardBody>
        ) : (
          <CardBody>
            <div className="mb-4 flex gap-2" role="tablist" aria-label="Booking history view">
              {(['active', 'past'] as const).map((item) => (
                <button
                  key={item}
                  role="tab"
                  aria-selected={view === item}
                  onClick={() => setView(item)}
                  className={`rounded-md px-3 py-2 text-sm font-medium capitalize ${view === item ? 'bg-orange-50 text-(--color-primary)' : 'text-(--color-ink-muted) hover:bg-slate-50'}`}
                >
                  {item}{' '}
                  <span className="ml-1 text-xs">
                    ({item === 'active' ? activeBookings.length : pastBookings.length})
                  </span>
                </button>
              ))}
            </div>
            {bookingsQuery.error && (
              <ErrorBanner
                message={bookingsQuery.error}
                onRetry={() => void bookingsQuery.refresh()}
              />
            )}
            {bookingsQuery.loading ? (
              <Skeleton className="h-40" />
            ) : visibleBookings.length === 0 ? (
              <EmptyState
                title={view === 'active' ? 'No active bookings' : 'No past bookings'}
                body={
                  view === 'active'
                    ? 'New booking requests for this facility will appear here.'
                    : 'Completed and cancelled bookings will appear here.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-(--color-ink-muted)">
                      <th className="px-3 py-3">Booking</th>
                      <th className="px-3 py-3">Resident</th>
                      <th className="px-3 py-3">Property</th>
                      <th className="px-3 py-3">Attendees</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleBookings.map((booking) => (
                      <BookingRow key={booking.id} booking={booking} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-(--color-ink-muted)">{label}</p>
      <div className="mt-1 text-sm font-medium text-(--color-ink)">{children}</div>
    </div>
  );
}

function BookingRow({ booking }: { booking: OperatorBookingDto }) {
  const tone =
    booking.status === 'CONFIRMED'
      ? 'success'
      : booking.status === 'REQUESTED'
        ? 'warning'
        : booking.status === 'CANCELLED'
          ? 'danger'
          : 'neutral';
  const resident = booking.resident?.fullName || booking.resident?.email || 'Resident';
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-3 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-(--color-ink-muted)">
          <CalendarDays size={14} /> {formatDateTime(booking.startsAt)}
        </span>
        <p className="mt-1 text-xs text-(--color-ink-muted)">to {formatDateTime(booking.endsAt)}</p>
      </td>
      <td className="px-3 py-3">
        <p className="font-medium">{resident}</p>
        {booking.resident?.phone && (
          <p className="text-xs text-(--color-ink-muted)">{booking.resident.phone}</p>
        )}
      </td>
      <td className="px-3 py-3 text-(--color-ink-muted)">{booking.property?.identifier ?? '—'}</td>
      <td className="px-3 py-3 text-(--color-ink-muted)">
        <span className="inline-flex items-center gap-1">
          <Users size={14} />
          {booking.attendees ?? '—'}
        </span>
      </td>
      <td className="px-3 py-3">
        <Badge tone={tone}>{booking.status.toLowerCase()}</Badge>
      </td>
    </tr>
  );
}
