import { useSyncExternalStore } from 'react';
import type { AccessCodeStatus } from '@silverstone/shared';

/**
 * Shared one-second clock.
 *
 * Access-code tables can render dozens of rows; one interval per row would
 * create needless timers. A single module-level interval is shared by every
 * mounted countdown and stops when the last one unmounts.
 */
let currentNow = Date.now();
let timer: number | null = null;
const listeners = new Set<() => void>();

function tick() {
  currentNow = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  currentNow = Date.now();
  listeners.add(listener);
  if (timer === null) {
    timer = window.setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => currentNow,
    () => currentNow,
  );
}

/**
 * Hours/minutes/seconds remaining until `validUntil`.
 *
 * Revoked and expired codes return their terminal label rather than a
 * negative countdown. A null window means the code has no expiry.
 */
export function hoursLeftLabel(
  validUntil: string | null,
  now: number,
  status: AccessCodeStatus = 'ACTIVE',
): string {
  if (status === 'REVOKED') return 'Revoked';
  if (status === 'EXPIRED') return 'Expired';
  if (!validUntil) return 'No expiry';

  const remainingMs = new Date(validUntil).getTime() - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Expired';

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s left`;
}

/** Stable tone for the countdown text: amber near expiry, muted otherwise. */
export function hoursLeftTone(
  validUntil: string | null,
  now: number,
  status: AccessCodeStatus = 'ACTIVE',
): 'expired' | 'soon' | 'active' | 'none' {
  if (status === 'REVOKED') return 'expired';
  if (!validUntil) return status === 'EXPIRED' ? 'expired' : 'none';
  const remainingMs = new Date(validUntil).getTime() - now;
  if (status === 'EXPIRED' || !Number.isFinite(remainingMs) || remainingMs <= 0) return 'expired';
  if (remainingMs <= 60 * 60 * 1000) return 'soon';
  return 'active';
}

export function Countdown({
  validUntil,
  status = 'ACTIVE',
  className = '',
}: {
  validUntil: string | null;
  status?: AccessCodeStatus;
  className?: string;
}) {
  const now = useNow();
  const label = hoursLeftLabel(validUntil, now, status);
  const tone = hoursLeftTone(validUntil, now, status);
  const toneClass =
    tone === 'expired'
      ? 'text-rose-600'
      : tone === 'soon'
        ? 'text-amber-700'
        : 'text-(--color-ink-muted)';

  return (
    <span
      role="timer"
      aria-label={label}
      className={`whitespace-nowrap text-xs tabular-nums ${toneClass} ${className}`}
    >
      {label}
    </span>
  );
}
