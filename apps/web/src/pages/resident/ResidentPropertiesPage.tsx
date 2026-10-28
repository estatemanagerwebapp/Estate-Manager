import { Home, MapPin, Building2 } from 'lucide-react';
import { api } from '../../api/client';
import { useApiQuery } from '../../api/query';
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Skeleton,
  EmptyState,
  ErrorBanner,
} from '../../components/ui';

/**
 * Resident's assigned property page (S2).
 *
 * Self-scoped: the API resolves the acting resident's property from their
 * onboarding draft. The page renders the single assigned property with the
 * typed kind and the server-formatted address.
 */
export function ResidentPropertiesPage() {
  const {
    data: response,
    loading,
    error,
    refresh,
  } = useApiQuery(
    ['resident', 'properties'],
    () => api.getResidentProperties(),
    'Could not load your property.',
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error && !response) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      </div>
    );
  }

  const properties = response?.properties ?? [];

  return (
    <div className="space-y-4">
      <PageHeading />

      {error && <ErrorBanner message={error} />}

      {properties.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No property assigned"
              body="Your estate manager will assign a property shortly."
            />
          </CardBody>
        </Card>
      ) : (
        properties.map((property) => (
          <Card key={property.identifier}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Building2 aria-hidden size={15} className="text-(--color-primary)" />
                  {property.identifier}
                </span>
              }
              subtitle="Your assigned property."
            />
            <CardBody>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Fact label="Type">
                  <span className="font-medium">{property.kindLabel}</span>
                </Fact>
                <Fact label="Estate">
                  <Badge tone="neutral">{property.estate.name}</Badge>
                </Fact>
                <Fact label="Status">
                  <Badge tone={property.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {property.status}
                  </Badge>
                </Fact>
              </dl>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
                  <MapPin aria-hidden size={12} />
                  Address
                </h3>
                <p className="mt-2 text-sm text-(--color-ink)">
                  {property.fullAddress || 'No address details on file.'}
                </p>
              </div>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <Home aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">My Properties</h1>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-(--color-ink-muted)">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
