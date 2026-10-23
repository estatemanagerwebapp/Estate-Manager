import { PASSWORD_POLICY } from '@silverstone/shared';

/**
 * Password policy enforcement.
 *
 * Shared with the web client via `@silverstone/shared` so the login screen
 * can validate as the user types, while the server re-validates on every
 * mutation — the client check is convenience, never the gate.
 */

export interface PasswordPolicyOptions {
  min?: number;
  requireLower?: boolean;
  requireUpper?: boolean;
  requireDigit?: boolean;
}

export function validatePassword(password: string, options: PasswordPolicyOptions = {}): string[] {
  const policy = {
    min: options.min ?? PASSWORD_POLICY.min,
    requireLower: options.requireLower ?? PASSWORD_POLICY.requireLower,
    requireUpper: options.requireUpper ?? PASSWORD_POLICY.requireUpper,
    requireDigit: options.requireDigit ?? PASSWORD_POLICY.requireDigit,
  };

  const problems: string[] = [];
  if (password.length < policy.min) {
    problems.push(`Password must be at least ${policy.min} characters long`);
  }
  if (policy.requireLower && !/[a-z]/.test(password)) {
    problems.push('Password must contain a lowercase letter');
  }
  if (policy.requireUpper && !/[A-Z]/.test(password)) {
    problems.push('Password must contain an uppercase letter');
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    problems.push('Password must contain a digit');
  }
  return problems;
}

export function meetsPasswordPolicy(
  password: string,
  options: PasswordPolicyOptions = {},
): boolean {
  return validatePassword(password, options).length === 0;
}
