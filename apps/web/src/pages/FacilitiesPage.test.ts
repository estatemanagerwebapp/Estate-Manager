import { describe, expect, it } from 'vitest';
import type { OperatorFacilityDto } from '@silverstone/shared';
import {
  facilityFilterForView,
  facilityMatchesSearch,
  facilityStatusLabel,
  facilityStatusTone,
} from './FacilitiesPage';

function facility(overrides: Partial<OperatorFacilityDto> = {}): OperatorFacilityDto {
  return {
    id: 'facility-1',
    name: 'Community Hall',
    description: 'Hired hall with seating.',
    estate: { id: 'estate-1', name: 'Silverstone Estate', slug: 'silverstone' },
    bookable: true,
    openingTime: '08:00',
    closingTime: '22:00',
    bookingThresholdHours: null,
    usageFeeKobo: 500_000,
    archivedAt: null,
    liveBookingCount: 0,
    waitingWatchCount: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('operator facility helpers', () => {
  it('maps views onto API filters', () => {
    expect(facilityFilterForView('ALL', '')).toEqual({});
    expect(facilityFilterForView('ACTIVE', '')).toEqual({ status: 'ACTIVE' });
    expect(facilityFilterForView('ARCHIVED', 'estate-1')).toEqual({
      status: 'ARCHIVED',
      estateId: 'estate-1',
    });
  });

  it('derives active, suspended and archived labels and tones', () => {
    expect(facilityStatusLabel(facility())).toBe('Active');
    expect(facilityStatusLabel(facility({ bookable: false }))).toBe('Suspended');
    expect(facilityStatusLabel(facility({ archivedAt: '2026-11-02T00:00:00.000Z' }))).toBe(
      'Archived',
    );
    expect(facilityStatusTone(facility())).toBe('success');
    expect(facilityStatusTone(facility({ bookable: false }))).toBe('warning');
    expect(facilityStatusTone(facility({ archivedAt: '2026-11-02T00:00:00.000Z' }))).toBe(
      'neutral',
    );
  });

  it('searches name, description, estate, fee and state', () => {
    expect(facilityMatchesSearch(facility(), '')).toBe(true);
    expect(facilityMatchesSearch(facility(), 'community')).toBe(true);
    expect(facilityMatchesSearch(facility(), 'seating')).toBe(true);
    expect(facilityMatchesSearch(facility(), 'silverstone')).toBe(true);
    expect(facilityMatchesSearch(facility(), '5,000')).toBe(true);
    expect(facilityMatchesSearch(facility({ usageFeeKobo: 0 }), 'free')).toBe(true);
    expect(facilityMatchesSearch(facility({ bookable: false }), 'suspended')).toBe(true);
    expect(facilityMatchesSearch(facility(), 'unrelated')).toBe(false);
  });
});
