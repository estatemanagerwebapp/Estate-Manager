import { describe, expect, it } from 'vitest';
import { AUDIT_EVENT_TYPES } from '@silverstone/shared';
import { AUDIT_EVENT_DB_MAP } from './modules/audit/audit-repository.js';
import { PermissionResolver } from './modules/auth/permission-resolver.js';

/**
 * Phase 0 contract tests.
 *
 * The operator modules added later rely on two shared agreements:
 *   1. every audit event in the wire contract has a database enum name;
 *   2. every operator capability resolves from the role/grant matrix.
 *
 * These tests fail before a route is written, which is the point: a missing
 * mapping or permission should not surface as a runtime 500 after a module
 * ships.
 */
describe('operator foundation', () => {
  it('maps every shared audit event to a database enum value', () => {
    expect(Object.keys(AUDIT_EVENT_DB_MAP).sort()).toEqual([...AUDIT_EVENT_TYPES].sort());
  });

  it('resolves the operator management surface for estate administrators', async () => {
    const resolver = new PermissionResolver(async () => []);

    await expect(resolver.can('ESTATE_ADMIN', 'complaint.manage')).resolves.toBe(true);
    await expect(resolver.can('ESTATE_ADMIN', 'message.manage')).resolves.toBe(true);
    await expect(resolver.can('ESTATE_ADMIN', 'sos.manage')).resolves.toBe(true);
    await expect(resolver.can('ESTATE_ADMIN', 'facility.manage')).resolves.toBe(true);
    await expect(resolver.can('ESTATE_ADMIN', 'booking.manage')).resolves.toBe(true);
    await expect(resolver.can('ESTATE_ADMIN', 'verification.read')).resolves.toBe(true);
  });

  it('resolves operator read access for auditors without management rights', async () => {
    const resolver = new PermissionResolver(async () => []);

    await expect(resolver.can('AUDITOR', 'complaint.read')).resolves.toBe(true);
    await expect(resolver.can('AUDITOR', 'message.read')).resolves.toBe(true);
    await expect(resolver.can('AUDITOR', 'sos.read')).resolves.toBe(true);
    await expect(resolver.can('AUDITOR', 'booking.read')).resolves.toBe(true);
    await expect(resolver.can('AUDITOR', 'complaint.manage')).resolves.toBe(false);
    await expect(resolver.can('AUDITOR', 'sos.manage')).resolves.toBe(false);
  });

  it('honours organization grants and rejects unknown permission strings', async () => {
    const resolver = new PermissionResolver(async () => [
      { role: 'GUARD', permissions: ['sos.read', 'not.a.real.permission'] },
    ]);

    await expect(resolver.can('GUARD', 'sos.read')).resolves.toBe(true);
    // The override replaces the baseline, so a grant without sos.manage is
    // still read-only for this deployment.
    await expect(resolver.can('GUARD', 'sos.manage')).resolves.toBe(false);
    await expect(resolver.can('GUARD', 'not.a.real.permission')).resolves.toBe(false);
  });

  it('fails closed for unknown roles and capabilities', async () => {
    const resolver = new PermissionResolver(async () => []);

    await expect(resolver.can('OWNER', 'complaint.read')).resolves.toBe(false);
    await expect(resolver.can('ESTATE_ADMIN', 'not.a.real.permission')).resolves.toBe(false);
  });
});
