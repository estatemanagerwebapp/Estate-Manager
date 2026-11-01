import { useState } from 'react';
import { Bell, BellOff, Building, CalendarPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatNaira,
  type FacilityDto,
  type FacilityWatchStatus,
  type ResidentFacilityWatchDto,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useApiQuery } from '../../api/query';
import { queryKeys } from '../../api/query-keys';
import { useToast } from '../../toast/Toast';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Skeleton,
  Field,
  inputClass,
  EmptyState,
  ErrorBanner,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';

/**
 * Resident facilities page (S8, Phase 7).
 *
 * Facilities are estate-scoped and carry a flat per-booking fee. If a desired
 * window is occupied, the resident can watch that exact window and receives
 * an in-app notification when it becomes bookable.
 */
export function ResidentFacilitiesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);

  const [bookingFacility, setBookingFacility] = useState<FacilityDto | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [attendees, setAttendees] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [overlapConflict, setOverlapConflict] = useState(false);
  const [busyWatchId, setBusyWatchId] = useState<string | null>(null);

  const {
    data,
    loading,
    error: queryError,
    refresh,
  } = useApiQuery(
    queryKeys.resident.facilities,
    () => api.getResidentFacilities(),
    'Could not load the facilities.',
  );
  const watchesQuery = useApiQuery(
    queryKeys.resident.facilityWatches,
    () => api.getResidentFacilityWatches(),
    'Could not load your availability alerts.',
  );
  const facilities = data?.facilities ?? [];
  const watches = watchesQuery.data?.watches ?? [];
  const error = actionError ?? queryError;

  function resetBookingForm() {
    setBookingFacility(null);
    setStartsAt('');
    setEndsAt('');
    setAttendees('');
    setOverlapConflict(false);
  }

  function openBooking(facility: FacilityDto) {
    resetBookingForm();
    setActionError(null);
    setBookingFacility(facility);
  }

  async function submit() {
    if (!bookingFacility) return;
    setSubmitting(true);
    setActionError(null);
    setOverlapConflict(false);
    try {
      const count = Number.parseInt(attendees, 10);
      await api.createResidentBooking({
        facilityId: bookingFacility.id,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        attendees: Number.isFinite(count) && count > 0 ? count : undefined,
      });
      toast.success(
        bookingFacility.usageFeeKobo > 0
          ? 'Booking requested. The estate office will verify payment before confirming it.'
          : 'Booking requested.',
      );
      resetBookingForm();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.resident.facilities,
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.resident.dashboard });
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : 'Could not request the booking.';
      setActionError(message);
      if (
        err instanceof ApiRequestError &&
        err.status === 409 &&
        message.toLowerCase().includes('already booked')
      ) {
        setOverlapConflict(true);
      }
      toast.error('Could not request the booking.');
    } finally {
      setSubmitting(false);
    }
  }

  async function watchThisSlot() {
    if (!bookingFacility) return;
    setSubmitting(true);
    setWatchError(null);
    setActionError(null);
    try {
      await api.createResidentFacilityWatch({
        facilityId: bookingFacility.id,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      toast.success('We will notify you when this slot becomes free.');
      resetBookingForm();
      await watchesQuery.refresh();
    } catch (err) {
      setWatchError(
        err instanceof ApiRequestError ? err.message : 'Could not create the availability alert.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelWatch(watch: ResidentFacilityWatchDto) {
    setBusyWatchId(watch.id);
    setWatchError(null);
    try {
      await api.cancelResidentFacilityWatch(watch.id);
      toast.success('Availability alert cancelled.');
      await watchesQuery.refresh();
    } catch (err) {
      setWatchError(
        err instanceof ApiRequestError ? err.message : 'Could not cancel the availability alert.',
      );
    } finally {
      setBusyWatchId(null);
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

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

      {bookingFacility && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarPlus aria-hidden size={15} className="text-(--color-primary)" />
                Book {bookingFacility.name}
              </span>
            }
            subtitle={
              bookingFacility.usageFeeKobo > 0
                ? `${formatNaira(bookingFacility.usageFeeKobo)} per booking. The estate office verifies payment before confirming.`
                : 'Free to book. The estate office confirms each request.'
            }
          />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts">
                <input
                  className={`${inputClass} text-base`}
                  style={{ fontSize: '16px' }}
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => {
                    setStartsAt(event.target.value);
                    setOverlapConflict(false);
                  }}
                />
              </Field>
              <Field label="Ends">
                <input
                  className={`${inputClass} text-base`}
                  style={{ fontSize: '16px' }}
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => {
                    setEndsAt(event.target.value);
                    setOverlapConflict(false);
                  }}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Attendees (optional)">
                <input
                  className={`${inputClass} text-base`}
                  style={{ fontSize: '16px' }}
                  type="number"
                  min={1}
                  max={500}
                  value={attendees}
                  onChange={(event) => setAttendees(event.target.value)}
                />
              </Field>
            </div>

            <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-(--color-ink-muted)">
              <p>
                {bookingFacility.estate.name} · {bookingFacility.openingTime}–
                {bookingFacility.closingTime}
              </p>
              <p className="mt-1">
                {bookingFacility.usageFeeKobo === 0
                  ? 'Free booking'
                  : `${formatNaira(bookingFacility.usageFeeKobo)} usage fee`}
                {bookingFacility.bookingThresholdHours != null &&
                  ` · Book at least ${bookingFacility.bookingThresholdHours} hours ahead`}
              </p>
              <p className="mt-1">
                Bookings must start and end within these hours on the same day.
              </p>
            </div>

            {(actionError || watchError) && (
              <p
                role="alert"
                className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"
              >
                {actionError ?? watchError}
              </p>
            )}

            {overlapConflict && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                <p>
                  This slot is already occupied. You can ask us to notify you when the exact window
                  becomes available.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  disabled={submitting || !startsAt || !endsAt}
                  onClick={() => void watchThisSlot()}
                >
                  <Bell aria-hidden size={13} className="mr-1" />
                  Notify me when this slot is free
                </Button>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={resetBookingForm}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void submit()}
                disabled={submitting || !startsAt || !endsAt}
              >
                {submitting ? 'Requesting…' : 'Request booking'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Facilities" subtitle="Amenities you can book on your estate." />
        <CardBody>
          {facilities.length === 0 ? (
            <EmptyState
              title="No facilities listed"
              body="When the estate office lists bookable facilities, they will appear here."
            />
          ) : (
            <ul className="space-y-2">
              {facilities.map((facility) => (
                <li
                  key={facility.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200/80 px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-(--color-ink)">
                        {facility.name}
                      </span>
                      <Badge tone={facility.bookable ? 'success' : 'neutral'}>
                        {facility.bookable ? 'BOOKABLE' : 'SUSPENDED'}
                      </Badge>
                      <Badge tone="info">
                        {facility.usageFeeKobo === 0 ? 'Free' : formatNaira(facility.usageFeeKobo)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-(--color-ink-muted)">{facility.estate.name}</p>
                    {facility.description && (
                      <p className="mt-1 text-xs text-(--color-ink-muted)">
                        {facility.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-medium text-(--color-ink-muted)">
                      Open {facility.openingTime}–{facility.closingTime}
                      {facility.bookingThresholdHours != null &&
                        ` · ${facility.bookingThresholdHours}h minimum notice`}
                    </p>
                  </div>
                  {facility.bookable && (
                    <Button size="sm" variant="secondary" onClick={() => openBooking(facility)}>
                      <CalendarPlus aria-hidden size={13} className="mr-1" />
                      Book
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Availability alerts"
          subtitle="Occupied windows you asked us to watch. These are not reservations."
        />
        <CardBody>
          {watchesQuery.error && (
            <ErrorBanner message={watchesQuery.error} onRetry={() => void watchesQuery.refresh()} />
          )}
          {!watchesQuery.error && watches.length === 0 ? (
            <EmptyState
              title="No availability alerts"
              body="If a desired slot is occupied, ask us to notify you when it becomes free."
            />
          ) : (
            <ul className="space-y-2">
              {watches.map((watch) => (
                <WatchRow
                  key={watch.id}
                  watch={watch}
                  busy={busyWatchId === watch.id}
                  onCancel={() => void cancelWatch(watch)}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function WatchRow({
  watch,
  busy,
  onCancel,
}: {
  watch: ResidentFacilityWatchDto;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200/80 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-(--color-ink)">{watch.facilityName}</span>
          <Badge tone={watchStatusTone(watch.status)}>{watchStatusLabel(watch.status)}</Badge>
        </div>
        <p className="mt-1 text-xs text-(--color-ink-muted)">
          {formatWindow(watch.startsAt, watch.endsAt)}
        </p>
        {watch.status === 'NOTIFIED' && watch.notifiedAt && (
          <p className="mt-1 text-xs text-emerald-700">
            We notified you on {formatDateTime(watch.notifiedAt)}.
          </p>
        )}
      </div>
      {watch.status === 'WAITING' && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          <BellOff aria-hidden size={13} className="mr-1" />
          Cancel alert
        </Button>
      )}
    </li>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <Building aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Facilities</h1>
    </div>
  );
}

function watchStatusLabel(status: FacilityWatchStatus): string {
  switch (status) {
    case 'WAITING':
      return 'Waiting';
    case 'NOTIFIED':
      return 'Available';
    case 'CANCELLED':
      return 'Cancelled';
    case 'EXPIRED':
      return 'Expired';
  }
}

function watchStatusTone(status: FacilityWatchStatus) {
  if (status === 'NOTIFIED') return 'success' as const;
  if (status === 'WAITING') return 'warning' as const;
  if (status === 'CANCELLED') return 'danger' as const;
  return 'neutral' as const;
}

function formatWindow(startsAt: string, endsAt: string): string {
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  const day = starts.toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = (date: Date) =>
    date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time(starts)}–${time(ends)}`;
}
