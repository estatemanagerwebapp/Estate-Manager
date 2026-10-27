import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { EstateDto, PropertyDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { usePropertyOptions } from '../../api/hooks';
import { Button, Field, inputClass, selectClass } from '../../components/ui';
import { Modal } from '../../components/dialog';

/**
 * Register-property modal.
 *
 * The form is driven by the property-options view:
 *   - an estate picker (optional when the caller pre-selects one)
 *   - a three-option property-type radio: Land, House, Both — mapped to the
 *     configured asset type keys `land_plot`, `house`, `both`
 *   - the address components applicable to the chosen type, rendered
 *     dynamically from `addressComponents`
 *   - a required human-facing property name (distinct from the derived
 *     identifier)
 *
 * The API is authoritative: identifier derivation, collision checks, type-key
 * and address-component validation all happen server-side. The client mirrors
 * required / maxLength / pattern for fast inline feedback only.
 */

type PropertyTypeOption = 'land' | 'house' | 'both';

const TYPE_OPTION_TO_ASSET_KEY: Record<PropertyTypeOption, string> = {
  land: 'land_plot',
  house: 'house',
  both: 'both',
};

const TYPE_OPTION_LABELS: Record<PropertyTypeOption, string> = {
  land: 'Land',
  house: 'House',
  both: 'Both (land & house)',
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
  const { view } = usePropertyOptions(true);
  const [estateId, setEstateId] = useState(estate?.id ?? defaultEstateId ?? '');
  const [typeOption, setTypeOption] = useState<PropertyTypeOption>('land');
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const components = view?.addressComponents ?? [];
  const availableEstates = useMemo(() => (estate ? [estate] : (estates ?? [])), [estate, estates]);

  const typeKey = TYPE_OPTION_TO_ASSET_KEY[typeOption];
  const typeLabel = view?.assetTypes.find((type) => type.key === typeKey)?.label ?? typeKey;

  // The three type options are offered only when their asset type key is known
  // to the active configuration.
  const knownAssetKeys = new Set((view?.assetTypes ?? []).map((type) => type.key));

  // The address components that apply to the chosen type: required for it (by
  // label), or required for all, and not excluded from it (by key). Rendered
  // in configuration order.
  const visibleComponents = components.filter((component) => {
    const notApplicable = component.notApplicableFor ?? [];
    if (notApplicable.includes(typeKey)) return false;
    const appliesToAll = (component.requiredForLabels ?? []).length === 0;
    const explicitlyRequired = (component.requiredForLabels ?? []).includes(typeLabel);
    return explicitlyRequired || appliesToAll;
  });

  useEffect(() => {
    setEstateId(
      (current) => current || (availableEstates.length > 0 ? (availableEstates[0]?.id ?? '') : ''),
    );
  }, [availableEstates]);

  function isRequired(componentKey: string): boolean {
    const component = components.find((item) => item.key === componentKey);
    if (!component) return false;
    const notApplicable = component.notApplicableFor ?? [];
    if (notApplicable.includes(typeKey)) return false;
    const appliesToAll = (component.requiredForLabels ?? []).length === 0;
    const explicitlyRequired = (component.requiredForLabels ?? []).includes(typeLabel);
    return explicitlyRequired || appliesToAll;
  }

  async function handleSubmit(event?: FormEvent | React.MouseEvent) {
    event?.preventDefault();
    if (!estateId) {
      setError('Choose an estate to continue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    for (const component of visibleComponents) {
      const value = (values[component.key] ?? '').trim();
      if (isRequired(component.key) && !value) {
        localErrors[component.key] = 'This field is required.';
      } else if (value.length > component.maxLength) {
        localErrors[component.key] = `Use ${component.maxLength} characters or fewer.`;
      } else if (value && component.pattern) {
        try {
          if (!new RegExp(component.pattern).test(value)) {
            localErrors[component.key] = 'Value does not match the required format.';
          }
        } catch {
          localErrors[component.key] = 'This field has an invalid configured format.';
        }
      }
    }
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setError('Fix the highlighted fields and try again.');
      setSubmitting(false);
      return;
    }
    try {
      const addressComponents: Record<string, string> = {};
      for (const [key, rawValue] of Object.entries(values)) {
        const trimmed = rawValue.trim();
        if (trimmed) addressComponents[key] = trimmed;
      }
      const result = await api.createProperty({
        estateId,
        typeKey,
        addressComponents:
          Object.keys(addressComponents).length > 0 ? addressComponents : undefined,
      });
      onCreated(result.property);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'CONFLICT') {
          setError(`Identifier conflict: ${err.message}`);
        } else if (err.details && err.details.length > 0) {
          const next: Record<string, string> = {};
          for (const detail of err.details) {
            const key = detail.path.replace(/^addressComponents\./, '');
            next[key || detail.path] = detail.message;
          }
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
  const missingTypes = (Object.keys(TYPE_OPTION_TO_ASSET_KEY) as PropertyTypeOption[]).filter(
    (option) => !knownAssetKeys.has(TYPE_OPTION_TO_ASSET_KEY[option]),
  );

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
          <Button type="button" onClick={handleSubmit} disabled={submitting || !estateId}>
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
          <Field label="Estate">
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

        <Field label="Property type">
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Property type">
            {(Object.keys(TYPE_OPTION_TO_ASSET_KEY) as PropertyTypeOption[]).map((option) => {
              const assetKey = TYPE_OPTION_TO_ASSET_KEY[option];
              const available = knownAssetKeys.has(assetKey);
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    typeOption === option
                      ? 'border-(--color-primary) bg-(--color-primary-soft)'
                      : 'border-slate-200 bg-(--color-surface) hover:bg-slate-50'
                  } ${available ? '' : 'cursor-not-allowed opacity-50'}`}
                >
                  <input
                    type="radio"
                    name="property-type"
                    value={option}
                    checked={typeOption === option}
                    disabled={!available}
                    onChange={() => setTypeOption(option)}
                    className="accent-(--color-primary)"
                  />
                  <span>{TYPE_OPTION_LABELS[option]}</span>
                  <span className="ml-auto text-[11px] text-(--color-ink-muted)">{assetKey}</span>
                </label>
              );
            })}
          </div>
        </Field>

        {visibleComponents.length === 0 && (
          <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
            No address fields are configured for this type. The identifier is derived from the
            estate slug — ask an administrator to configure address components if you need finer
            identifiers.
          </p>
        )}

        {visibleComponents.map((component) => {
          const required = isRequired(component.key);
          const value = values[component.key] ?? '';
          return (
            <Field
              key={component.key}
              label={`${component.label}${required ? ' (required)' : ''}`}
              hint={
                component.requiredForLabels.length > 0
                  ? `Used for: ${component.requiredForLabels.join(', ')}`
                  : undefined
              }
              error={fieldErrors[component.key]}
            >
              <input
                className={inputClass}
                value={value}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [component.key]: event.target.value }))
                }
                maxLength={component.maxLength}
                placeholder={component.key}
              />
            </Field>
          );
        })}

        {missingTypes.length > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Some property types are not configured for this organization yet; they are disabled.
          </p>
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
