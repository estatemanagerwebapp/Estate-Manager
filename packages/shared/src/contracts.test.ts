import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULE_FLAGS, enabledModules, isModuleEnabled } from './modules.js';
import { hasPermission, permissionsForRole } from './permissions.js';
import { ROLE_KEYS, isRoleKey } from './roles.js';

describe('roles', () => {
  it('recognises every declared role and rejects unknown values', () => {
    for (const role of ROLE_KEYS) {
      expect(isRoleKey(role)).toBe(true);
    }
    expect(isRoleKey('OWNER')).toBe(false);
    expect(isRoleKey(undefined)).toBe(false);
  });
});

describe('permissions', () => {
  it('gives super administrators configuration authority', () => {
    expect(hasPermission('SUPER_ADMIN', 'config.manage')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'organization.manage')).toBe(true);
  });

  it('keeps configuration authority away from estate administrators', () => {
    expect(hasPermission('ESTATE_ADMIN', 'config.manage')).toBe(false);
    expect(hasPermission('ESTATE_ADMIN', 'resident.manage')).toBe(true);
  });

  it('limits guards to gate operations and read-only resident lookup', () => {
    expect(permissionsForRole('GUARD')).toEqual(['gate.manage', 'gate.read', 'resident.read']);
    expect(hasPermission('GUARD', 'billing.manage')).toBe(false);
  });

  it('limits residents to their own portal surface', () => {
    expect(permissionsForRole('RESIDENT')).toEqual([
      'portal.access.self',
      'profile.view',
      'property.view',
      'invoice.view',
      'payment.create',
      'code.create',
      'code.deactivate',
      'complaint.create',
      'complaint.view',
      'message.view',
      'facility.book',
      'sos.create',
    ]);
    // No administrative surface leaks into the resident role.
    expect(hasPermission('RESIDENT', 'resident.manage')).toBe(false);
    expect(hasPermission('RESIDENT', 'billing.manage')).toBe(false);
    expect(hasPermission('RESIDENT', 'config.manage')).toBe(false);
  });

  it('grants auditors read-only access', () => {
    expect(hasPermission('AUDITOR', 'audit.read')).toBe(true);
    expect(hasPermission('AUDITOR', 'resident.manage')).toBe(false);
  });

  it('honours organization overrides', () => {
    expect(hasPermission('GUARD', 'audit.read', { GUARD: ['audit.read'] })).toBe(true);
  });
});

describe('modules', () => {
  it('enables the operating baseline and disables unconfigured domains', () => {
    expect(isModuleEnabled(DEFAULT_MODULE_FLAGS, 'estates')).toBe(true);
    expect(isModuleEnabled(DEFAULT_MODULE_FLAGS, 'power')).toBe(false);
    expect(enabledModules(DEFAULT_MODULE_FLAGS)).not.toContain('shortlet');
  });
});
