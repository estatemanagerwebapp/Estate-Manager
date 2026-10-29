import { describe, expect, it } from 'vitest';
import type { SosOperatorEventDto } from '@silverstone/shared';
import {
  filterForView,
  sosMatchesSearch,
  sosPropertyLabel,
  sosResidentLabel,
  sosStatusLabel,
} from './SosAlertsPage';

function event(overrides: Partial<SosOperatorEventDto> = {}): SosOperatorEventDto {
  return {
    id: 'sos-1',
    note: 'Smoke in the corridor.',
    status: 'RAISED',
    raisedAt: '2026-10-29T08:00:00.000Z',
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNote: null,
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
    acknowledgedBy: null,
    resolvedBy: null,
    ...overrides,
  };
}

describe('operator SOS helpers', () => {
  it('maps queue views onto API filters', () => {
    expect(filterForView('ACTIVE')).toEqual({ active: true });
    expect(filterForView('ALL')).toEqual({});
    expect(filterForView('RAISED')).toEqual({ status: 'RAISED' });
    expect(filterForView('ACKNOWLEDGED')).toEqual({ status: 'ACKNOWLEDGED' });
    expect(filterForView('RESOLVED')).toEqual({ status: 'RESOLVED' });
  });

  it('labels statuses and property context', () => {
    expect(sosStatusLabel('RAISED')).toBe('Raised');
    expect(sosStatusLabel('ACKNOWLEDGED')).toBe('Acknowledged');
    expect(sosStatusLabel('RESOLVED')).toBe('Resolved');
    expect(sosPropertyLabel(event())).toBe('A-12 · Cedar House · Silverstone Estate');
    expect(sosPropertyLabel(event({ property: null }))).toBe('No property assigned');
    expect(sosResidentLabel(event())).toBe('Ada Okafor');
  });

  it('searches across resident, property, note and resolution note', () => {
    expect(sosMatchesSearch(event(), 'ada')).toBe(true);
    expect(sosMatchesSearch(event(), 'silverstone')).toBe(true);
    expect(sosMatchesSearch(event(), 'corridor')).toBe(true);
    expect(sosMatchesSearch(event({ resolutionNote: 'Checked by guard' }), 'guard')).toBe(true);
    expect(sosMatchesSearch(event(), 'unrelated')).toBe(false);
  });
});
