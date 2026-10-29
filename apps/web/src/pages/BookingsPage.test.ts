import { describe, expect, it } from 'vitest';
import type { OperatorBookingDto } from '@silverstone/shared';
import {
  bookingCanConfirm,
  bookingFilterForView,
  bookingMatchesSearch,
  bookingPropertyLabel,
  bookingResidentLabel,
  bookingStatusTone,
  formatWindow,
  paymentStatusLabel,
  paymentStatusTone,
} from './BookingsPage';

function booking(overrides: Partial<OperatorBookingDto> = {}): OperatorBookingDto {
  return {
    id: 'booking-1',
    facilityId: 'facility-1',
    facilityName: 'Community Hall',
    estate: { id: 'estate-1', name: 'Silverstone Estate', slug: 'silverstone' },
    resident: {
      id: 'resident-1',
      fullName: 'Ada Okafor',
      email: 'ada@example.com',
      phone: '+2348000000000',
    },
    property: {
      id: 'property-1',
      identifier: 'A-12',
      name: 'Cedar House',
      estate: { id: 'estate-1', name: 'Silverstone Estate', slug: 'silverstone' },
    },
    startsAt: '2026-11-10T09:00:00.000Z',
    endsAt: '2026-11-10T11:00:00.000Z',
    attendees: 25,
    feeKobo: 500_000,
    paymentStatus: 'UNPAID',
    invoiceId: null,
    status: 'REQUESTED',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('operator booking helpers', () => {
  it('maps views onto API filters', () => {
    expect(bookingFilterForView('ALL', 'ALL', '', '', '')).toEqual({});
    expect(
      bookingFilterForView('REQUESTED', 'UNPAID', 'facility-1', '2026-11-01', '2026-11-30'),
    ).toEqual({
      status: 'REQUESTED',
      paymentStatus: 'UNPAID',
      facilityId: 'facility-1',
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });

  it('labels booking and payment states', () => {
    expect(bookingStatusTone('REQUESTED')).toBe('warning');
    expect(bookingStatusTone('CONFIRMED')).toBe('success');
    expect(bookingStatusTone('CANCELLED')).toBe('danger');
    expect(bookingStatusTone('COMPLETED')).toBe('neutral');
    expect(paymentStatusLabel('UNPAID')).toBe('Payment pending');
    expect(paymentStatusLabel('PAID')).toBe('Paid');
    expect(paymentStatusLabel('NOT_REQUIRED')).toBe('No payment required');
    expect(paymentStatusTone('UNPAID')).toBe('warning');
    expect(paymentStatusTone('PAID')).toBe('success');
    expect(paymentStatusTone('NOT_REQUIRED')).toBe('neutral');
  });

  it('only confirms requested bookings whose payment is settled', () => {
    expect(bookingCanConfirm(booking({ paymentStatus: 'UNPAID' }))).toBe(false);
    expect(bookingCanConfirm(booking({ paymentStatus: 'PAID' }))).toBe(true);
    expect(bookingCanConfirm(booking({ paymentStatus: 'NOT_REQUIRED', feeKobo: 0 }))).toBe(true);
    expect(bookingCanConfirm(booking({ status: 'CONFIRMED', paymentStatus: 'PAID' }))).toBe(false);
    expect(bookingCanConfirm(booking({ status: 'CANCELLED', paymentStatus: 'PAID' }))).toBe(false);
  });

  it('describes resident and property context', () => {
    expect(bookingResidentLabel(booking())).toBe('Ada Okafor');
    expect(bookingResidentLabel(booking({ resident: null }))).toBe('Resident account unavailable');
    expect(bookingPropertyLabel(booking())).toBe('A-12 · Cedar House · Silverstone Estate');
    expect(bookingPropertyLabel(booking({ property: null }))).toBe('No property assigned');
  });

  it('shows the full date and time for the booking window', () => {
    const startsAt = new Date(2026, 10, 5, 9, 30).toISOString();
    const endsAt = new Date(2026, 10, 5, 11, 0).toISOString();
    const label = formatWindow(startsAt, endsAt);
    expect(label).toContain('2026');
    expect(label).toContain('09:30');
    expect(label).toContain('11:00');
    expect(label).toContain('·');
  });

  it('searches resident, facility, estate, property and states', () => {
    expect(bookingMatchesSearch(booking(), '')).toBe(true);
    expect(bookingMatchesSearch(booking(), 'ada')).toBe(true);
    expect(bookingMatchesSearch(booking(), 'community')).toBe(true);
    expect(bookingMatchesSearch(booking(), 'cedar')).toBe(true);
    expect(bookingMatchesSearch(booking(), 'pending')).toBe(true);
    expect(bookingMatchesSearch(booking(), 'requested')).toBe(true);
    expect(bookingMatchesSearch(booking(), 'unrelated')).toBe(false);
  });
});
