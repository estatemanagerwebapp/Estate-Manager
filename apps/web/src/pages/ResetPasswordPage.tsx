import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Eye, EyeOff } from 'lucide-react';
import { PASSWORD_POLICY, validatePasswordPolicy } from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * New-password screen, reached from the email link
 * (`/reset-password?token=...`).
 *
 * The token is read from the URL query string on mount, *never* from
 * localStorage, and is sent to the server exactly once. On success the
 * browser is redirected to the login screen — no token is retained.
 */
export function ResetPasswordPage() {
  const { clear } = useAuth();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') ?? '', [params]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const policyProblems = validatePasswordPolicy(password, PASSWORD_POLICY);
  const mismatch = password.length > 0 && password !== confirm;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (policyProblems.length > 0) {
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      clear();
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'BAD_REQUEST') {
        setError(
          'This reset link is invalid, was already used, or has expired. Request a new one.',
        );
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <Shell title="Reset your password">
        <div role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          No reset link was provided.
        </div>
        <p className="mt-3 text-xs leading-relaxed text-(--color-ink-muted)">
          Open the link from your password-recovery email, then choose a new password.
        </p>
        <Link
          to="/forgot-password"
          className="mt-5 block w-full rounded-md border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-(--color-ink) hover:bg-(--color-surface)"
        >
          Request a new link
        </Link>
      </Shell>
    );
  }

  if (success) {
    return (
      <Shell title="Password updated">
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700" role="status">
          Your password was changed. All other sign-ins were signed out.
        </p>
        <Link
          to="/login"
          className="mt-5 block w-full rounded-md bg-(--color-primary) px-4 py-2.5 text-center text-sm font-semibold text-white"
        >
          Continue to sign in
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password">
      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          show={show}
          onToggleShow={() => setShow((s) => !s)}
          autoComplete="new-password"
          problems={policyProblems}
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          show={show}
          onToggleShow={() => setShow((s) => !s)}
          autoComplete="new-password"
          problems={mismatch ? ['Passwords do not match'] : []}
        />

        <button
          type="submit"
          disabled={
            submitting ||
            password.length === 0 ||
            confirm.length === 0 ||
            policyProblems.length > 0 ||
            mismatch
          }
          className="w-full rounded-md bg-(--color-primary) px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-(--color-surface) px-4">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--color-primary-soft)">
          <Building2 aria-hidden size={22} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Silverstone Managers</h1>
          <p className="text-xs text-(--color-ink-muted)">{title}</p>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-(--radius-card) border border-slate-200/80 bg-white p-6 shadow-(--shadow-card)">
        {children}
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  problems,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  problems: string[];
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-(--color-ink-muted)">{label}</span>
      <div className="relative mt-1.5">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder="••••••••••••"
          className={`w-full rounded-md border px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-(--color-primary-soft) ${
            problems.length > 0
              ? 'border-rose-300'
              : 'border-slate-300 focus:border-(--color-primary)'
          }`}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-(--color-ink-muted) hover:bg-(--color-surface)"
        >
          {show ? <EyeOff aria-hidden size={15} /> : <Eye aria-hidden size={15} />}
        </button>
      </div>
      {problems.length > 0 && (
        <ul className="mt-1.5 list-inside list-disc text-[11px] text-rose-600">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {value.length === 0 && (
        <p className="mt-1.5 text-[11px] text-(--color-ink-muted)">
          At least {PASSWORD_POLICY.min} characters, with an uppercase, a lowercase and a digit.
        </p>
      )}
    </label>
  );
}
