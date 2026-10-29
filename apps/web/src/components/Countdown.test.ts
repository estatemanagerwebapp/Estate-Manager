import { describe, expect, it } from 'vitest';
import { hoursLeftLabel, hoursLeftTone } from './Countdown';

const NOW = Date.parse('2026-11-01T12:00:00.000Z');

describe('access-code countdown', () => {
  it('shows total hours, minutes and seconds remaining', () => {
    expect(hoursLeftLabel('2026-11-03T12:30:05.000Z', NOW)).toBe('48h 30m 5s left');
    expect(hoursLeftLabel('2026-11-01T12:00:01.000Z', NOW)).toBe('0h 0m 1s left');
  });

  it('uses terminal labels for revoked, expired and open-ended codes', () => {
    expect(hoursLeftLabel(null, NOW)).toBe('No expiry');
    expect(hoursLeftLabel('2026-11-01T11:59:59.000Z', NOW)).toBe('Expired');
    expect(hoursLeftLabel('2030-01-01T00:00:00.000Z', NOW, 'REVOKED')).toBe('Revoked');
    expect(hoursLeftLabel('2030-01-01T00:00:00.000Z', NOW, 'EXPIRED')).toBe('Expired');
  });

  it('tones the countdown by urgency', () => {
    expect(hoursLeftTone('2030-01-01T00:00:00.000Z', NOW)).toBe('active');
    expect(hoursLeftTone('2026-11-01T12:30:00.000Z', NOW)).toBe('soon');
    expect(hoursLeftTone('2026-11-01T11:00:00.000Z', NOW)).toBe('expired');
    expect(hoursLeftTone(null, NOW)).toBe('none');
  });
});
