import { describe, expect, it } from 'vitest';
import type { OperatorComplaintDto } from '@silverstone/shared';
import {
  complaintFilterForView,
  complaintMatchesSearch,
  complaintPropertyLabel,
  complaintResidentLabel,
  complaintStatusLabel,
  complaintTone,
} from './ComplaintsPage';

function complaint(overrides: Partial<OperatorComplaintDto> = {}): OperatorComplaintDto {
  return {
    id: 'complaint-1',
    category: 'NOISE',
    subject: 'Generator noise at night',
    description: 'The generator runs until midnight and is very loud.',
    status: 'OPEN',
    resolvedAt: null,
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
    replies: [
      {
        id: 'reply-1',
        body: 'We have asked the maintenance team to inspect it.',
        createdAt: '2026-10-29T09:00:00.000Z',
        author: {
          id: 'staff-1',
          fullName: 'Grace Bello',
          email: 'grace@example.com',
          role: 'ESTATE_ADMIN',
        },
      },
    ],
    createdAt: '2026-10-29T08:00:00.000Z',
    updatedAt: '2026-10-29T09:00:00.000Z',
    ...overrides,
  };
}

describe('operator complaint helpers', () => {
  it('maps views onto API filters', () => {
    expect(complaintFilterForView('ALL')).toEqual({});
    expect(complaintFilterForView('OPEN')).toEqual({ status: 'OPEN' });
    expect(complaintFilterForView('IN_PROGRESS')).toEqual({ status: 'IN_PROGRESS' });
    expect(complaintFilterForView('RESOLVED')).toEqual({ status: 'RESOLVED' });
    expect(complaintFilterForView('CLOSED')).toEqual({ status: 'CLOSED' });
  });

  it('labels statuses and tones', () => {
    expect(complaintStatusLabel('OPEN')).toBe('Open');
    expect(complaintStatusLabel('IN_PROGRESS')).toBe('In progress');
    expect(complaintStatusLabel('RESOLVED')).toBe('Resolved');
    expect(complaintStatusLabel('CLOSED')).toBe('Closed');
    expect(complaintTone('OPEN')).toBe('warning');
    expect(complaintTone('IN_PROGRESS')).toBe('info');
    expect(complaintTone('RESOLVED')).toBe('success');
    expect(complaintTone('CLOSED')).toBe('neutral');
  });

  it('describes resident/property context and searches replies', () => {
    expect(complaintResidentLabel(complaint())).toBe('Ada Okafor');
    expect(complaintPropertyLabel(complaint())).toBe('A-12 · Cedar House · Silverstone Estate');
    expect(complaintPropertyLabel(complaint({ property: null }))).toBe('No property assigned');
    expect(complaintMatchesSearch(complaint(), 'generator')).toBe(true);
    expect(complaintMatchesSearch(complaint(), 'grace')).toBe(true);
    expect(complaintMatchesSearch(complaint(), 'maintenance')).toBe(true);
    expect(complaintMatchesSearch(complaint(), 'unrelated')).toBe(false);
  });
});
