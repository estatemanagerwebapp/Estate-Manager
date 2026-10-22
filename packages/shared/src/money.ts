/**
 * Money utilities.
 *
 * Silverstone stores every monetary value as a whole number of kobo
 * (1 naira = 100 kobo). Floats are never persisted, summed or compared, so
 * rounding drift cannot accumulate in invoices or payment reconciliation.
 */

/** An integer number of kobo. Always safe-integer and never fractional. */
export type Kobo = number;

export const KOBO_PER_NAIRA = 100;

/** Raised when a value cannot safely represent an amount of money. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Asserts that a number is a valid kobo amount (safe integer, not negative).
 */
export function assertKobo(value: number, label = 'amount'): asserts value is Kobo {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, received ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of kobo, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} is outside the safe integer range`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} must not be negative, received ${value}`);
  }
}

/**
 * Converts a naira amount (for example user input or a legacy record) into kobo.
 * Rounds half away from zero at the kobo boundary and rejects unsafe results.
 */
export function nairaToKobo(naira: number): Kobo {
  if (typeof naira !== 'number' || !Number.isFinite(naira)) {
    throw new MoneyError(`naira amount must be a finite number, received ${String(naira)}`);
  }
  if (naira < 0) {
    throw new MoneyError(`naira amount must not be negative, received ${naira}`);
  }
  const kobo = Math.round(naira * KOBO_PER_NAIRA);
  assertKobo(kobo, 'converted kobo amount');
  return kobo;
}

/** Converts kobo into a naira number. Intended for display and exports only. */
export function koboToNaira(kobo: Kobo): number {
  assertKobo(kobo);
  return kobo / KOBO_PER_NAIRA;
}

export interface FormatNairaOptions {
  /** BCP-47 locale used for grouping. Defaults to `en-NG`. */
  locale?: string;
  /** Number of decimal places to render. Defaults to 0. */
  decimals?: number;
  /** Render `₦1.2M` style compact notation. Defaults to false. */
  compact?: boolean;
}

/**
 * Formats a kobo amount as Nigerian naira, e.g. `₦8,950,000`.
 * The currency symbol itself comes from `Intl`, never from a hardcoded string.
 */
export function formatNaira(kobo: Kobo, options: FormatNairaOptions = {}): string {
  assertKobo(kobo);
  const { locale = 'en-NG', decimals = 0, compact = false } = options;
  if (decimals < 0 || decimals > 2 || !Number.isInteger(decimals)) {
    throw new MoneyError('decimals must be an integer between 0 and 2');
  }
  const naira = kobo / KOBO_PER_NAIRA;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'NGN',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...(compact ? { notation: 'compact' as const, compactDisplay: 'short' as const } : {}),
  }).format(naira);
}

/**
 * Parses free-text naira input (`"₦1,200.50"`, `"1200.5"`, `" 1 200 "`) into kobo.
 * Rejects more than two decimal places rather than silently rounding user input.
 */
export function parseNaira(input: string): Kobo {
  if (typeof input !== 'string') {
    throw new MoneyError('naira input must be a string');
  }
  const normalised = input.replace(/[\s,_₦]/g, '').trim();
  if (normalised === '') {
    throw new MoneyError('naira input is empty');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) {
    throw new MoneyError(`"${input}" is not a valid naira amount`);
  }
  const [whole = '0', fraction = ''] = normalised.split('.');
  const kobo = Number(whole) * KOBO_PER_NAIRA + Number(fraction.padEnd(2, '0'));
  assertKobo(kobo, 'parsed kobo amount');
  return kobo;
}

/** Sums kobo values, validating each operand and the result. */
export function sumKobo(...amounts: Kobo[]): Kobo {
  let total = 0;
  for (const amount of amounts) {
    assertKobo(amount);
    total += amount;
  }
  assertKobo(total, 'kobo total');
  return total;
}
