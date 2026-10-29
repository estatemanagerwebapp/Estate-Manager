import { describe, expect, it } from 'vitest';
import type { OperatorMessageThreadDto } from '@silverstone/shared';
import {
  messageFilterForView,
  messageStatusLabel,
  threadMatchesSearch,
  threadPropertyLabel,
  threadResidentLabel,
} from './MessagesPage';

function thread(overrides: Partial<OperatorMessageThreadDto> = {}): OperatorMessageThreadDto {
  return {
    id: 'thread-1',
    subject: 'Noise from the generator',
    status: 'OPEN',
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
    messages: [
      {
        id: 'message-1',
        senderRole: 'RESIDENT',
        body: 'The generator is very loud at night.',
        createdAt: '2026-10-29T08:00:00.000Z',
        author: {
          id: 'resident-1',
          fullName: 'Ada Okafor',
          email: 'ada@example.com',
          role: 'RESIDENT',
        },
      },
    ],
    unreadCount: 1,
    staffLastReadAt: null,
    createdAt: '2026-10-29T08:00:00.000Z',
    updatedAt: '2026-10-29T08:00:00.000Z',
    ...overrides,
  };
}

describe('operator message helpers', () => {
  it('maps views onto API filters', () => {
    expect(messageFilterForView('OPEN')).toEqual({ status: 'OPEN' });
    expect(messageFilterForView('CLOSED')).toEqual({ status: 'CLOSED' });
    expect(messageFilterForView('ALL')).toEqual({});
  });

  it('labels status and resident/property context', () => {
    expect(messageStatusLabel('OPEN')).toBe('Open');
    expect(messageStatusLabel('CLOSED')).toBe('Closed');
    expect(threadResidentLabel(thread())).toBe('Ada Okafor');
    expect(threadPropertyLabel(thread())).toBe('A-12 · Cedar House · Silverstone Estate');
    expect(threadPropertyLabel(thread({ property: null }))).toBe('No property assigned');
  });

  it('searches across subject, resident, property and messages', () => {
    expect(threadMatchesSearch(thread(), 'generator')).toBe(true);
    expect(threadMatchesSearch(thread(), 'ada')).toBe(true);
    expect(threadMatchesSearch(thread(), 'silverstone')).toBe(true);
    expect(threadMatchesSearch(thread(), 'loud')).toBe(true);
    expect(threadMatchesSearch(thread(), 'unrelated')).toBe(false);
  });
});
