import { describe, expect, it } from 'vitest';
import { queryKeys } from './query-keys';

describe('operator query keys', () => {
  it('keeps domain roots stable and hierarchical', () => {
    expect(queryKeys.dashboard.all).toEqual(['dashboard']);
    expect(queryKeys.dashboard.kpis).toEqual(['dashboard', 'kpis']);
    expect(queryKeys.users.all).toEqual(['users']);
    expect(queryKeys.audit.all).toEqual(['activity']);
    expect(queryKeys.audit.list({ outcome: 'failure' })).toEqual([
      'activity',
      { outcome: 'failure' },
    ]);
    expect(queryKeys.audit.list()).not.toEqual(queryKeys.audit.list({ outcome: 'failure' }));
  });

  it('scopes filtered lists without colliding with their domain root', () => {
    expect(queryKeys.users.list({ role: 'AUDITOR' })).toEqual(['users', { role: 'AUDITOR' }]);
    expect(queryKeys.complaints.list({ status: 'OPEN' })).toEqual([
      'complaints',
      { status: 'OPEN' },
    ]);
    expect(queryKeys.complaints.all).not.toEqual(queryKeys.complaints.list({ status: 'OPEN' }));
    expect(queryKeys.administrators.list({ scope: 'staff' })).toEqual([
      'administrators',
      { scope: 'staff' },
    ]);
  });

  it('keeps each operator module in its own namespace', () => {
    expect(queryKeys.messages.all[0]).toBe('messages');
    expect(queryKeys.invoices.all[0]).toBe('invoices');
    expect(queryKeys.accessCodes.all[0]).toBe('access-codes');
    expect(queryKeys.verifications.all[0]).toBe('verifications');
    expect(queryKeys.facilities.all[0]).toBe('facilities');
    expect(queryKeys.bookings.all[0]).toBe('bookings');
    expect(queryKeys.sos.all[0]).toBe('sos');
    expect(queryKeys.administrators.all[0]).toBe('administrators');
  });
});
