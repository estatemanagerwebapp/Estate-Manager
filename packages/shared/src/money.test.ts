import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  assertKobo,
  formatNaira,
  koboToNaira,
  nairaToKobo,
  parseNaira,
  sumKobo,
} from './money.js';

const stripWhitespace = (value: string) => value.replace(/[\s\u00a0\u202f]/g, '');

describe('nairaToKobo', () => {
  it('converts whole and fractional naira exactly', () => {
    expect(nairaToKobo(50_000)).toBe(5_000_000);
    expect(nairaToKobo(89500.5)).toBe(8_950_050);
    expect(nairaToKobo(0)).toBe(0);
  });

  it('absorbs binary floating point noise at the kobo boundary', () => {
    expect(nairaToKobo(0.1 + 0.2)).toBe(30);
    expect(nairaToKobo(19.99)).toBe(1999);
  });

  it('rejects negative and non-finite input', () => {
    expect(() => nairaToKobo(-1)).toThrow(MoneyError);
    expect(() => nairaToKobo(Number.NaN)).toThrow(MoneyError);
    expect(() => nairaToKobo(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe('koboToNaira', () => {
  it('divides by one hundred and validates the operand', () => {
    expect(koboToNaira(5_000_000)).toBe(50_000);
    expect(() => koboToNaira(12.5)).toThrow(MoneyError);
  });
});

describe('assertKobo', () => {
  it('accepts non-negative safe integers', () => {
    expect(() => assertKobo(0)).not.toThrow();
    expect(() => assertKobo(5_000_000)).not.toThrow();
  });

  it('rejects fractional, negative and unsafe values', () => {
    expect(() => assertKobo(0.5)).toThrow(/integer/);
    expect(() => assertKobo(-100)).toThrow(/negative/);
    expect(() => assertKobo(Number.MAX_SAFE_INTEGER + 2)).toThrow(/safe integer/);
  });
});

describe('formatNaira', () => {
  it('renders grouped naira with two fraction digits by default', () => {
    expect(stripWhitespace(formatNaira(895_000_000))).toBe('₦8,950,000');
    expect(stripWhitespace(formatNaira(5_000_000))).toBe('₦50,000');
  });

  it('supports explicit decimals and compact notation', () => {
    expect(stripWhitespace(formatNaira(8_950_050, { decimals: 2 }))).toBe('₦89,500.50');
    expect(stripWhitespace(formatNaira(120_000_000_000, { compact: true }))).toBe('₦1B');
  });

  it('refuses invalid kobo input', () => {
    expect(() => formatNaira(10.5)).toThrow(MoneyError);
  });
});

describe('parseNaira', () => {
  it('parses symbols, separators and one decimal place', () => {
    expect(parseNaira('₦1,200.50')).toBe(120_050);
    expect(parseNaira('1 200')).toBe(120_000);
    expect(parseNaira('1200.5')).toBe(120_050);
  });

  it('rejects malformed or over-precise input', () => {
    expect(() => parseNaira('12.345')).toThrow(MoneyError);
    expect(() => parseNaira('abc')).toThrow(MoneyError);
    expect(() => parseNaira('')).toThrow(MoneyError);
  });
});

describe('sumKobo', () => {
  it('adds validated amounts exactly', () => {
    expect(sumKobo(1_000, 2_500, 0)).toBe(3_500);
    expect(sumKobo()).toBe(0);
  });

  it('rejects invalid operands', () => {
    expect(() => sumKobo(1_000, 2.5)).toThrow(MoneyError);
  });
});
