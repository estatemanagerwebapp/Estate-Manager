import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Ban } from 'lucide-react';
import type { BookingDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useToast } from '../../toast/Toast';
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
 * Resident bookings page (S8).
 *
 * Shows the resident's upcoming bookings (cancellable) and their past
 * ones. Bookings are requested from the Facilities page.
 */
export function ResidentBookingsPage() {
  const toast = useToast();
  const [upcoming, setUpcoming] = useState<BookingDto[]>([]);
  const [past, setPast] = useState<BookingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getResidentFacilities();
      setUpcoming(data.upcoming);
      setPast(data.past);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(booking: BookingDto) {
    setBusyId(booking.id);
    setError(null);
    try {
      await api.cancelResidentBooking(booking.id);
      toast.success('Booking cancelled.');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not cancel the booking.');
      toast.error('Could not cancel the booking.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Card>
        <CardHeader
          title="Upcoming bookings"
          subtitle="Requests you are waiting on, and confirmed bookings."
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
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  busy={busyId === booking.id}
                  onCancel={() => void cancel(booking)}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Past bookings" subtitle="Completed and cancelled bookings." />
        <CardBody>
          {past.length === 0 ? (
            <EmptyState title="Nothing here yet" body="Your booking history will appear here." />
          ) : (
            <ul className="space-y-2">
              {past.map((booking) => (
                <BookingRow key={booking.id} booking={booking} busy={false} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <CalendarDays aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Bookings</h1>
    </div>
  );
}

function BookingRow({
  booking,
  busy,
  onCancel,
}: {
  booking: BookingDto;
  busy: boolean;
  onCancel?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200/80 px-3 py-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-(--color-ink)">{booking.facilityName}</span>
          <Badge tone={statusTone(booking.status)}>{booking.status}</Badge>
        </div>
        <p className="mt-1 text-xs text-(--color-ink-muted)">
          {formatWindow(booking)}
          {booking.attendees ? ` · ${booking.attendees} attendees` : ''}
        </p>
      </div>
      {onCancel && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          <Ban aria-hidden size={13} className="mr-1" />
          Cancel
        </Button>
      )}
    </li>
  );
}

function statusTone(status: BookingDto['status']) {
  if (status === 'CONFIRMED') return 'success' as const;
  if (status === 'REQUESTED') return 'warning' as const;
  if (status === 'CANCELLED') return 'danger' as const;
  return 'neutral' as const;
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
