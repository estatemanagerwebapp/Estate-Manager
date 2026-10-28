import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Reusable modal + confirmation dialog. No focus-trap library: the dialog is
 * small enough that a plain `role="dialog"` with an Escape handler and a
 * close button meets the screens' needs without a dependency. The `Confirm`
 * variant is used for the destructive actions (archive estate / property,
 * commit import) where the operator must explicitly acknowledge.
 */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-(--radius-card) bg-white shadow-(--shadow-card)">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 px-5 py-4">
          <h2 className="text-sm font-semibold text-(--color-ink)">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
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
      </div>
    </div>
  );
}

/**
 * Two-button confirmation for destructive / hard-to-undo actions. The
 * `danger` prop swaps the confirm button to the danger variant. Returns a
 * `confirm()` helper the caller can use from a button onClick.
 */
export function useConfirm() {
  const [pending, setPending] = useState<{
    title: string;
    body: string;
    danger?: boolean;
    resolve: (confirmed: boolean) => void;
  } | null>(null);

  function confirm({
    title,
    body,
    danger = false,
  }: {
    title: string;
    body: string;
    danger?: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      setPending({ title, body, danger, resolve });
    });
  }

  async function onResolve(confirmed: boolean) {
    const current = pending;
    setPending(null);
    current?.resolve(confirmed);
  }

  const dialog = pending ? (
    <Modal open onClose={() => void onResolve(false)} title={pending.title}>
      <p className="text-sm text-(--color-ink-muted)">{pending.body}</p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void onResolve(false)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-(--color-ink) hover:bg-(--color-surface)"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onResolve(true)}
          className={
            pending.danger
              ? 'rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700'
              : 'rounded-md bg-(--color-primary) px-4 py-2 text-sm font-semibold text-white hover:opacity-90'
          }
        >
          Confirm
        </button>
      </div>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
