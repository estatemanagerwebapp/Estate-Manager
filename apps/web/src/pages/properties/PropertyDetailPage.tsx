import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Home,
  Archive,
  Pencil,
  RotateCcw,
  MapPin,
  Tag,
  Link as LinkIcon,
  Trash2,
} from 'lucide-react';
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
  Skeleton,
} from '../../components/ui';

/**
 * Property detail. Renders the registry record as a readable document:
 * identifier (immutable code), type, estate, structured
 * address, lifecycle dates and the parent property (when set).
 *
 * The identifier is immutable — the UI never offers to edit it. Name,
 * status and address components are editable, matching the API's PATCH
 * contract (`UpdatePropertyInput`).
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
  const [acting, setActing] = useState(false);

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
    setActing(true);
    try {
      const result = await api.archiveProperty(property.id);
      setProperty(result.property);
      toast.success('Property archived.');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not archive the property.');
    } finally {
      setActing(false);
    }
  }

  async function reactivate() {
    if (!property) return;
    setActing(true);
    try {
      const result = await api.updateProperty(property.id, { status: 'ACTIVE' });
      setProperty(result.property);
      toast.success('Property reactivated.');
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError ? err.message : 'Could not reactivate the property.',
      );
    } finally {
      setActing(false);
    }
  }

  async function remove() {
    if (!property) return;
    const ok = await confirm({
      title: 'Permanently delete this property?',
      body: `The identifier ${property.identifier} will be released for re-registration within this estate. This action cannot be undone. Properties with child units cannot be deleted.`,
      danger: true,
    });
    if (!ok) return;
    setActing(true);
    try {
      await api.deleteProperty(property.id);
      toast.success('Property deleted.');
      window.location.href = '/app/properties';
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not delete the property.');
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div>
        <BackLink />
        <div className="rounded-(--radius-card) border border-slate-200/80 bg-white p-5 shadow-(--shadow-card)">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-3 w-64" />
          <div className="mt-6 grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div>
        <BackLink />
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

  const isArchived = property.status === 'ARCHIVED';

  return (
    <div>
      <BackLink />

      <Card aria-label={`Property ${property.identifier}`}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Home aria-hidden size={15} className="text-(--color-primary)" />
              {property.identifier}
              <Badge tone={statusTone(property.status)}>{isArchived ? 'Archived' : 'Active'}</Badge>
            </span>
          }
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-(--color-ink-muted)">
                {property.identifier}
              </code>
              <span className="inline-flex items-center gap-1">
                <Tag aria-hidden size={11} />
                {property.typeLabel || property.typeKey}
              </span>
              {estate && (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden size={11} />
                  {estate.name}
                </span>
              )}
            </span>
          }
          actions={
            can['property.manage'] ? (
              isArchived ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void reactivate()}
                  disabled={acting}
                >
                  <RotateCcw aria-hidden size={13} />
                  {acting ? 'Working…' : 'Reactivate'}
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing((value) => !value)}
                  >
                    <Pencil aria-hidden size={13} />
                    {editing ? 'Hide edit' : 'Edit'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void archive()}
                    disabled={acting}
                  >
                    <Archive aria-hidden size={13} />
                    Archive
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void remove()}
                    disabled={acting}
                  >
                    <Trash2 aria-hidden size={13} />
                    Delete
                  </Button>
                </>
              )
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
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Fact label="Name">
              true ? (<span className="font-medium">{property.identifier}</span>) : (
              <span className="text-(--color-ink-muted)">Not set</span>)
            </Fact>
            <Fact label="Identifier">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                {property.identifier}
              </code>
            </Fact>
            <Fact label="Type">{property.typeLabel || property.typeKey}</Fact>
            {property.houseTypeKey && (
              <Fact label="House type">{property.houseTypeLabel || property.houseTypeKey}</Fact>
            )}
            <Fact label="Status">
              <Badge tone={statusTone(property.status)}>{isArchived ? 'Archived' : 'Active'}</Badge>
            </Fact>
            <Fact label="Created">{new Date(property.createdAt).toLocaleDateString()}</Fact>
            <Fact label="Updated">{new Date(property.updatedAt).toLocaleDateString()}</Fact>
            {property.parentProperty && (
              <Fact label="Parent property">
                <Link
                  to={`/app/properties/${property.parentProperty.id}`}
                  className="inline-flex items-center gap-1 font-medium text-(--color-primary) hover:opacity-80"
                >
                  <LinkIcon aria-hidden size={12} />
                  {property.parentProperty.identifier}
                </Link>
              </Fact>
            )}
          </dl>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
              Address components
            </h3>
            {view && view.addressComponents.length > 0 ? (
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {view.addressComponents.map((component) => (
                  <div key={component.key}>
                    <dt className="text-xs text-(--color-ink-muted)">{component.label}</dt>
                    <dd className="mt-0.5 text-sm">
                      {property.addressComponents[component.key] || (
                        <span className="text-(--color-ink-muted)">—</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-xs text-(--color-ink-muted)">
                No address components are configured for this organization.
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      {dialog}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/app/properties"
      className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
    >
      <ArrowLeft aria-hidden size={14} />
      Back to properties
    </Link>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-(--color-ink-muted)">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
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
  const { view } = usePropertyOptions(true);
  const componentLabels = useMemo(
    () => new Map((view?.addressComponents ?? []).map((c) => [c.key, c.label])),
    [view],
  );
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
        Edit the status and address components. The identifier is immutable.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Property type">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PropertyStatus)}
            className={selectClass}
          >
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </Field>
      </div>

      {Object.keys(components).length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.keys(components).map((key) => (
            <Field key={key} label={componentLabels.get(key) ?? key}>
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
      )}

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
