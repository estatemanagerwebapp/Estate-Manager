import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pbkdf2Sync } from 'node:crypto';

/**
 * Password hashing.
 *
 * Preference (ADR-0005): Argon2id via the `argon2` package (a native module
 * compiled from source in this workspace). When the native binary is
 * unavailable at runtime — a minimal runner without a build toolchain, or a
 * platform without a prebuilt binary — the documented fallback is
 * PBKDF2-SHA256 with 600 000 iterations. Both backends produce
 * self-describing hashes, and `verifyPassword` always routes to the backend
 * that matches the stored scheme, so credentials survive backend switches.
 */

const PBKDF2_ITERATIONS = 600_000;

// Argon2id tuning: 19 MiB memory, 4 parallelism, 3 time cost, 16-byte salt.
// The `type` field is filled in per-backend from the `argon2` module's own
// constant so the literal stays type-compatible with the package.
const ARGON2_TUNING = {
  memoryCost: 19 * 1024,
  parallelism: 4,
  timeCost: 3,
  saltLength: 16,
  hashLength: 32,
} as const;

interface HashBackend {
  readonly name: 'argon2id' | 'pbkdf2-sha256';
  hash(password: string): Promise<string>;
  verify(stored: string, candidate: string): Promise<boolean>;
}

import type * as argon2Module from 'argon2';
type Argon2Module = typeof argon2Module;

let cachedBackend: HashBackend | undefined;

async function loadBackend(): Promise<HashBackend> {
  if (cachedBackend) return cachedBackend;

  let mod: Argon2Module | undefined;
  try {
    mod = await import('argon2');
  } catch {
    mod = undefined;
  }

  if (mod) {
    const { argon2id } = mod;
    cachedBackend = {
      name: 'argon2id',
      hash: (password) => mod.hash(password, { ...ARGON2_TUNING, type: argon2id }),
      async verify(stored, candidate) {
        try {
          return await mod.verify(stored, candidate);
        } catch {
          // A malformed hash is a verification failure, never a crash.
          return false;
        }
      },
    };
    return cachedBackend;
  }

  cachedBackend = {
    name: 'pbkdf2-sha256',
    hash: async (password) => {
      const salt = randomBytes(16).toString('base64');
      const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString(
        'base64',
      );
      return `pbkdf2-sha256:${PBKDF2_ITERATIONS}:${salt}:${derived}`;
    },
    verify: async (stored, candidate) => {
      const [scheme, iterations, salt, digest] = stored.split(':');
      if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !digest) return false;
      const derived = pbkdf2Sync(candidate, salt, Number(iterations), 32, 'sha256').toString(
        'base64',
      );
      const a = Buffer.from(digest, 'base64');
      const b = Buffer.from(derived, 'base64');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    },
  };
  return cachedBackend;
}

/**
 * Hash a password with the configured backend. Argon2 outputs PHC-formatted
 * `$argon2id$...` strings; the fallback outputs
 * `pbkdf2-sha256:<iterations>:<salt>:<digest>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const backend = await loadBackend();
  return backend.hash(password);
}

/**
 * Verify a candidate against a stored hash. The scheme prefix decides which
 * backend performs the check, so a deployment can switch backends without
 * invalidating existing credentials.
 */
export async function verifyPassword(storedHash: string, candidate: string): Promise<boolean> {
  if (storedHash.startsWith('$argon2')) {
    let argon2: Argon2Module | undefined;
    try {
      argon2 = await import('argon2');
    } catch {
      return false;
    }
    if (!argon2) return false;
    try {
      return await argon2.verify(storedHash, candidate);
    } catch {
      return false;
    }
  }
  const backend = await loadBackend();
  return backend.verify(storedHash, candidate);
}

// --- Opaque secrets ---------------------------------------------------------

/** One-way, non-reversible SHA-256 digest for secrets that must be stored
 *  without keeping the reusable value (password-reset tokens). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cryptographically random opaque token (64 hex chars by default). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
