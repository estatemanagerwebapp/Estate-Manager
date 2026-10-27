import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { type RegisterResidentResponse, type PropertyDto } from '@silverstone/shared';
import type { EstateDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { useToast } from '../toast/Toast';
import { Button, Field, inputClass, selectClass } from '../components/ui';
import { Modal } from '../components/dialog';

/**
 * Register-resident modal.
 *
 * First name + property are required; email/phone are optional and
 * prefilled for the resident (they cannot edit them later). The resident
 * completes their own fields + pays the registration fee at `/onboard`.
 */
export function ResidentRegisterModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: (result: RegisterResidentResponse) => void;
}) {
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [estateId, setEstateId] = useState('');
  const [estates, setEstates] = useState<EstateDto[]>([]);
  const [properties, setProperties] = useState<PropertyDto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listEstates()
      .then((body) => setEstates(body.estates))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!estateId) {
      setProperties([]);
      return;
    }
    void api
      .listProperties({ estateId, pageSize: 200 })
      .then((body) => setProperties(body.properties))
      .catch(() => setProperties([]));
  }, [estateId]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!firstName.trim()) {
      setError('Enter the resident’s first name.');
      return;
    }
    if (!propertyId) {
      setError('Select the property to assign.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.registerResident({
        firstName: firstName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        propertyId,
      });
      onRegistered(result);
      toast.success('Resident registered. Share the onboarding code before closing.');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setError('Property not found.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not register the resident.');
      }
      setSubmitting(false);
    }
  }

  const selectedProperty = properties.find((p) => p.id === propertyId);

  return (
    <Modal
      open
      onClose={onClose}
      title="Register a resident"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !firstName.trim() || !propertyId}
          >
            {submitting ? 'Registering…' : 'Register resident'}
          </Button>
        </>
      }
    >
      <form id="resident-register-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <Field label="First name (required)" hint="The only field required at registration.">
          <input
            className={inputClass}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            maxLength={120}
            required
            placeholder="e.g. Adaeze"
          />
        </Field>

        <Field
          label="Email (optional)"
          hint="Prefilled for the resident; they cannot change it later."
        >
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={255}
            placeholder="name@example.com"
          />
        </Field>

        <Field
          label="Phone (optional)"
          hint="Prefilled for the resident; they cannot change it later."
        >
          <input
            type="tel"
            className={inputClass}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={40}
            placeholder="+234 800 000 0000"
          />
        </Field>

        <Field label="Estate">
          <select
            value={estateId}
            onChange={(event) => {
              setEstateId(event.target.value);
              setPropertyId('');
            }}
            className={`${selectClass} w-full`}
            aria-label="Estate"
          >
            <option value="">Select an estate…</option>
            {estates.map((estate) => (
              <option key={estate.id} value={estate.id}>
                {estate.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Property (required)"
          hint={
            selectedProperty
              ? `Identifier: ${selectedProperty.identifier}`
              : 'Required to assign the resident.'
          }
        >
          <select
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            className={`${selectClass} w-full`}
            disabled={!estateId}
            aria-label="Property"
          >
            <option value="">{estateId ? 'Select a property…' : 'Choose an estate first'}</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.identifier}
                {property.name ? ` — ${property.name}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <p className="text-[11px] leading-relaxed text-(--color-ink-muted)">
          <KeyRound aria-hidden size={12} className="inline" /> A persistent onboarding code is
          generated. Share it with the resident — they open{' '}
          <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">/onboard</code> with the
          code to review their prefilled details, complete their profile, upload their ID, and pay
          the registration fee. Their account is created only after payment is verified.
        </p>
      </form>
    </Modal>
  );
}

/**
 * Display of the freshly-issued onboarding code, with copy-to-clipboard.
 * The code is persistent; the admin may re-share it freely.
 */
export function OnboardingCodePanel({
  result,
  onClose,
}: {
  result: RegisterResidentResponse;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.onboardingCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Onboarding code issued"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-(--color-ink-muted)">
          <strong className="text-(--color-ink)">{result.resident.firstName}</strong> assigned to{' '}
          <strong>
            {result.resident.property.identifier}
            {result.resident.property.name ? ` (${result.resident.property.name})` : ''}
          </strong>
          . Hand them this code — it is persistent and can be reused:
        </p>
        <div className="flex items-center gap-2 rounded-md bg-(--color-primary-soft) px-4 py-3">
          <code className="font-mono text-lg font-semibold tracking-widest text-(--color-primary)">
            {result.onboardingCode}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className="ml-auto rounded border border-(--color-primary) bg-white px-2.5 py-1 text-[11px] font-medium text-(--color-primary) hover:opacity-90"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-[11px] text-(--color-ink-muted)">
          The resident can return and resume onboarding at any time with the same code, until it
          completes or you revoke it.
        </p>
      </div>
    </Modal>
  );
}
