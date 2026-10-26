import { Siren } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident emergency / SOS page (stub — S9 will replace with the SOS trigger
 * button and the resident's event history).
 */
export function ResidentSosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Siren aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Emergency / SOS</h1>
      </div>
      <Card>
        <CardHeader
          title="Emergency assistance"
          subtitle="Raise an SOS alert and view your history."
        />
        <CardBody>
          <EmptyState
            title="Emergency feature coming soon"
            body="The SOS trigger and event history will appear here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
