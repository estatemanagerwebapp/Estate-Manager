import { Building } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident facilities page (stub — S8 will replace with the list of
 * bookable facilities and a booking form).
 */
export function ResidentFacilitiesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Facilities</h1>
      </div>
      <Card>
        <CardHeader title="Facilities" subtitle="Bookable estate facilities." />
        <CardBody>
          <EmptyState
            title="Facilities coming soon"
            body="Available facilities and booking options will appear here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
