import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Home, Archive, Pencil, RotateCcw, MapPin, Tag, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { PropertyDto, PropertyStatus } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useApiQuery } from '../../api/query';
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
 * identifier (immutable code), kind, house type, typed address fields,
 * lifecycle dates and the estate.
 *
 * The identifier is immutable — the UI never offers to edit it. Status, name
 * and the typed address fields are editable, matching the API's PATCH
 * contract (`UpdatePropertyInput`).
 */
export function PropertyDetailPage() {
  const { propertyId = '' } = useParams();
  const can = useCan();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [acting, setActing] = useState(false);

  const {
    data: detail,
    loading,
    error: queryError,
    errorObject,
  } = useApiQuery(
    ['property', propertyId],
    () => api.getProperty(propertyId),
    'Could not load the property.',
  );

  const property: PropertyDto | null = detail?.property ?? null;
  const estateId = property?.estateId ?? '';

  const { data: estateDetail } = useApiQuery(
    ['estate', estateId],
    () => api.getEstate(estateId),
    'Could not load the estate.',
    Boolean(estateId),
  );
  const estate = estateDetail?.estate ?? null;

  const error =
    errorObject instanceof ApiRequestError && errorObject.code === 'NOT_FOUND'
      ? 'This property no longer exists.'
      : queryError;

  function setProperty(next: PropertyDto) {
    queryClient.setQueryData<Awaited<ReturnType<typeof api.getProperty>>>(
      ['property', propertyId],
      (current) => (current ? { ...current, property: next } : current),
    );
    void queryClient.invalidateQueries({ queryKey: ['properties'], refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
    if (estateId) {
      void queryClient.invalidateQueries({
        queryKey: ['estate', estateId],
        refetchType: 'none',
      });
    }
  }

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
      body: `The identifier ${property.identifier} will be released for re-registration within this estate. This action cannot be undone.`,
      danger: true,
    });
    if (!ok) return;
    setActing(true);
    try {
      await api.deleteProperty(property.id);
      toast.success('Property deleted.');
      void queryClient.invalidateQueries({ queryKey: ['properties'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
      if (estateId) {
        void queryClient.invalidateQueries({
          queryKey: ['estate', estateId],
          refetchType: 'none',
        });
      }
      queryClient.removeQueries({ queryKey: ['property', propertyId] });
      navigate('/app/properties', { replace: true });
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
                {property.kindLabel}
                {property.houseTypeLabel ? ` · ${property.houseTypeLabel}` : ''}
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
              {property.name ? (
                <span className="font-medium">{property.name}</span>
              ) : (
                <span className="text-(--color-ink-muted)">Not set</span>
              )}
            </Fact>
            <Fact label="Identifier">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                {property.identifier}
              </code>
            </Fact>
            <Fact label="Type">{property.kindLabel}</Fact>
            {property.houseTypeLabel && <Fact label="House type">{property.houseTypeLabel}</Fact>}
            <Fact label="Status">
              <Badge tone={statusTone(property.status)}>{isArchived ? 'Archived' : 'Active'}</Badge>
            </Fact>
            <Fact label="Created">{new Date(property.createdAt).toLocaleDateString()}</Fact>
            <Fact label="Updated">{new Date(property.updatedAt).toLocaleDateString()}</Fact>
          </dl>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
              Address
            </h3>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Fact label="Street name">{property.streetName || '—'}</Fact>
              {property.houseNumber && <Fact label="House number">{property.houseNumber}</Fact>}
              {property.blockName && <Fact label="Block name">{property.blockName}</Fact>}
              {property.floorNumber && <Fact label="Floor number">{property.floorNumber}</Fact>}
              {property.unitNumber && <Fact label="Unit number">{property.unitNumber}</Fact>}
              {property.plotNumber && <Fact label="Plot number">{property.plotNumber}</Fact>}
              {property.plotName && <Fact label="Plot name">{property.plotName}</Fact>}
            </dl>
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
  const [status, setStatus] = useState<PropertyStatus>(property.status);
  const [name, setName] = useState(property.name ?? '');
  const [fields, setFields] = useState({
    streetName: property.streetName,
    houseNumber: property.houseNumber ?? '',
    blockName: property.blockName ?? '',
    floorNumber: property.floorNumber ?? '',
    unitNumber: property.unitNumber ?? '',
    plotNumber: property.plotNumber ?? '',
    plotName: property.plotName ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const showsHouseFields = property.kind !== 'LAND';
  const usesUnitFields = property.houseTypeRequiresUnitFields;
  const showsLandFields = property.kind !== 'HOUSE';

  function updateField(field: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit() {
    const localErrors: Record<string, string> = {};
    if (!fields.streetName.trim()) localErrors.streetName = 'Street name is required.';
    if (showsHouseFields) {
      if (usesUnitFields) {
        if (!fields.blockName.trim()) localErrors.blockName = 'Block name is required.';
        if (!fields.floorNumber.trim()) localErrors.floorNumber = 'Floor number is required.';
        if (!fields.unitNumber.trim()) localErrors.unitNumber = 'Unit number is required.';
      } else if (!fields.houseNumber.trim()) {
        localErrors.houseNumber = 'House number is required.';
      }
    }
    if (showsLandFields) {
      if (!fields.plotNumber.trim()) localErrors.plotNumber = 'Plot number is required.';
      if (!fields.plotName.trim()) localErrors.plotName = 'Plot name is required.';
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setError('Fix the highlighted fields and try again.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await api.updateProperty(property.id, {
        status,
        name: name.trim() || null,
        streetName: fields.streetName.trim(),
        houseNumber: showsHouseFields && !usesUnitFields ? fields.houseNumber.trim() : null,
        blockName: showsHouseFields && usesUnitFields ? fields.blockName.trim() : null,
        floorNumber: showsHouseFields && usesUnitFields ? fields.floorNumber.trim() : null,
        unitNumber: showsHouseFields && usesUnitFields ? fields.unitNumber.trim() : null,
        plotNumber: showsLandFields ? fields.plotNumber.trim() : null,
        plotName: showsLandFields ? fields.plotName.trim() : null,
      });
      toast.success('Property updated.');
      onSaved(result.property);
      onCancel();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.details && err.details.length > 0) {
          const next: Record<string, string> = {};
          for (const detail of err.details) next[detail.path || 'form'] = detail.message;
          setFieldErrors(next);
        }
        setError(err.message);
      } else {
        setError('Could not save the property.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-(--color-ink-muted)">
        Edit the status, name and typed address fields. The identifier is immutable.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Status">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PropertyStatus)}
            className={selectClass}
          >
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </Field>
        <Field label="Property name" error={fieldErrors.name}>
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Street name (required)" error={fieldErrors.streetName}>
          <input
            className={inputClass}
            value={fields.streetName}
            onChange={(event) => updateField('streetName', event.target.value)}
            maxLength={120}
          />
        </Field>

        {showsHouseFields && usesUnitFields && (
          <>
            <Field label="Block name (required)" error={fieldErrors.blockName}>
              <input
                className={inputClass}
                value={fields.blockName}
                onChange={(event) => updateField('blockName', event.target.value)}
                maxLength={64}
              />
            </Field>
            <Field label="Floor number (required)" error={fieldErrors.floorNumber}>
              <input
                className={inputClass}
                value={fields.floorNumber}
                onChange={(event) => updateField('floorNumber', event.target.value)}
                maxLength={16}
              />
            </Field>
            <Field label="Unit number (required)" error={fieldErrors.unitNumber}>
              <input
                className={inputClass}
                value={fields.unitNumber}
                onChange={(event) => updateField('unitNumber', event.target.value)}
                maxLength={32}
              />
            </Field>
          </>
        )}

        {showsHouseFields && !usesUnitFields && (
          <Field label="House number (required)" error={fieldErrors.houseNumber}>
            <input
              className={inputClass}
              value={fields.houseNumber}
              onChange={(event) => updateField('houseNumber', event.target.value)}
              maxLength={32}
            />
          </Field>
        )}

        {showsLandFields && (
          <>
            <Field label="Plot number (required)" error={fieldErrors.plotNumber}>
              <input
                className={inputClass}
                value={fields.plotNumber}
                onChange={(event) => updateField('plotNumber', event.target.value)}
                maxLength={32}
              />
            </Field>
            <Field label="Plot name (required)" error={fieldErrors.plotName}>
              <input
                className={inputClass}
                value={fields.plotName}
                onChange={(event) => updateField('plotName', event.target.value)}
                maxLength={64}
              />
            </Field>
          </>
        )}
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
