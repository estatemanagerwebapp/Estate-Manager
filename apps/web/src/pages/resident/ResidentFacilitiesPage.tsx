import { useCallback, useEffect, useState } from 'react';
import { Building, CalendarPlus } from 'lucide-react';
import type { FacilityDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
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

/**
 * Resident facilities page (S8).
 *
 * Lists the facilities available on the resident's estate (plus
 * organization-wide ones) and lets them request a booking.
 */
export function ResidentFacilitiesPage() {
  const toast = useToast();
  const [facilities, setFacilities] = useState<FacilityDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bookingFacility, setBookingFacility] = useState<FacilityDto | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [attendees, setAttendees] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getResidentFacilities();
      setFacilities(data.facilities);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not load the facilities.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!bookingFacility) return;
    setSubmitting(true);
    setError(null);
    try {
      const count = Number.parseInt(attendees, 10);
      await api.createResidentBooking({
        facilityId: bookingFacility.id,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        attendees: Number.isFinite(count) && count > 0 ? count : undefined,
      });
      toast.success('Booking requested.');
      setBookingFacility(null);
      setStartsAt('');
      setEndsAt('');
      setAttendees('');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Could not request the booking.',
      );
      toast.error('Could not request the booking.');
    } finally {
      setSubmitting(false);
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

      {bookingFacility && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarPlus aria-hidden size={15} className="text-(--color-primary)" />
                Book {bookingFacility.name}
              </span>
            }
            subtitle="The estate office confirms each request."
          />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </Field>
              <Field label="Ends">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Attendees (optional)">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={500}
                  value={attendees}
                  onChange={(event) => setAttendees(event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBookingFacility(null)}
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
        <CardHeader
          title="Facilities"
          subtitle="Amenities you can book on your estate."
        />
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
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-(--color-ink)">
                        {facility.name}
                      </span>
                      <Badge tone={facility.bookable ? 'success' : 'neutral'}>
                        {facility.bookable ? 'BOOKABLE' : 'ON REQUEST'}
                      </Badge>
                    </div>
                    {facility.description && (
                      <p className="mt-1 text-xs text-(--color-ink-muted)">
                        {facility.description}
                      </p>
                    )}
                  </div>
                  {facility.bookable && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setBookingFacility(facility)}
                    >
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
    </div>
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
