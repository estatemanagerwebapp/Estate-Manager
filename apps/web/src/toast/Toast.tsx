import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

/**
 * Minimal toast surface for operator feedback that must survive navigation
 * (e.g. "Signed in" shown right after the auth redirect). Rendered once at
 * the app root so it stays mounted across route changes.
 *
 * No third-party dependency: toasts are held in React state and each auto-
 * dismisses after a short window. The hook API is intentionally tiny —
 * `toast.success`, `toast.error`, `toast.info` — so callers never have to
 * think about timers or stacking.
 */
export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastApi {
  success: (message: string, ms?: number) => void;
  error: (message: string, ms?: number) => void;
  info: (message: string, ms?: number) => void;
}

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

const ToastContext = createContext<ToastApi | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
};

const VARIANT_ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 aria-hidden size={16} />,
  error: <AlertCircle aria-hidden size={16} />,
  info: <Info aria-hidden size={16} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, ms = 4000) => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((current) => [...current, { id, variant, message }]);
      window.setTimeout(() => remove(id), ms);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, ms) => push('success', message, ms),
      error: (message, ms) => push('error', message, ms),
      info: (message, ms) => push('info', message, ms),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm shadow-sm ${VARIANT_STYLES[toast.variant]}`}
          >
            <span className="mt-0.5 shrink-0">{VARIANT_ICONS[toast.variant]}</span>
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X aria-hidden size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}
