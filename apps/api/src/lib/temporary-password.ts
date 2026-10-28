import { randomBytes } from 'node:crypto';

/**
 * Generate a one-time password for an account created by an operator or by
 * resident onboarding.
 *
 * The value satisfies the password policy (12+ chars, at least one lowercase,
 * one uppercase and one digit) and avoids visually ambiguous characters. It is
 * returned to the caller exactly once, then only the hash is stored.
 */
export function generateTemporaryPassword(length = 16): string {
  if (!Number.isInteger(length) || length < 3) {
    throw new Error('Temporary password length must be an integer of at least 3');
  }

  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lowercase + uppercase + digits;
  const random = randomBytes(length);
  const chars: string[] = [];

  // Guarantee one from each class, then fill the rest at random.
  chars.push(lowercase.charAt(random.readUInt8(0) % lowercase.length));
  chars.push(uppercase.charAt(random.readUInt8(1) % uppercase.length));
  chars.push(digits.charAt(random.readUInt8(2) % digits.length));
  for (let i = 3; i < length; i += 1) {
    chars.push(all.charAt(random.readUInt8(i) % all.length));
  }

  // Shuffle (Fisher-Yates) so the guaranteed characters are not in fixed
  // positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random.readUInt8(i) % (i + 1);
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }

  return chars.join('');
}
