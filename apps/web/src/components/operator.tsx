import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Badge, EmptyState, ErrorBanner, Skeleton, statusTone, type BadgeTone } from './ui';

/**
 * Shared operator-console primitives.
 *
 * These are deliberately thin wrappers over the existing `ui.tsx` tokens and
 * state panels. Later operator modules (residents, messages, billing, gate,
 * facilities, SOS) use the same table, filter, status and drawer layout so the
 * console stays consistent without each page inventing its own markup.
 */

export function OperatorPageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--color-primary-soft)">
          {icon}
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-(--color-ink-muted)">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function FilterBar({
  children,
  summary,
  actions,
}: {
  children: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      role="search"
      className="mt-6 flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-slate-200/80 bg-white px-4 py-3 shadow-(--shadow-card)"
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {summary && <p className="text-xs text-(--color-ink-muted)">{summary}</p>}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyBody,
  emptyAction,
  footer,
}: {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  caption?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  footer?: ReactNode;
}) {
  if (error) {
    return (
      <div className="mt-4">
        <ErrorBanner message={error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)">
      <div className="overflow-x-auto" aria-busy={loading}>
        <table className="min-w-full divide-y divide-slate-200/80 text-left">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted) ${
                    column.align === 'right' ? 'text-right' : ''
                  } ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80">
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <tr key={`skeleton-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-4">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-2">
                  <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)} className="hover:bg-(--color-surface)">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-sm text-(--color-ink) ${
                        column.align === 'right' ? 'text-right' : ''
                      } ${column.className ?? ''}`}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="flex items-center justify-between border-t border-slate-200/80 px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({
  status,
  label,
  tone,
}: {
  status: string;
  label?: string;
  tone?: BadgeTone;
}) {
  return <Badge tone={tone ?? statusTone(status)}>{label ?? status.replaceAll('_', ' ')}</Badge>;
}

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/30">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close detail panel"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-(--shadow-card)"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-(--color-ink)">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-(--color-ink-muted)">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="rounded p-1 text-(--color-ink-muted) hover:bg-(--color-surface)"
          >
            <X aria-hidden size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200/80 px-5 py-3">
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}
