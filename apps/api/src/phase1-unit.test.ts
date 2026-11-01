/**
 * Phase 1 unit tests for user-rules, password-policy and the password helpers.
 *
 * No database: pure functions and the `node:crypto` primitives are under
 * test. The hashing backend depends on whether the argon2 native module loads
 * (see `password-hashing.test.ts` for the policy matrix); these assertions are
 * written against whichever backend the environment selected.
 */
import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  getPasswordHashAlgorithm,
  sha256Hex,
  generateOpaqueToken,
} from './lib/password.js';
import { validatePasswordPolicy } from '@silverstone/shared';
import { generateTemporaryPassword } from './lib/temporary-password.js';
import {
  assertCanCreateRole,
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
  it('round-trips a hash produced by the selected backend', async () => {
    const algorithm = await getPasswordHashAlgorithm();
    const hash = await hashPassword('Correct-Horse-77!');

    // The self-describing prefix must agree with the selected backend.
    if (algorithm === 'argon2id') {
      expect(hash).toMatch(/^\$argon2id\$/);
    } else {
      expect(hash).toMatch(/^pbkdf2-sha256:600000:/);
    }

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
    expect(validatePasswordPolicy('Ab1!short')).toHaveLength(1);
  });

  it('rejects passwords missing a class', () => {
    expect(validatePasswordPolicy('alllowercase1')).toContain(
      'Password must contain an uppercase letter',
    );
    expect(validatePasswordPolicy('ALLUPPERCASE1')).toContain(
      'Password must contain a lowercase letter',
    );
    expect(validatePasswordPolicy('NoDigitsHere!')).toContain('Password must contain a digit');
  });

  it('accepts a compliant password', () => {
    const problems = validatePasswordPolicy('Correct-Horse-77!');
    expect(problems).toHaveLength(0);
  });

  it('generates a one-time password that satisfies the policy', () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(16);
    expect(validatePasswordPolicy(password)).toHaveLength(0);
    expect(generateTemporaryPassword()).not.toBe(password);
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

  it('only lets an actor create staff roles they can manage', () => {
    expect(() => assertCanCreateRole('SUPER_ADMIN', 'SUPER_ADMIN')).not.toThrow();
    expect(() => assertCanCreateRole('SUPER_ADMIN', 'ESTATE_ADMIN')).not.toThrow();
    expect(() => assertCanCreateRole('ESTATE_ADMIN', 'GUARD')).not.toThrow();
    expect(() => assertCanCreateRole('ESTATE_ADMIN', 'SUPER_ADMIN')).toThrow(
      /cannot create a user with this role/i,
    );
    // Residents are created by onboarding, never by staff account creation.
    expect(() => assertCanCreateRole('SUPER_ADMIN', 'RESIDENT')).toThrow(/resident onboarding/i);
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
