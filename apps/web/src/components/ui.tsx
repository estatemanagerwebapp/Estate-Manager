import type { ReactNode, ButtonHTMLAttributes } from 'react';

/**
 * Shared UI primitives for the Phase 2 screens.
 *
 * These are intentionally small, unstyled-dependency-free wrappers around the
 * design tokens already used across the app (`--color-*`, `--radius-card`,
 * `--shadow-card`). No new visual system is introduced — the goal is to give
 * the estate/property/import screens consistent buttons, cards, badges and
 * state panels without each page re-inventing the same Tailwind classes.
 */

// --- Button -------------------------------------------------------------------

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-(--color-primary) text-white hover:opacity-90',
    secondary: 'border border-slate-300 bg-white text-(--color-ink) hover:bg-(--color-surface)',
    ghost: 'text-(--color-ink-muted) hover:bg-(--color-surface) hover:text-(--color-ink)',
    danger: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  };
  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
  };
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}

// --- Card ---------------------------------------------------------------------

export function Card({
  children,
  className = '',
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={`rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card) ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-(--color-ink)">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-(--color-ink-muted)">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

// --- Badge --------------------------------------------------------------------

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  info: 'bg-sky-50 text-sky-700',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Map a status string to a badge tone.
 *
 * Covers the estate, property, import-batch and import-row status
 * vocabularies from the shared contract:
 *   - estates / properties: ACTIVE, ARCHIVED
 *   - import batches: PREVIEWED, COMMITTED, COMMIT_FAILED, FAILED
 *   - import rows: VALID, ERROR, DUPLICATE_IN_FILE, COLLISION, CREATED,
 *     DUPLICATE_EXISTING
 */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'ACTIVE':
    case 'COMMITTED':
    case 'CREATED':
    case 'RESOLVED':
      return 'success';
    case 'ARCHIVED':
      return 'neutral';
    case 'ACKNOWLEDGED':
      return 'warning';
    case 'RAISED':
      return 'danger';
    case 'PREVIEWED':
    case 'VALID':
      return 'info';
    case 'DUPLICATE_IN_FILE':
    case 'DUPLICATE_EXISTING':
    case 'COLLISION':
      return 'warning';
    case 'COMMIT_FAILED':
    case 'FAILED':
    case 'ERROR':
      return 'danger';
    default:
      return 'neutral';
  }
}

// --- State panels -------------------------------------------------------------

export function LoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center p-8">
      <p className="text-sm text-(--color-ink-muted)" role="status">
        {label}
      </p>
    </div>
  );
}

/**
 * Shimmering placeholder block for use inside skeleton layouts.
 * Mirrors the card/row dimensions of the loaded content so the layout
 * doesn't jump when the real data arrives.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-sm font-medium text-(--color-ink)">{title}</p>
      {body && <p className="max-w-sm text-xs text-(--color-ink-muted)">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md bg-rose-50 px-3 py-2.5 text-xs text-rose-700"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded font-medium underline hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function InfoBanner({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning';
}) {
  const styles =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-sky-200 bg-sky-50 text-sky-800';
  return <div className={`rounded-md border px-3 py-2.5 text-xs ${styles}`}>{children}</div>;
}

// --- Form field ---------------------------------------------------------------

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-(--color-ink-muted)">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-(--color-ink-muted)">{hint}</p>
      ) : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)';

export const selectClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary) bg-white';
