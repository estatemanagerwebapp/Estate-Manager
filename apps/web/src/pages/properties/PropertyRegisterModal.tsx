import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  PROPERTY_KINDS,
  PROPERTY_KIND_LABELS,
  type EstateDto,
  type PropertyDto,
  type PropertyKind,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useHouseTypes } from '../../api/hooks';
import { Button, Field, inputClass, selectClass } from '../../components/ui';
import { Modal } from '../../components/dialog';

/**
 * Register-property modal.
 *
 * Explicit flow: choose the estate (unless fixed), choose House / Land / Both,
 * then only the fields that apply:
 *   - House: house type + street + either house number or block/floor/unit
 *   - Land: street + plot number + plot name
 *   - Both: house fields + land fields
 *
 * The API is authoritative. The client mirrors the same required-field rules
 * for fast inline feedback only.
 */

const EMPTY_FIELDS = {
  streetName: '',
  houseNumber: '',
  blockName: '',
  floorNumber: '',
  unitNumber: '',
  plotNumber: '',
  plotName: '',
};

const MAX_LENGTH = {
  streetName: 120,
  houseNumber: 32,
  blockName: 64,
  floorNumber: 16,
  unitNumber: 32,
  plotNumber: 32,
  plotName: 64,
};

export function PropertyRegisterModal({
  estate,
  estates,
  defaultEstateId,
  onClose,
  onCreated,
}: {
  /** When supplied, the estate is fixed (estate detail tab). */
  estate?: EstateDto;
  /** When supplied, an estate picker is rendered (main properties page). */
  estates?: EstateDto[];
  defaultEstateId?: string;
  onClose: () => void;
  onCreated: (property: PropertyDto) => void;
}) {
  const { view } = useHouseTypes(true);
  const [estateId, setEstateId] = useState(estate?.id ?? defaultEstateId ?? '');
  const [kind, setKind] = useState<PropertyKind | null>(null);
  const [houseType, setHouseType] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [fields, setFields] = useState({ ...EMPTY_FIELDS });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const availableEstates = useMemo(() => (estate ? [estate] : (estates ?? [])), [estate, estates]);
  const activeHouseTypes = useMemo(
    () => (view?.houseTypes ?? []).filter((type) => type.active),
    [view],
  );
  const selectedHouseType = activeHouseTypes.find((type) => type.key === houseType) ?? null;
  const requiresUnitFields = selectedHouseType?.requiresUnitFields ?? false;
  const showsHouseFields = kind === 'HOUSE' || kind === 'BOTH';
  const showsLandFields = kind === 'LAND' || kind === 'BOTH';

  useEffect(() => {
    setEstateId(
      (current) => current || (availableEstates.length > 0 ? (availableEstates[0]?.id ?? '') : ''),
    );
  }, [availableEstates]);

  useEffect(() => {
    if (!showsHouseFields) {
      setHouseType(null);
      return;
    }
    setHouseType((current) => {
      if (current && activeHouseTypes.some((type) => type.key === current)) return current;
      return activeHouseTypes[0]?.key ?? null;
    });
  }, [showsHouseFields, activeHouseTypes]);

  function chooseKind(next: PropertyKind) {
    setKind(next);
    setFieldErrors({});
    setError(null);
    setFields((current) => ({
      ...current,
      ...(next === 'HOUSE' ? { plotNumber: '', plotName: '' } : {}),
      ...(next === 'LAND'
        ? { houseNumber: '', blockName: '', floorNumber: '', unitNumber: '' }
        : {}),
    }));
    if (next === 'LAND') setHouseType(null);
  }

  function chooseHouseType(next: string) {
    setHouseType(next);
    const requiresUnits = activeHouseTypes.find((type) => type.key === next)?.requiresUnitFields;
    setFields((current) => ({
      ...current,
      ...(requiresUnits ? { houseNumber: '' } : { blockName: '', floorNumber: '', unitNumber: '' }),
    }));
  }

  function updateField(field: keyof typeof EMPTY_FIELDS, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  function localValidation(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!estateId) errors.estateId = 'Choose an estate.';
    if (!kind) errors.kind = 'Choose a property type.';
    if (showsHouseFields && !houseType) errors.houseType = 'Choose a house type.';
    if (!fields.streetName.trim()) errors.streetName = 'Street name is required.';
    if (fields.streetName.trim().length > MAX_LENGTH.streetName) {
      errors.streetName = 'Use 120 characters or fewer.';
    }

    if (showsHouseFields) {
      if (requiresUnitFields) {
        if (!fields.blockName.trim()) errors.blockName = 'Block name is required.';
        if (!fields.floorNumber.trim()) errors.floorNumber = 'Floor number is required.';
        if (!fields.unitNumber.trim()) errors.unitNumber = 'Unit number is required.';
      } else if (!fields.houseNumber.trim()) {
        errors.houseNumber = 'House number is required.';
      }
    }

    if (showsLandFields) {
      if (!fields.plotNumber.trim()) errors.plotNumber = 'Plot number is required.';
      if (!fields.plotName.trim()) errors.plotName = 'Plot name is required.';
    }

    for (const [field, max] of Object.entries(MAX_LENGTH) as Array<
      [keyof typeof MAX_LENGTH, number]
    >) {
      if (fields[field].trim().length > max) errors[field] = `Use ${max} characters or fewer.`;
    }
    return errors;
  }

  async function handleSubmit(event?: FormEvent | React.MouseEvent) {
    event?.preventDefault();
    const errors = localValidation();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Fix the highlighted fields and try again.');
      return;
    }
    if (!kind) return;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await api.createProperty({
        estateId,
        kind,
        houseType: showsHouseFields ? houseType : null,
        name: name.trim() || undefined,
        streetName: fields.streetName.trim(),
        houseNumber: showsHouseFields && !requiresUnitFields ? fields.houseNumber.trim() : null,
        blockName: showsHouseFields && requiresUnitFields ? fields.blockName.trim() : null,
        floorNumber: showsHouseFields && requiresUnitFields ? fields.floorNumber.trim() : null,
        unitNumber: showsHouseFields && requiresUnitFields ? fields.unitNumber.trim() : null,
        plotNumber: showsLandFields ? fields.plotNumber.trim() : null,
        plotName: showsLandFields ? fields.plotName.trim() : null,
      });
      onCreated(result.property);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'CONFLICT') {
          setError(`Identifier conflict: ${err.message}`);
        } else if (err.details && err.details.length > 0) {
          const next: Record<string, string> = {};
          for (const detail of err.details) next[detail.path || 'form'] = detail.message;
          setFieldErrors(next);
          setError('Fix the highlighted fields and try again.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Could not register the property.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectedEstate = availableEstates.find((item) => item.id === estateId);

  return (
    <Modal
      open
      onClose={onClose}
      title={estate ? `Register a property in ${estate.name}` : 'Register a property'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !estateId || !kind}>
            {submitting ? 'Registering…' : 'Register property'}
          </Button>
        </>
      }
    >
      <form id="property-register-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        {!estate && (
          <Field label="Estate" error={fieldErrors.estateId}>
            <select
              value={estateId}
              onChange={(event) => setEstateId(event.target.value)}
              className={`${selectClass} w-full`}
              aria-label="Choose an estate"
            >
              <option value="" disabled>
                Select an estate…
              </option>
              {availableEstates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Property type" error={fieldErrors.kind}>
          <select
            value={kind ?? ''}
            onChange={(event) => chooseKind(event.target.value as PropertyKind)}
            className={`${selectClass} w-full`}
            required
          >
            <option value="" disabled>
              Select a property type…
            </option>
            {PROPERTY_KINDS.map((option) => (
              <option key={option} value={option}>
                {PROPERTY_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>

        {showsHouseFields && (
          <Field label="House type" error={fieldErrors.houseType}>
            <select
              value={houseType ?? ''}
              onChange={(event) => chooseHouseType(event.target.value)}
              className={`${selectClass} w-full`}
              aria-label="House type"
              required
              disabled={activeHouseTypes.length === 0}
            >
              <option value="" disabled>
                Select a house type…
              </option>
              {activeHouseTypes.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
            {activeHouseTypes.length === 0 && (
              <span className="text-[11px] text-(--color-ink-muted)">
                No house types are configured yet.
              </span>
            )}
          </Field>
        )}

        {kind && (
          <>
            <Field label="Street name (required)" error={fieldErrors.streetName}>
              <input
                className={inputClass}
                value={fields.streetName}
                onChange={(event) => updateField('streetName', event.target.value)}
                maxLength={MAX_LENGTH.streetName}
                placeholder="e.g. Court A"
              />
            </Field>

            {showsHouseFields && requiresUnitFields && (
              <>
                <Field label="Block name (required)" error={fieldErrors.blockName}>
                  <input
                    className={inputClass}
                    value={fields.blockName}
                    onChange={(event) => updateField('blockName', event.target.value)}
                    maxLength={MAX_LENGTH.blockName}
                    placeholder="e.g. Block 03"
                  />
                </Field>
                <Field label="Floor number (required)" error={fieldErrors.floorNumber}>
                  <input
                    className={inputClass}
                    value={fields.floorNumber}
                    onChange={(event) => updateField('floorNumber', event.target.value)}
                    maxLength={MAX_LENGTH.floorNumber}
                    placeholder="e.g. 03"
                  />
                </Field>
                <Field label="Unit number (required)" error={fieldErrors.unitNumber}>
                  <input
                    className={inputClass}
                    value={fields.unitNumber}
                    onChange={(event) => updateField('unitNumber', event.target.value)}
                    maxLength={MAX_LENGTH.unitNumber}
                    placeholder="e.g. 01"
                  />
                </Field>
              </>
            )}

            {showsHouseFields && !requiresUnitFields && (
              <Field label="House number (required)" error={fieldErrors.houseNumber}>
                <input
                  className={inputClass}
                  value={fields.houseNumber}
                  onChange={(event) => updateField('houseNumber', event.target.value)}
                  maxLength={MAX_LENGTH.houseNumber}
                  placeholder="e.g. 12"
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
                    maxLength={MAX_LENGTH.plotNumber}
                    placeholder="e.g. 14"
                  />
                </Field>
                <Field label="Plot name (required)" error={fieldErrors.plotName}>
                  <input
                    className={inputClass}
                    value={fields.plotName}
                    onChange={(event) => updateField('plotName', event.target.value)}
                    maxLength={MAX_LENGTH.plotName}
                    placeholder="e.g. North Plot"
                  />
                </Field>
              </>
            )}

            <Field label="Property name (optional)" error={fieldErrors.name}>
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                placeholder="e.g. Onyx Residence"
              />
            </Field>
          </>
        )}

        {selectedEstate && !estate && (
          <p className="text-[11px] text-(--color-ink-muted)">
            Registering into {selectedEstate.name}
          </p>
        )}
      </form>
    </Modal>
  );
}
