import { useEffect, useState, type FormEvent } from 'react';
import type { EstateDto, PropertyDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { usePropertyOptions, registerableAssetTypes } from '../../api/hooks';
import { Button, Field, inputClass, selectClass } from '../../components/ui';
import { Modal } from '../../components/dialog';

/**
 * Register-property modal, opened from the estate-scoped properties tab.
 *
 * What the form shows is driven entirely by the property-options view:
 *   - type picker only lists `active` + `detailKind === 'PROPERTY'` types
 *     (unit registration is out of scope for Phase 2)
 *   - address fields are rendered from `addressComponents` (key/label,
 *     requiredFor, maxLength, optional pattern)
 *
 * The API is authoritative: identifier derivation, collision checks and
 * type-key validation all happen server-side. The client mirrors required /
 * maxLength / pattern for fast inline feedback only.
 */
export function PropertyRegisterModal({
  estate,
  onClose,
  onCreated,
}: {
  estate: EstateDto;
  onClose: () => void;
  onCreated: (property: PropertyDto) => void;
}) {
  const { view } = usePropertyOptions(true);
  const [typeKey, setTypeKey] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const components = view?.addressComponents ?? [];
  const types = registerableAssetTypes(view);

  useEffect(() => {
    if (types.length > 0) setTypeKey((current) => current || types[0]?.key || '');
  }, [types]);

  function isRequired(componentKey: string): boolean {
    const component = components.find((component) => component.key === componentKey);
    if (!component) return false;
    return component.requiredForLabels.includes(
      view?.assetTypes.find((type) => type.key === typeKey)?.label ?? typeKey,
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!typeKey) {
      setError('Choose a property type to continue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const addressComponents: Record<string, string> = {};
      for (const [key, value] of Object.entries(values)) {
        const trimmed = value.trim();
        if (trimmed) addressComponents[key] = trimmed;
      }
      const result = await api.createProperty({
        estateId: estate.id,
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

  return (
    <Modal
      open
      onClose={onClose}
      title={`Register a property in ${estate.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="property-register-form" disabled={submitting || !typeKey}>
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

        <Field label="Property type" hint="Only active property types are listed.">
          <select
            value={typeKey}
            onChange={(event) => setTypeKey(event.target.value)}
            className={`${selectClass} w-full`}
            aria-label="Property type"
          >
            <option value="" disabled>
              Select a type…
            </option>
            {types.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
        </Field>

        {components.map((component) => {
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
                maxLength={255}
                required={required && view?.identifierConfigured !== false}
                placeholder={component.key}
              />
            </Field>
          );
        })}

        {view && components.length === 0 && (
          <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
            No address components are configured for this organization yet. The identifier is
            derived from the estate slug only — ask an administrator to configure address components
            if you need a finer identifier.
          </p>
        )}
      </form>
    </Modal>
  );
}
