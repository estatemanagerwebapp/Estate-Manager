import { describe, expect, it } from 'vitest';
import { STAFF_ROLE_KEYS } from '@silverstone/shared';
import { assignableStaffRoles, canManageStaffRole } from './AdministratorsPage';

/**
 * The API remains authoritative. These assertions pin the display-side role
 * matrix so an estate administrator never sees an option the server will
 * reject, while a super administrator can still create peer accounts.
 */
describe('administrator role matrix', () => {
  it('lets a super administrator manage every staff role', () => {
    expect(assignableStaffRoles('SUPER_ADMIN')).toEqual(STAFF_ROLE_KEYS);
    for (const role of STAFF_ROLE_KEYS) {
      expect(canManageStaffRole('SUPER_ADMIN', role)).toBe(true);
    }
  });

  it('keeps super administrators out of an estate administrator’s range', () => {
    expect(assignableStaffRoles('ESTATE_ADMIN')).toEqual(
      STAFF_ROLE_KEYS.filter((role) => role !== 'SUPER_ADMIN'),
    );
    expect(canManageStaffRole('ESTATE_ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canManageStaffRole('ESTATE_ADMIN', 'ESTATE_ADMIN')).toBe(true);
    expect(canManageStaffRole('ESTATE_ADMIN', 'GUARD')).toBe(true);
    expect(canManageStaffRole('ESTATE_ADMIN', 'AUDITOR')).toBe(true);
  });

  it('gives non-management roles no staff options', () => {
    expect(assignableStaffRoles('GUARD')).toEqual([]);
    expect(assignableStaffRoles('RESIDENT')).toEqual([]);
    expect(assignableStaffRoles(undefined)).toEqual([]);
    expect(canManageStaffRole('GUARD', 'AUDITOR')).toBe(false);
  });
});
