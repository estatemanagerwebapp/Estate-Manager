import { useState, type FormEvent } from 'react';
import { KeyRound, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { PASSWORD_POLICY, validatePasswordPolicy, ROLE_LABELS } from '@silverstone/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiRequestError } from '../api/client';

/**
 * Account page: profile readout, permission summary and the change-password
 * flow. After a successful change the server revokes *all* sessions for
 * this user (including the active one), so the local cache is cleared and
 * the operator signs back in.
 */
export function AccountPage() {
  const { user, clear } = useAuth();

  if (!user) return null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-(--radius-card) border border-slate-200/80 bg-white p-6 shadow-(--shadow-card)">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden size={16} className="text-(--color-primary)" />
          <h2 className="text-sm font-semibold">Profile</h2>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-(--color-ink-muted)">Email</dt>
            <dd className="mt-0.5 font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-(--color-ink-muted)">Role</dt>
            <dd className="mt-0.5 font-medium">{ROLE_LABELS[user.role]}</dd>
          </div>
          <div>
            <dt className="text-xs text-(--color-ink-muted)">Status</dt>
            <dd className="mt-0.5 font-medium">{user.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-(--color-ink-muted)">Password last changed</dt>
            <dd className="mt-0.5 text-(--color-ink-muted)">
              {user.lastPasswordChangedAt
                ? new Date(user.lastPasswordChangedAt).toLocaleDateString()
                : 'Unknown'}
            </dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-slate-200/80 pt-4">
          <h3 className="text-xs font-medium text-(--color-ink-muted)">Permissions</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {user.permissions.map((permission) => (
              <span
                key={permission}
                className="rounded-full bg-(--color-surface) px-2.5 py-1 text-[11px] font-medium text-(--color-ink-muted)"
              >
                {permission}
              </span>
            ))}
          </div>
        </div>
      </section>

      <ChangePasswordForm onDone={() => clear()} />
    </div>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const policyProblems = validatePasswordPolicy(next, PASSWORD_POLICY);
  const mismatch = next.length > 0 && next !== confirm;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (policyProblems.length > 0) return;
    setSubmitting(true);
    try {
      await api.changePassword(current, next);
      // The server revoked every session; sign out and start again.
      onDone();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'UNAUTHORIZED') {
          setError('Current password is incorrect.');
        } else {
          setError(err.message || 'Password change failed.');
        }
      } else {
        setError('Could not reach the server.');
      }
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-(--radius-card) border border-slate-200/80 bg-white p-6 shadow-(--shadow-card)">
      <div className="flex items-center gap-2">
        <KeyRound aria-hidden size={16} className="text-(--color-primary)" />
        <h2 className="text-sm font-semibold">Change password</h2>
      </div>
      <p className="mt-1 text-xs text-(--color-ink-muted)">
        Changing your password signs you out of every device.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
        <PasswordField
          label="Current password"
          value={current}
          onChange={setCurrent}
          show={show}
          onToggleShow={() => setShow((s) => !s)}
          autoComplete="current-password"
          problems={[]}
        />
        <PasswordField
          label="New password"
          value={next}
          onChange={setNext}
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
            current.length === 0 ||
            next.length === 0 ||
            confirm.length === 0 ||
            policyProblems.length > 0 ||
            mismatch
          }
          className="w-full rounded-md bg-(--color-primary) px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
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
    </label>
  );
}
