import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Building2, MailWarning, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ApiRequestError } from '../api/client';

/**
 * Login screen. Success → `/app`. Failures map to one of two copy lines:
 * a generic credentials error (the server never says *why*) and a rate-limit
 * message that tells the operator to wait.
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from: string }).from.startsWith('/app')
      ? (location.state as { from: string }).from
      : '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'RATE_LIMITED') {
          setError('Too many sign-in attempts. Wait a moment and try again.');
        } else {
          setError('Incorrect email or password.');
        }
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-(--color-surface) px-4">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--color-primary-soft)">
          <Building2 aria-hidden size={22} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Silverstone Managers</h1>
          <p className="text-xs text-(--color-ink-muted)">Estate management console</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-(--radius-card) border border-slate-200/80 bg-white p-6 shadow-(--shadow-card)"
        noValidate
      >
        <h2 className="text-sm font-semibold text-(--color-ink)">Sign in</h2>
        <p className="mt-1 text-xs text-(--color-ink-muted)">
          Use the credentials issued by your deployment administrator.
        </p>

        {notice && (
          <p
            className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
            role="status"
          >
            {notice}
          </p>
        )}
        {error && (
          <p
            className="mt-4 flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"
            role="alert"
          >
            <MailWarning aria-hidden size={14} />
            {error}
          </p>
        )}

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-(--color-ink-muted)">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@organization.com"
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-(--color-ink-muted)">Password</span>
            <div className="relative mt-1.5">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-(--color-ink-muted) hover:bg-(--color-surface)"
              >
                {showPassword ? <EyeOff aria-hidden size={15} /> : <Eye aria-hidden size={15} />}
              </button>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting || email.length === 0 || password.length === 0}
          className="mt-6 w-full rounded-md bg-(--color-primary) px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="mt-4 text-center text-xs text-(--color-ink-muted)">
          <Link to="/forgot-password" className="underline hover:text-(--color-ink)">
            Forgot your password?
          </Link>
        </p>
      </form>
    </div>
  );
}
