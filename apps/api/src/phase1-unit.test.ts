/**
 * Phase 1 unit tests for user-rules, password-policy and the password helpers.
 *
 * No database: pure functions and the `node:crypto` primitives are under
 * test. Argon2's native binary is available in this workspace (it was
 * compiled during `npm install`), so the hashing round-trips exercise the
 * real KDF.
 */
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, sha256Hex, generateOpaqueToken } from './lib/password.js';
import { validatePassword, meetsPasswordPolicy } from './modules/auth/password-policy.js';
import {
  canManageRole,
  canSetRole,
  USER_MANAGE,
  lastAdminGuardApplies,
  lastAdminGuardMessage,
  type UserRecord,
} from './modules/auth/user-rules.js';

const user = (overrides: Partial<UserRecord>): UserRecord => ({
  id: 'user-1',
  organizationId: 'org-1',
  email: 'ops@example.com',
  passwordHash: '$argon2id$dummy',
  role: 'ESTATE_ADMIN',
  status: 'ACTIVE',
  lastPasswordChangedAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

describe('password hashing', () => {
  it('round-trips an Argon2id hash', async () => {
    const hash = await hashPassword('Correct-Horse-77!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Correct-Horse-77!')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('sha256Hex is deterministic and generateOpaqueToken is not', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
    expect(generateOpaqueToken(16)).not.toBe(generateOpaqueToken(16));
    expect(generateOpaqueToken(16)).toHaveLength(32);
  });
});

describe('password policy', () => {
  it('rejects short passwords', () => {
    expect(validatePassword('Ab1!short')).toHaveLength(1);
    expect(meetsPasswordPolicy('Ab1!short')).toBe(false);
  });

  it('rejects passwords missing a class', () => {
    expect(validatePassword('alllowercase1')).toContain(
      'Password must contain an uppercase letter',
    );
    expect(validatePassword('ALLUPPERCASE1')).toContain('Password must contain a lowercase letter');
    expect(validatePassword('NoDigitsHere!')).toContain('Password must contain a digit');
  });

  it('accepts a compliant password', () => {
    const problems = validatePassword('Correct-Horse-77!');
    expect(problems).toHaveLength(0);
    expect(meetsPasswordPolicy('Correct-Horse-77!')).toBe(true);
  });
});

describe('user-rules', () => {
  it('the user.manage permission constant matches the shared catalogue', () => {
    expect(USER_MANAGE).toBe('user.manage');
  });

  it('SUPER_ADMIN may manage every role', () => {
    for (const target of ['SUPER_ADMIN', 'ESTATE_ADMIN', 'GUARD', 'RESIDENT', 'AUDITOR']) {
      expect(canManageRole('SUPER_ADMIN', target)).toBe(true);
    }
  });

  it('ESTATE_ADMIN may manage everyone except SUPER_ADMIN', () => {
    expect(canManageRole('ESTATE_ADMIN', 'ESTATE_ADMIN')).toBe(true);
    expect(canManageRole('ESTATE_ADMIN', 'GUARD')).toBe(true);
    expect(canManageRole('ESTATE_ADMIN', 'SUPER_ADMIN')).toBe(false);
  });

  it('GUARD and RESIDENT may manage no one', () => {
    expect(canManageRole('GUARD', 'GUARD')).toBe(false);
    expect(canManageRole('RESIDENT', 'RESIDENT')).toBe(false);
  });

  it('unknown roles fail closed', () => {
    expect(canManageRole('OWNER', 'GUARD')).toBe(false);
    expect(canSetRole('SUPER_ADMIN', 'GUARD', 'OWNER')).toBe(false);
  });

  it('role changes must not widen the target beyond the actor', () => {
    expect(canSetRole('ESTATE_ADMIN', 'GUARD', 'ESTATE_ADMIN')).toBe(false);
    expect(canSetRole('ESTATE_ADMIN', 'ESTATE_ADMIN', 'GUARD')).toBe(true);
    expect(canSetRole('ESTATE_ADMIN', 'ESTATE_ADMIN', 'ESTATE_ADMIN')).toBe(true);
    expect(canSetRole('SUPER_ADMIN', 'RESIDENT', 'ESTATE_ADMIN')).toBe(true);
  });

  it('the last active super admin cannot be closed or demoted', () => {
    const target = user({ role: 'SUPER_ADMIN' });
    expect(lastAdminGuardApplies(target, true)).toBe(true);
    expect(lastAdminGuardMessage('suspend')).toMatch(/super administrator/);
    expect(lastAdminGuardMessage('demote')).toMatch(/super administrator/);

    // A non-super-admin target is never guarded.
    expect(lastAdminGuardApplies(user({ role: 'GUARD' }), true)).toBe(false);
    // A suspended super admin is not the *active* last gatekeeper.
    expect(lastAdminGuardApplies(user({ role: 'SUPER_ADMIN', status: 'SUSPENDED' }), true)).toBe(
      false,
    );
  });
});
