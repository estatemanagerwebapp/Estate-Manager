import { Megaphone } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident community page (stub — S7 will replace with latest announcements
 * and the active estate broadcast).
 */
export function ResidentCommunityPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Megaphone aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Community</h1>
      </div>
      <Card>
        <CardHeader title="Estate office" subtitle="Latest announcements and estate broadcasts." />
        <CardBody>
          <EmptyState
            title="Community updates coming soon"
            body="Announcements and estate office broadcasts will appear here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
