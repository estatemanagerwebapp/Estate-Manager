import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Home, Archive, Pencil } from 'lucide-react';
import type { EstateDto, PropertyDto, PropertyStatus } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { usePropertyOptions } from '../../api/hooks';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { useConfirm } from '../../components/dialog';
import {
  Button,
  Badge,
  statusTone,
  Card,
  CardHeader,
  CardBody,
  EmptyState,
  Field,
  inputClass,
  selectClass,
} from '../../components/ui';

/**
 * Property detail. Renders the registry record, the estate back-link, the
 * parent property (when set), the structured address components, and the
 * status / address edit + archive actions.
 *
 * The identifier is immutable — the UI never offers to edit it. Address
 * components and status are the only editable fields, matching the API's
 * PATCH contract (`UpdatePropertyInput`).
 */
export function PropertyDetailPage() {
  const { propertyId = '' } = useParams();
  const can = useCan();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { view } = usePropertyOptions(true);

  const [property, setProperty] = useState<PropertyDto | null>(null);
  const [estate, setEstate] = useState<EstateDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const detail = await api.getProperty(propertyId);
      setProperty(detail.property);
      const estateBody = await api.getEstate(detail.property.estateId);
      setEstate(estateBody.estate);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setError('This property no longer exists.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not load the property.');
      }
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function archive() {
    if (!property) return;
    const ok = await confirm({
      title: 'Archive this property?',
      body: `The identifier ${property.identifier} will be preserved for audit; the property will no longer appear in active lists.`,
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.archiveProperty(property.id);
      setProperty(result.property);
      toast.success('Property archived.');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not archive the property.');
    }
  }

  if (loading) {
    return (
      <div>
        <Link
          to="/app/properties"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
        >
          <ArrowLeft aria-hidden size={14} />
          Back to properties
        </Link>
        <EmptyState title="Loading property…" body="Fetching the record from the registry." />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div>
        <Link
          to="/app/properties"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
        >
          <ArrowLeft aria-hidden size={14} />
          Back to properties
        </Link>
        <Card aria-label="Property not found">
          <CardBody>
            <EmptyState
              title={error ?? 'Property not found'}
              body="It may have been removed or you do not have access."
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/app/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
      >
        <ArrowLeft aria-hidden size={14} />
        Back to properties
      </Link>

      <Card aria-label={`Property ${property.identifier}`}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Home aria-hidden size={15} className="text-(--color-primary)" />
              {property.identifier}
              <Badge tone={statusTone(property.status)}>{property.status}</Badge>
            </span>
          }
          subtitle={
            <span>
              {property.typeLabel || property.typeKey}
              {estate ? ` · ${estate.name}` : ''}
            </span>
          }
          actions={
            can['property.manage'] && property.status === 'ACTIVE' ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditing((value) => !value)}>
                  <Pencil aria-hidden size={13} />
                  {editing ? 'Hide edit' : 'Edit'}
                </Button>
                <Button variant="danger" size="sm" onClick={() => void archive()}>
                  <Archive aria-hidden size={13} />
                  Archive
                </Button>
              </>
            ) : null
          }
        />

        {editing && can['property.manage'] && (
          <div className="border-b border-slate-200/80 bg-(--color-surface) px-5 py-4">
            <PropertyEditForm
              property={property}
              onSaved={setProperty}
              onCancel={() => setEditing(false)}
            />
          </div>
        )}

        <CardBody>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-(--color-ink-muted)">Type</dt>
              <dd className="mt-0.5 font-medium">{property.typeLabel || property.typeKey}</dd>
            </div>
            <div>
              <dt className="text-xs text-(--color-ink-muted)">Status</dt>
              <dd className="mt-0.5">
                <Badge tone={statusTone(property.status)}>{property.status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-(--color-ink-muted)">Created</dt>
              <dd className="mt-0.5">{new Date(property.createdAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-(--color-ink-muted)">Updated</dt>
              <dd className="mt-0.5">{new Date(property.updatedAt).toLocaleDateString()}</dd>
            </div>
            {property.parentProperty && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-(--color-ink-muted)">Parent property</dt>
                <dd className="mt-0.5">
                  <Link
                    to={`/app/properties/${property.parentProperty.id}`}
                    className="font-medium text-(--color-ink) hover:text-(--color-primary)"
                  >
                    {property.parentProperty.identifier}
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          {view && Object.keys(property.addressComponents).length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-medium text-(--color-ink-muted)">Address components</h3>
              <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(property.addressComponents).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-(--color-ink-muted)">
                      {view?.addressComponents.find((component) => component.key === key)?.label ??
                        key}
                    </dt>
                    <dd className="mt-0.5 text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </CardBody>
      </Card>

      {dialog}
    </div>
  );
}

function PropertyEditForm({
  property,
  onSaved,
  onCancel,
}: {
  property: PropertyDto;
  onSaved: (property: PropertyDto) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<PropertyStatus>(property.status);
  const [components, setComponents] = useState<Record<string, string>>(() => ({
    ...property.addressComponents,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.updateProperty(property.id, {
        status,
        addressComponents: components,
      });
      toast.success('Property updated.');
      onSaved(result.property);
      onCancel();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save the property.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-(--color-ink-muted)">
        Edit status and address components. The identifier is immutable.
      </p>
      <div className="flex flex-wrap gap-4">
        <Field label="Status">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PropertyStatus)}
            className={selectClass}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </Field>
        {Object.keys(components).map((key) => (
          <Field key={key} label={key}>
            <input
              className={inputClass}
              value={components[key] ?? ''}
              onChange={(event) =>
                setComponents((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </Field>
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
