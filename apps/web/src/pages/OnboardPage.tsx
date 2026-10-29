import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  UserRound,
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
} from 'lucide-react';
import {
  GENDERS,
  MARITAL_STATUSES,
  RESIDENT_ID_TYPES,
  type OnboardingGuestView,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { Button, inputClass, selectClass } from '../components/ui';
import { PaymentDetailsPanel } from '../components/PaymentDetails';
import { Modal } from '../components/dialog';

/**
 * Public resident onboarding wizard. Reached via `/onboard?code=...` with
 * no session required.
 *
 * Steps:
 *   0 — code entry (persistent; no TTL, no attempt cap)
 *   1 — review prefilled details (name / email / phone / property)
 *   2 — complete remaining fields (gender, marital, property type, next of kin)
 *   3 — choose ID type + upload ID document
 *   4 — payment status + complete
 *
 * Every step autosaves; the resident can leave and return with the same
 * code at any time. The account is created only after payment is PAID.
 */

type WizardStep = 0 | 1 | 2 | 3 | 4;

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

const MARITAL_LABELS: Record<string, string> = {
  SINGLE: 'Single',
  MARRIED: 'Married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
};

const ID_TYPE_LABELS: Record<string, string> = {
  NATIONAL_ID: 'National ID (NIN)',
  DRIVER_LICENSE: 'Driver’s License',
  INTERNATIONAL_PASSPORT: 'International Passport',
  VOTERS_CARD: 'Voter’s Card',
  BIRTH_CERTIFICATE: 'Birth Certificate',
  CAC_CERTIFICATE: 'CAC Certificate',
};

export function OnboardPage() {
  const [params] = useSearchParams();
  const initialCode = params.get('code') ?? '';

  const [code, setCode] = useState(initialCode);
  const [view, setView] = useState<OnboardingGuestView | null>(null);
  const [step, setStep] = useState<WizardStep>(0);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  // Step 2: local form state (autosaved on step submit)
  const [gender, setGender] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [nokName, setNokName] = useState('');
  const [nokPhone, setNokPhone] = useState('');
  const [nokEmail, setNokEmail] = useState('');

  // Step 3: ID upload
  const [idType, setIdType] = useState('');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 4: payment / complete
  const [paymentNote, setPaymentNote] = useState('');
  const [completing, setCompleting] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [completed, setCompleted] = useState<{ demoPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate local state from the loaded draft.
  useEffect(() => {
    if (!view) return;
    const r = view.resident;
    setGender(r.gender ?? '');
    setMaritalStatus(r.maritalStatus ?? '');
    setPropertyType(r.propertyType ?? '');
    setNokName(r.nextOfKinName ?? '');
    setNokPhone(r.nextOfKinPhone ?? '');
    setNokEmail(r.nextOfKinEmail ?? '');
    setIdType(r.idType ?? '');
    setIdDocUrl(r.idDocumentUrl);
    setPaymentNote(r.paymentRef ?? '');
  }, [view]);

  // Hydrate from code if pre-filled in the URL.
  useEffect(() => {
    if (initialCode) void lookup(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(rawCode: string) {
    setCodeLoading(true);
    setCodeError(null);
    try {
      const body = await api.getOnboardingByCode(rawCode.trim());
      setView(body);
      setStep(1);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setCodeError('This onboarding code was not found. Double-check with your administrator.');
      } else {
        setCodeError(
          err instanceof ApiRequestError ? err.message : 'Could not load your onboarding.',
        );
      }
    } finally {
      setCodeLoading(false);
    }
  }

  async function saveDraft(fields: Record<string, string | null>) {
    if (!view) return;
    try {
      const updated = await api.saveOnboardingDraft(code, {
        code,
        gender: fields.gender ?? null,
        maritalStatus: fields.maritalStatus ?? null,
        propertyType: fields.propertyType ?? null,
        nextOfKinName: fields.nokName ?? null,
        nextOfKinPhone: fields.nokPhone ?? null,
        nextOfKinEmail: fields.nokEmail ?? null,
        idType: fields.idType ?? null,
        idDocumentUrl: fields.idDocUrl ?? null,
      });
      setView((current) =>
        current
          ? {
              ...current,
              resident: {
                ...updated.resident,
                property: current.resident.property,
              },
            }
          : null,
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save your progress.');
    }
  }

  function goStep2() {
    void saveDraft({
      gender,
      maritalStatus,
      propertyType,
      nokName,
      nokPhone,
      nokEmail,
    });
    setStep(3);
  }

  function goStep3() {
    void saveDraft({ idType, idDocUrl });
    setStep(4);
  }

  async function uploadId() {
    if (!idFile || !code) return;
    setUploading(true);
    setError(null);
    try {
      const result = await api.uploadIdDocument(code, idFile);
      setIdDocUrl(result.publicUrl);
      await saveDraft({ idType, idDocUrl: result.publicUrl });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not upload your ID document.');
    } finally {
      setUploading(false);
    }
  }

  async function complete() {
    setCompleting(true);
    setError(null);
    try {
      const result = await api.completeOnboarding(code);
      setCompleted({ demoPassword: result.demoPassword });
      setStep(5 as WizardStep);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'PAYMENT_REQUIRED') {
        setError('Your registration fee has not been confirmed yet. Contact your administrator.');
      } else if (err instanceof ApiRequestError && err.code === 'VALIDATION_ERROR') {
        const missing = (err.details ?? [])
          .map((detail) => detail.path.replace('body.', ''))
          .join(', ');
        setError(
          `Please complete these fields before continuing: ${missing || 'all required fields'}.`,
        );
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not complete onboarding.');
      }
      setCompleting(false);
    }
  }

  /**
   * Temporary walk-through while the payment gateway is not connected: record
   * the reference the resident paid with, then acknowledge the submission. The
   * draft stays UNPAID; an administrator confirms it on the Residents screen.
   * Nothing is completed or created here.
   */
  async function submitPaymentNote() {
    setSubmittingNote(true);
    setError(null);
    try {
      const result = await api.submitPaymentNote(code, paymentNote.trim());
      setView((current) => (current ? { ...current, resident: result.resident } : current));
      setPaymentSubmitted(true);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Could not submit your payment note.',
      );
    } finally {
      setSubmittingNote(false);
    }
  }

  // --- Success screen (demo password shown once) --------------------------------

  if (completed) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 aria-hidden size={24} />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Account created</h1>
          <p className="mt-1 max-w-sm text-sm text-(--color-ink-muted)">
            Your account is ready. Use this temporary password to sign in, then you will be asked to
            set your own:
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-md bg-(--color-primary-soft) px-5 py-3">
            <code className="font-mono text-lg font-semibold tracking-widest text-(--color-primary)">
              {completed.demoPassword}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(completed.demoPassword)}
              className="ml-auto rounded border border-(--color-primary) bg-white px-2.5 py-1 text-[11px] font-medium text-(--color-primary)"
            >
              Copy
            </button>
          </div>
          <p className="mt-3 text-[11px] text-(--color-ink-muted)">
            It will not be shown again. You will be prompted to change it at first sign-in.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-(--color-primary) px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Sign in
            <ArrowRight aria-hidden size={14} />
          </Link>
        </div>
      </Shell>
    );
  }

  // --- Code entry (step 0) -------------------------------------------------------

  if (step === 0) {
    return (
      <Shell>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void lookup(code);
          }}
          className="flex flex-col gap-4"
        >
          {codeError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              <AlertTriangle aria-hidden size={14} className="mt-0.5 shrink-0" />
              {codeError}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-(--color-ink-muted)" htmlFor="code">
              Onboarding code
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. 7K4QW9X2M5"
              maxLength={64}
              required
              autoFocus
              className={inputClass}
            />
          </div>
          <Button type="submit" disabled={codeLoading || code.trim().length === 0}>
            {codeLoading ? 'Loading…' : 'Continue'}
          </Button>
          <p className="text-[11px] text-(--color-ink-muted)">
            Your code is persistent — you can leave and come back anytime.
          </p>
        </form>
      </Shell>
    );
  }

  const resident = view!.resident;

  // --- Review step (step 1) -------------------------------------------------------

  if (step === 1) {
    return (
      <Shell>
        <StepHeader
          step={1}
          total={4}
          title="Review your details"
          subtitle="These were provided by your administrator and cannot be changed here."
        />

        <ReadonlyCard title="Your details">
          <Row label="First name" value={resident.firstName} />
          {resident.email && <Row label="Email" value={resident.email} />}
          {resident.phone && <Row label="Phone" value={resident.phone} />}
        </ReadonlyCard>

        <ReadonlyCard title="Your property">
          <Row label="Property" value={resident.property.identifier} />
          {resident.property.name && <Row label="Name" value={resident.property.name} />}
          <Row label="Estate" value={resident.property.estate.name} />
        </ReadonlyCard>

        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs text-(--color-ink-muted)">Step 1 of 4</span>
          <Button onClick={() => setStep(2)}>
            Continue
            <ArrowRight aria-hidden size={14} />
          </Button>
        </div>
      </Shell>
    );
  }

  // --- Profile step (step 2) ------------------------------------------------------

  if (step === 2) {
    const stepComplete = !!(gender && maritalStatus && nokName.trim() && nokPhone.trim());
    return (
      <Shell>
        <StepHeader
          step={2}
          total={4}
          title="Complete your profile"
          subtitle="This information is used for your resident record."
        />

        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Gender" required>
              <select
                value={gender}
                onChange={(event) => setGender(event.target.value)}
                className={`${selectClass} w-full`}
              >
                <option value="">Select…</option>
                {GENDERS.map((value) => (
                  <option key={value} value={value}>
                    {GENDER_LABELS[value] ?? value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Marital status" required>
              <select
                value={maritalStatus}
                onChange={(event) => setMaritalStatus(event.target.value)}
                className={`${selectClass} w-full`}
              >
                <option value="">Select…</option>
                {MARITAL_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {MARITAL_LABELS[value] ?? value}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {resident.propertyType && (
            <Field label="Property type">
              <input
                value={resident.propertyType}
                disabled
                className={`${inputClass} opacity-60`}
              />
            </Field>
          )}

          <div className="rounded-md border border-slate-200 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-(--color-ink-muted)">
              <UserRound aria-hidden size={14} /> Next of kin
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Full name" required>
                <input
                  value={nokName}
                  onChange={(event) => setNokName(event.target.value)}
                  maxLength={160}
                  className={inputClass}
                  placeholder="e.g. Chike Okafor"
                />
              </Field>
              <Field label="Phone" required>
                <input
                  type="tel"
                  value={nokPhone}
                  onChange={(event) => setNokPhone(event.target.value)}
                  maxLength={40}
                  className={inputClass}
                  placeholder="+234 800 000 0000"
                />
              </Field>
              <Field label="Email" hint="Optional">
                <input
                  type="email"
                  value={nokEmail}
                  onChange={(event) => setNokEmail(event.target.value)}
                  maxLength={255}
                  className={inputClass}
                  placeholder="kin@example.com"
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-1 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
          >
            <ArrowLeft aria-hidden size={14} />
            Back
          </button>
          <Button onClick={goStep2} disabled={!stepComplete}>
            Continue
            <ArrowRight aria-hidden size={14} />
          </Button>
        </div>
      </Shell>
    );
  }

  // --- ID document step (step 3) ---------------------------------------------------

  if (step === 3) {
    const stepComplete = !!(idType && idDocUrl);
    return (
      <Shell>
        <StepHeader
          step={3}
          total={4}
          title="Upload your ID"
          subtitle="Select the type of government ID you have, then upload a photo or scan."
        />

        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <Field label="ID type" required>
            <select
              value={idType}
              onChange={(event) => setIdType(event.target.value)}
              className={`${selectClass} w-full`}
            >
              <option value="">Select your ID type…</option>
              {RESIDENT_ID_TYPES.map((value) => (
                <option key={value} value={value}>
                  {ID_TYPE_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-(--color-ink-muted)">
              ID document <span className="text-rose-500">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => setIdFile(event.target.files?.[0] ?? null)}
              className="hidden"
              id="id-file-input"
            />
            {idDocUrl ? (
              <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
                <CheckCircle2 aria-hidden size={16} className="text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">ID document uploaded</span>
                <button
                  type="button"
                  onClick={() => {
                    setIdDocUrl(null);
                    setIdFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="ml-auto text-(--color-ink-muted) hover:text-rose-600"
                  aria-label="Remove uploaded file"
                >
                  <X aria-hidden size={14} />
                </button>
              </div>
            ) : (
              <label
                htmlFor="id-file-input"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-slate-300 px-6 py-8 text-center transition-colors hover:border-(--color-primary)"
              >
                <Upload aria-hidden size={20} className="text-(--color-ink-muted)" />
                <span className="text-xs font-medium text-(--color-ink-muted)">
                  Click to choose a file (image or PDF, up to 5 MB)
                </span>
              </label>
            )}
            {idFile && !idDocUrl && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-(--color-ink-muted)">
                  {idFile.name} ({(idFile.size / 1024).toFixed(0)} KB)
                </span>
                <Button onClick={() => void uploadId()} disabled={uploading} size="sm">
                  {uploading ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(2)}
            className="inline-flex items-center gap-1 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
          >
            <ArrowLeft aria-hidden size={14} />
            Back
          </button>
          <Button onClick={goStep3} disabled={!stepComplete}>
            Continue
            <ArrowRight aria-hidden size={14} />
          </Button>
        </div>
      </Shell>
    );
  }

  // --- Payment + complete step (step 4) ----------------------------------------------

  const paid = resident.paymentStatus === 'PAID';

  return (
    <Shell>
      <StepHeader
        step={4}
        total={4}
        title="Registration fee"
        subtitle={
          paid
            ? 'Payment confirmed — you can complete onboarding now.'
            : 'Complete your profile and ID upload, then your administrator will confirm your payment.'
        }
      />

      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div
        className={`flex items-center gap-3 rounded-md px-4 py-3 ${
          paid ? 'bg-emerald-50' : 'bg-amber-50'
        }`}
      >
        <CreditCard
          aria-hidden
          size={18}
          className={paid ? 'text-emerald-600' : 'text-amber-600'}
        />
        <div>
          <p className={`text-sm font-medium ${paid ? 'text-emerald-700' : 'text-amber-700'}`}>
            {paid ? 'Payment confirmed' : 'Awaiting payment confirmation'}
          </p>
          <p className={`text-xs ${paid ? 'text-emerald-600' : 'text-amber-600'}`}>
            {view!.registrationFee.amountKobo > 0
              ? `Registration fee: ₦${(view!.registrationFee.amountKobo / 100).toLocaleString()}`
              : 'No fee configured'}
          </p>
        </div>
      </div>

      {!paid && view!.paymentDetails && (
        <div className="mt-4">
          <PaymentDetailsPanel details={view!.paymentDetails} />
        </div>
      )}

      {!paid && (
        <div className="mt-4 rounded-md border border-slate-200 p-4">
          <label className="mb-1.5 block text-xs font-medium text-(--color-ink-muted)">
            Payment reference (if you paid out-of-band)
          </label>
          <input
            value={paymentNote}
            onChange={(event) => setPaymentNote(event.target.value)}
            placeholder="e.g. transfer receipt / reference number"
            maxLength={120}
            className={inputClass}
          />
          <p className="mt-2 text-[11px] text-(--color-ink-muted)">
            Submit this so your administrator can verify and confirm your payment.
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep(3)}
          className="inline-flex items-center gap-1 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
        >
          <ArrowLeft aria-hidden size={14} />
          Back
        </button>
        <Button
          onClick={() => (paid ? void complete() : void submitPaymentNote())}
          disabled={completing || submittingNote || (!paid && !paymentNote.trim())}
        >
          {paid
            ? completing
              ? 'Completing…'
              : 'Complete onboarding'
            : submittingNote
              ? 'Submitting…'
              : 'Submit payment note'}
        </Button>
      </div>
      {!paid && (
        <p className="mt-2 text-right text-[11px] text-(--color-ink-muted)">
          Onboarding will complete automatically once your payment is confirmed.
        </p>
      )}

      <Modal
        open={paymentSubmitted}
        onClose={() => setPaymentSubmitted(false)}
        title="Submission received"
        footer={<Button onClick={() => setPaymentSubmitted(false)}>Got it</Button>}
      >
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 aria-hidden size={22} />
          </span>
          <p className="mt-3 text-sm font-medium text-(--color-ink)">Submission received</p>
          <p className="mt-1 max-w-sm text-sm text-(--color-ink-muted)">
            You will receive an email shortly to confirm your onboarding. Your administrator will
            verify the payment reference you provided.
          </p>
        </div>
      </Modal>
    </Shell>
  );
}

// --- Layout helpers -----------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
          <Building2 aria-hidden size={20} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Resident onboarding</h1>
          <p className="text-xs text-(--color-ink-muted)">
            Enter the code your administrator shared with you.
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function StepHeader({
  step,
  total,
  title,
  subtitle,
}: {
  step: number;
  total: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5">
      <div className="mb-3 flex gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full ${
              index < step ? 'bg-(--color-primary)' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-(--color-ink-muted)">{subtitle}</p>
    </div>
  );
}

function ReadonlyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-(--color-ink-muted)">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-(--color-ink-muted)">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
        {hint && <span className="ml-1 font-normal text-slate-400">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
