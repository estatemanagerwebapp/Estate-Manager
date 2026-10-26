import { Home } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident's assigned property page (stub — S2 will replace with the live
 * property details + full formatted address).
 */
export function ResidentPropertiesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Home aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">My Properties</h1>
      </div>
      <Card>
        <CardHeader title="Your property" subtitle="Assigned estate and unit." />
        <CardBody>
          <EmptyState
            title="Property details coming soon"
            body="This page will show your assigned property with its full address."
          />
        </CardBody>
      </Card>
    </div>
  );
}
