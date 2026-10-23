import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, MailQuestion } from 'lucide-react';
import { api } from '../api/client';

/**
 * Password recovery request. The response is intentionally identical for
 * known and unknown addresses (server policy: no account enumeration), so
 * this screen always shows the same "check your inbox" confirmation.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
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
          <p className="text-xs text-(--color-ink-muted)">Password recovery</p>
        </div>
      </div>

      <div className="w-full max-w-sm rounded-(--radius-card) border border-slate-200/80 bg-white p-6 shadow-(--shadow-card)">
        {submitted ? (
          <div role="status">
            <div className="flex items-center gap-2">
              <MailQuestion aria-hidden size={18} className="text-(--color-primary)" />
              <h2 className="text-sm font-semibold text-(--color-ink)">Check your inbox</h2>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-(--color-ink-muted)">
              If an account exists for{' '}
              <span className="font-medium text-(--color-ink)">{email}</span>, a password reset link
              has been sent. The link is single-use and expires after a short window. If you do not
              receive an email, check spam or contact your deployment administrator.
            </p>
            <Link
              to="/login"
              className="mt-5 block w-full rounded-md border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-(--color-ink) hover:bg-(--color-surface)"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-(--color-ink)">Reset your password</h2>
            <p className="mt-1 text-xs text-(--color-ink-muted)">
              Enter your account email and we will send a reset link.
            </p>

            {error && (
              <p
                className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"
                role="alert"
              >
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
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
              <button
                type="submit"
                disabled={submitting || email.trim().length === 0}
                className="w-full rounded-md bg-(--color-primary) px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-(--color-ink-muted)">
              <Link
                to="/login"
                onClick={() => navigate('/login')}
                className="underline hover:text-(--color-ink)"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
