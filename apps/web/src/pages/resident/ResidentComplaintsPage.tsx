import { MessageSquareWarning } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident complaints page (stub — S5 will replace with open complaints,
 * reply threads and a new-complaint form).
 */
export function ResidentComplaintsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquareWarning aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Complaints</h1>
      </div>
      <Card>
        <CardHeader
          title="Your complaints"
          subtitle="Open complaints and estate office responses."
        />
        <CardBody>
          <EmptyState
            title="Complaints coming soon"
            body="Your complaints and estate office responses will appear here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
