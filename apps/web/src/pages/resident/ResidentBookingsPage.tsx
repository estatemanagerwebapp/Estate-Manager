import { CalendarDays } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident bookings page (stub — S8 will replace with upcoming/past
 * bookings and a cancel action).
 */
export function ResidentBookingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Bookings</h1>
      </div>
      <Card>
        <CardHeader title="Your bookings" subtitle="Upcoming and past facility bookings." />
        <CardBody>
          <EmptyState
            title="Bookings coming soon"
            body="Your facility bookings will appear here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
