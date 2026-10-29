import { describe, expect, it } from 'vitest';
import { AUDIT_EVENT_TYPES, AUDIT_TARGET_TYPES } from './auth-contract.js';
import { DEFAULT_MODULE_FLAGS, enabledModules, isModuleEnabled } from './modules.js';
import { PERMISSIONS, hasPermission, permissionsForRole } from './permissions.js';
import { ROLE_KEYS, STAFF_ROLE_KEYS, isRoleKey, isStaffRole } from './roles.js';

describe('roles', () => {
  it('recognises every declared role and rejects unknown values', () => {
    for (const role of ROLE_KEYS) {
      expect(isRoleKey(role)).toBe(true);
    }
    expect(isRoleKey('OWNER')).toBe(false);
    expect(isRoleKey(undefined)).toBe(false);
  });

  it('separates staff roles from the resident role', () => {
    expect(STAFF_ROLE_KEYS).toEqual(['SUPER_ADMIN', 'ESTATE_ADMIN', 'GUARD', 'AUDITOR']);
    expect(isStaffRole('ESTATE_ADMIN')).toBe(true);
    expect(isStaffRole('RESIDENT')).toBe(false);
    expect(isStaffRole('OWNER')).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
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

  it('gives guards the gate baseline plus SOS response access', () => {
    expect(permissionsForRole('GUARD')).toEqual([
      'gate.manage',
      'gate.read',
      'verification.read',
      'resident.read',
      'sos.read',
      'sos.manage',
    ]);
    expect(hasPermission('GUARD', 'billing.manage')).toBe(false);
    expect(hasPermission('GUARD', 'verification.read')).toBe(true);
    expect(hasPermission('GUARD', 'sos.read')).toBe(true);
    expect(hasPermission('GUARD', 'sos.manage')).toBe(true);
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

  it('grants auditors read-only access to operator queues', () => {
    expect(hasPermission('AUDITOR', 'audit.read')).toBe(true);
    expect(hasPermission('AUDITOR', 'complaint.read')).toBe(true);
    expect(hasPermission('AUDITOR', 'message.read')).toBe(true);
    expect(hasPermission('AUDITOR', 'sos.read')).toBe(true);
    expect(hasPermission('AUDITOR', 'facility.read')).toBe(true);
    expect(hasPermission('AUDITOR', 'booking.read')).toBe(true);
    expect(hasPermission('AUDITOR', 'verification.read')).toBe(true);
    expect(hasPermission('AUDITOR', 'resident.manage')).toBe(false);
    expect(hasPermission('AUDITOR', 'complaint.manage')).toBe(false);
    expect(hasPermission('AUDITOR', 'sos.manage')).toBe(false);
  });

  it('grants estate administrators the operator management surface', () => {
    expect(hasPermission('ESTATE_ADMIN', 'complaint.manage')).toBe(true);
    expect(hasPermission('ESTATE_ADMIN', 'message.manage')).toBe(true);
    expect(hasPermission('ESTATE_ADMIN', 'sos.manage')).toBe(true);
    expect(hasPermission('ESTATE_ADMIN', 'facility.manage')).toBe(true);
    expect(hasPermission('ESTATE_ADMIN', 'booking.manage')).toBe(true);
    expect(hasPermission('ESTATE_ADMIN', 'verification.read')).toBe(true);
    expect(hasPermission('ESTATE_ADMIN', 'config.manage')).toBe(false);
  });

  it('keeps operator capabilities out of the resident role', () => {
    expect(hasPermission('RESIDENT', 'complaint.read')).toBe(false);
    expect(hasPermission('RESIDENT', 'message.manage')).toBe(false);
    expect(hasPermission('RESIDENT', 'sos.manage')).toBe(false);
    expect(hasPermission('RESIDENT', 'facility.manage')).toBe(false);
    expect(hasPermission('RESIDENT', 'verification.read')).toBe(false);
  });

  it('honours organization overrides', () => {
    expect(hasPermission('GUARD', 'audit.read', { GUARD: ['audit.read'] })).toBe(true);
  });
});

describe('audit catalogue', () => {
  it('declares each permission and audit event once', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    expect(new Set(AUDIT_EVENT_TYPES).size).toBe(AUDIT_EVENT_TYPES.length);
    expect(new Set(AUDIT_TARGET_TYPES).size).toBe(AUDIT_TARGET_TYPES.length);
  });

  it('includes the operator foundation event and target types', () => {
    expect(AUDIT_EVENT_TYPES).toContain('message.replied');
    expect(AUDIT_EVENT_TYPES).toContain('complaint.status_changed');
    expect(AUDIT_EVENT_TYPES).toContain('payment.recorded');
    expect(AUDIT_EVENT_TYPES).toContain('verification.recorded');
    expect(AUDIT_EVENT_TYPES).toContain('sos.resolved');
    expect(AUDIT_EVENT_TYPES).toContain('settings.updated');
    expect(AUDIT_TARGET_TYPES).toContain('message_thread');
    expect(AUDIT_TARGET_TYPES).toContain('access_verification');
    expect(AUDIT_TARGET_TYPES).toContain('settings');
  });
});

describe('modules', () => {
  it('enables the operating baseline and disables unconfigured domains', () => {
    expect(isModuleEnabled(DEFAULT_MODULE_FLAGS, 'estates')).toBe(true);
    expect(isModuleEnabled(DEFAULT_MODULE_FLAGS, 'power')).toBe(false);
    expect(enabledModules(DEFAULT_MODULE_FLAGS)).not.toContain('shortlet');
  });
});
