import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import {
  PROPERTY_KINDS,
  PROPERTY_KIND_LABELS,
  type PropertyKind,
  type RegisterResidentResponse,
} from '@silverstone/shared';
import type { EstateDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { useApiQuery } from '../api/query';
import { useHouseTypes } from '../api/hooks';
import { useToast } from '../toast/Toast';
import { Button, Field, inputClass, selectClass } from '../components/ui';
import { Modal } from '../components/dialog';

const onboardingInputClass = `${inputClass} !text-base`;
const onboardingSelectClass = `${selectClass} w-full !text-base`;

/**
 * Register-resident modal.
 *
 * Resident and property are registered together so an onboarding draft never
 * leaves an unassigned property behind. The resident completes their own
 * fields and pays the registration fee at `/onboard`.
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
  const [accountMatch, setAccountMatch] = useState<{
    id: string;
    email: string;
    fullName: string | null;
    propertyCount: number;
  } | null>(null);
  const [linkToExistingAccount, setLinkToExistingAccount] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [phone, setPhone] = useState('');
  const [estateId, setEstateId] = useState('');
  const [kind, setKind] = useState<PropertyKind | ''>('');
  const [houseType, setHouseType] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [streetName, setStreetName] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [blockName, setBlockName] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [plotName, setPlotName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { view: houseTypesView } = useHouseTypes(true);
  const houseTypes = (houseTypesView?.houseTypes ?? []).filter((item) => item.active);
  const selectedHouseType = houseTypes.find((item) => item.key === houseType);
  const usesUnitFields = selectedHouseType?.requiresUnitFields ?? false;
  const showsHouseFields = kind === 'HOUSE' || kind === 'BOTH';
  const showsLandFields = kind === 'LAND' || kind === 'BOTH';

  // Both pickers share the caches used by the main register screens. The
  // unfiltered estates key is the same one the Estates list page uses.
  const { data: estateData } = useApiQuery(
    ['estates', {}],
    () => api.listEstates(),
    'Could not load estates.',
  );
  const estates: EstateDto[] = estateData?.estates ?? [];

  useEffect(() => {
    if (showsHouseFields && !houseType && houseTypes.length > 0) {
      setHouseType(houseTypes[0]!.key);
    }
  }, [showsHouseFields, houseType, houseTypes]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!firstName.trim()) {
      setError('Enter the resident’s first name.');
      return;
    }
    if (!estateId || !kind || !streetName.trim()) {
      setError('Complete the estate and property details.');
      return;
    }
    if (showsHouseFields && !houseType) {
      setError('Select a house type.');
      return;
    }
    if (
      showsHouseFields &&
      (usesUnitFields
        ? !blockName.trim() || !floorNumber.trim() || !unitNumber.trim()
        : !houseNumber.trim())
    ) {
      setError('Complete the required house address fields.');
      return;
    }
    if (showsLandFields && (!plotNumber.trim() || !plotName.trim())) {
      setError('Enter the plot number and plot name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.registerResident({
        firstName: firstName.trim(),
        email: email.trim() || null,
        ...(linkToExistingAccount && accountMatch ? { existingResidentUserId: accountMatch.id } : {}),
        phone: phone.trim() || null,
        property: {
          estateId,
          kind,
          houseType: showsHouseFields ? houseType : null,
          name: propertyName.trim() || undefined,
          streetName: streetName.trim(),
          houseNumber: showsHouseFields && !usesUnitFields ? houseNumber.trim() : null,
          blockName: showsHouseFields && usesUnitFields ? blockName.trim() : null,
          floorNumber: showsHouseFields && usesUnitFields ? floorNumber.trim() : null,
          unitNumber: showsHouseFields && usesUnitFields ? unitNumber.trim() : null,
          plotNumber: showsLandFields ? plotNumber.trim() : null,
          plotName: showsLandFields ? plotName.trim() : null,
        },
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
            disabled={submitting || !firstName.trim() || !estateId || !kind}
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
            className={onboardingInputClass}
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
            className={onboardingInputClass}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setAccountMatch(null);
              setLinkToExistingAccount(false);
            }}
            onBlur={() => {
              const normalized = email.trim().toLowerCase();
              if (!normalized || !normalized.includes('@')) return;
              setCheckingAccount(true);
              void api
                .findResidentAccountMatch(normalized)
                .then((result) => setAccountMatch(result.match))
                .catch(() => setAccountMatch(null))
                .finally(() => setCheckingAccount(false));
            }}
            maxLength={255}
            placeholder="name@example.com"
          />
        </Field>

        {checkingAccount && <p className="text-xs text-(--color-ink-muted)">Checking for an existing resident account…</p>}
        {accountMatch && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
            <p className="text-sm font-medium text-(--color-ink)">
              Existing resident account found: {accountMatch.fullName || accountMatch.email}
            </p>
            <p className="mt-1 text-xs text-(--color-ink-muted)">
              {accountMatch.propertyCount} linked {accountMatch.propertyCount === 1 ? 'property' : 'properties'}.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={linkToExistingAccount}
                onChange={(event) => setLinkToExistingAccount(event.target.checked)}
                className="mt-0.5"
              />
              <span>Confirm this is the same resident and add this property to their account.</span>
            </label>
          </div>
        )}

        <Field
          label="Phone (optional)"
          hint="Prefilled for the resident; they cannot change it later."
        >
          <input
            type="tel"
            className={onboardingInputClass}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={40}
            placeholder="+234 800 000 0000"
          />
        </Field>

        <Field label="Estate (required)">
          <select
            value={estateId}
            onChange={(event) => {
              setEstateId(event.target.value);
            }}
            className={onboardingSelectClass}
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

        <Field label="Property type (required)">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as PropertyKind | '')}
            className={onboardingSelectClass}
            aria-label="Property type"
          >
            <option value="">Select a type…</option>
            {PROPERTY_KINDS.map((value) => (
              <option key={value} value={value}>
                {PROPERTY_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        {showsHouseFields && (
          <Field label="House type (required)">
            <select
              value={houseType}
              onChange={(event) => setHouseType(event.target.value)}
              className={onboardingSelectClass}
              aria-label="House type"
            >
              <option value="">Select a house type…</option>
              {houseTypes.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Property name (optional)">
          <input
            className={onboardingInputClass}
            value={propertyName}
            onChange={(event) => setPropertyName(event.target.value)}
            maxLength={120}
            placeholder="e.g. Block A, Unit 4"
          />
        </Field>
        {kind && (
          <>
            <Field label="Street name (required)">
              <input
                className={onboardingInputClass}
                value={streetName}
                onChange={(event) => setStreetName(event.target.value)}
                maxLength={120}
                required
              />
            </Field>
            {showsHouseFields &&
              (usesUnitFields ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Block (required)">
                    <input
                      className={onboardingInputClass}
                      value={blockName}
                      onChange={(event) => setBlockName(event.target.value)}
                      maxLength={64}
                    />
                  </Field>
                  <Field label="Floor (required)">
                    <input
                      className={onboardingInputClass}
                      value={floorNumber}
                      onChange={(event) => setFloorNumber(event.target.value)}
                      maxLength={16}
                    />
                  </Field>
                  <Field label="Unit (required)">
                    <input
                      className={onboardingInputClass}
                      value={unitNumber}
                      onChange={(event) => setUnitNumber(event.target.value)}
                      maxLength={32}
                    />
                  </Field>
                </div>
              ) : (
                <Field label="House number (required)">
                  <input
                    className={onboardingInputClass}
                    value={houseNumber}
                    onChange={(event) => setHouseNumber(event.target.value)}
                    maxLength={32}
                  />
                </Field>
              ))}
            {showsLandFields && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Plot number (required)">
                  <input
                    className={onboardingInputClass}
                    value={plotNumber}
                    onChange={(event) => setPlotNumber(event.target.value)}
                    maxLength={32}
                  />
                </Field>
                <Field label="Plot name (required)">
                  <input
                    className={onboardingInputClass}
                    value={plotName}
                    onChange={(event) => setPlotName(event.target.value)}
                    maxLength={64}
                  />
                </Field>
              </div>
            )}
          </>
        )}

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
