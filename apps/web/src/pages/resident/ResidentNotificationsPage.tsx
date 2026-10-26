import { Bell } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident notifications page (stub — S10 will replace with the unread
 * badge, upcoming bookings and the recent notifications list).
 */
export function ResidentNotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Notifications</h1>
      </div>
      <Card>
        <CardHeader title="Notifications" subtitle="Upcoming bookings and recent updates." />
        <CardBody>
          <EmptyState
            title="Notifications coming soon"
            body="Your upcoming bookings and recent notifications will appear here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
