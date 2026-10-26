import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { PASSWORD_POLICY, validatePasswordPolicy } from '@silverstone/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiRequestError } from '../api/client';
import { Card, CardHeader, CardBody, Field, Button } from '../components/ui';

/**
 * Forced first-login password change.
 *
 * Residents who log in with their demo password (`mustChangePassword =
 * true`) are sent here. They must enter the demo password as "current" and
 * choose a new password. After success the server revokes all sessions and
 * the resident signs back in at `/resident/login`.
 */
export function ResidentChangePasswordPage() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

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
      await clear();
      navigate('/resident/login', { replace: true });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiRequestError) {
        if (err.code === 'UNAUTHORIZED') {
          setError('Current password is incorrect.');
        } else {
          setError(err.message || 'Password change failed.');
        }
      } else {
        setError('Could not reach the server.');
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-surface) px-4">
      <Card className="w-full max-w-md">
        <CardHeader
          title="Set your password"
          subtitle="Choose a new password for your resident account."
        />
        <CardBody>
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
            <Field label="Current password">
              <div className="relative mt-1.5">
                <input
                  type={show ? 'text' : 'password'}
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-(--color-ink-muted) hover:bg-(--color-surface)"
                >
                  {show ? <EyeOff aria-hidden size={15} /> : <Eye aria-hidden size={15} />}
                </button>
              </div>
            </Field>
            <Field
              label="New password"
              error={policyProblems.length > 0 ? policyProblems.join(' ') : undefined}
            >
              <div className="relative mt-1.5">
                <input
                  type={show ? 'text' : 'password'}
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-(--color-ink-muted) hover:bg-(--color-surface)"
                >
                  {show ? <EyeOff aria-hidden size={15} /> : <Eye aria-hidden size={15} />}
                </button>
              </div>
              {policyProblems.length > 0 && (
                <ul className="mt-1.5 list-inside list-disc text-[11px] text-rose-600">
                  {policyProblems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </Field>
            <Field
              label="Confirm new password"
              error={mismatch ? 'Passwords do not match' : undefined}
            >
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={
                submitting ||
                current.length === 0 ||
                next.length === 0 ||
                confirm.length === 0 ||
                policyProblems.length > 0 ||
                mismatch
              }
            >
              {submitting ? 'Updating…' : 'Set password'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
