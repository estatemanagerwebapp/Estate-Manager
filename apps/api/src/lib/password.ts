import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';

/**
 * Password hashing (ADR-0005).
 *
 * Primary backend: Argon2id via the `argon2` native module.
 * Approved fallback: PBKDF2-SHA256 at 600 000 iterations.
 *
 * Which of the two is allowed is an explicit policy decision, not an accident
 * of the environment:
 *
 * - `PASSWORD_HASH_POLICY=allow-fallback` (default) — use Argon2id when the
 *   native module loads; otherwise fall back to PBKDF2-SHA256 and emit a
 *   single, secret-free warning so the downgrade is visible in the logs.
 * - `PASSWORD_HASH_POLICY=argon2id-required` — never hash with PBKDF2. If the
 *   native module cannot load, hashing fails with a clear, actionable error
 *   instead of silently weakening stored credentials.
 *
 * Both backends produce self-describing hashes, and verification always routes
 * by the stored scheme rather than by the active backend, so credentials remain
 * verifiable after a dependency, platform, or policy change.
 */

export type PasswordHashAlgorithm = 'argon2id' | 'pbkdf2-sha256';
export type PasswordHashPolicy = 'allow-fallback' | 'argon2id-required';

/** Environment variable that selects the policy. Validated by `config/env.ts`. */
export const PASSWORD_HASH_POLICY_ENV = 'PASSWORD_HASH_POLICY';

const DEFAULT_POLICY: PasswordHashPolicy = 'allow-fallback';

const PBKDF2_SCHEME = 'pbkdf2-sha256';
const PBKDF2_ITERATIONS = 600_000;
/** Bounds applied when reading iterations from a stored hash (tamper/DoS guard). */
const PBKDF2_MIN_ITERATIONS = 100_000;
const PBKDF2_MAX_ITERATIONS = 10_000_000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_SALT_BYTES = 16;

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

/**
 * A well-formed Argon2id hash of a value that is not a valid password. Used for
 * timing equalization on unknown-account logins (see `AuthService.login`).
 * Verification against it always returns `false` but performs the full KDF.
 */
const ARGON2_DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=3,p=4$ZHVtbXlzb2x0c2FsdGJ5dGU$ZHVtbXl0YWdtYWhzaGFzaHZhbHVl';

/** Raised when Argon2id is required but the native module cannot be loaded. */
export class PasswordBackendUnavailableError extends Error {
  override readonly cause: unknown;
  readonly code = 'PASSWORD_BACKEND_UNAVAILABLE';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'PasswordBackendUnavailableError';
    this.cause = options?.cause;
  }
}

interface HashBackend {
  readonly name: PasswordHashAlgorithm;
  /** Self-describing dummy hash matching this backend (timing equalization). */
  readonly dummyHash: string;
  hash(password: string): Promise<string>;
  verify(stored: string, candidate: string): Promise<boolean>;
}

import type * as argon2Module from 'argon2';
type Argon2Module = typeof argon2Module;

let cachedBackend: HashBackend | undefined;
let cachedArgon2: Argon2Module | null | undefined;
let argon2LoadError: unknown;
let fallbackWarningEmitted = false;

/**
 * Reads the configured policy. `config/env.ts` validates the variable at
 * startup; this guard keeps direct library use (tests, scripts) honest.
 */
export function getPasswordHashPolicy(): PasswordHashPolicy {
  const raw = process.env[PASSWORD_HASH_POLICY_ENV]?.trim();
  if (!raw) return DEFAULT_POLICY;
  if (raw === 'allow-fallback' || raw === 'argon2id-required') return raw;
  throw new Error(
    `Invalid ${PASSWORD_HASH_POLICY_ENV}="${raw}". Supported values: allow-fallback, argon2id-required.`,
  );
}

async function loadArgon2(): Promise<Argon2Module | null> {
  if (cachedArgon2 !== undefined) return cachedArgon2;
  try {
    cachedArgon2 = await import('argon2');
    argon2LoadError = undefined;
  } catch (error) {
    cachedArgon2 = null;
    argon2LoadError = error;
  }
  return cachedArgon2;
}

function argon2UnavailableReason(): string {
  return argon2LoadError instanceof Error ? argon2LoadError.message : 'unknown loader error';
}

function argon2RequiredError(): PasswordBackendUnavailableError {
  return new PasswordBackendUnavailableError(
    'Argon2id is required (PASSWORD_HASH_POLICY=argon2id-required) but the argon2 native ' +
      'module failed to load. Install a C++ toolchain and allow the argon2 install script ' +
      `(npm install-scripts approve argon2), then reinstall. Loader error: ${argon2UnavailableReason()}`,
    { cause: argon2LoadError },
  );
}

function warnOnceAboutFallback(): void {
  if (fallbackWarningEmitted) return;
  fallbackWarningEmitted = true;
  // Deliberately secret-free: algorithm, iteration count, policy, loader error.
  logger.warn(
    {
      algorithm: 'pbkdf2-sha256',
      iterations: PBKDF2_ITERATIONS,
      policy: getPasswordHashPolicy(),
      reason: argon2UnavailableReason(),
    },
    'Argon2id native module unavailable; hashing new passwords with PBKDF2-SHA256 (ADR-0005). ' +
      'Existing Argon2id hashes cannot be verified in this process.',
  );
}

function argon2Backend(mod: Argon2Module): HashBackend {
  return {
    name: 'argon2id',
    dummyHash: ARGON2_DUMMY_HASH,
    hash: (password) => mod.hash(password, { ...ARGON2_TUNING, type: mod.argon2id }),
    async verify(stored, candidate) {
      try {
        return await mod.verify(stored, candidate);
      } catch {
        // A malformed hash is a verification failure, never a crash.
        return false;
      }
    },
  };
}

function derivePbkdf2(password: string, saltBase64: string, iterations: number): string {
  return pbkdf2Sync(password, saltBase64, iterations, PBKDF2_KEY_LENGTH, 'sha256').toString(
    'base64',
  );
}

function formatPbkdf2Hash(password: string, iterations = PBKDF2_ITERATIONS): string {
  const salt = randomBytes(PBKDF2_SALT_BYTES).toString('base64');
  return `${PBKDF2_SCHEME}:${iterations}:${salt}:${derivePbkdf2(password, salt, iterations)}`;
}

type ParsedPbkdf2Hash = { iterations: number; salt: string; digest: string };

/** Strict, allocation-free parse of `pbkdf2-sha256:<iterations>:<salt>:<digest>`. */
function parsePbkdf2Hash(stored: string): ParsedPbkdf2Hash | null {
  const parts = stored.split(':');
  if (parts.length !== 4) return null;
  const [scheme, iterationsRaw, salt, digest] = parts;
  if (scheme !== PBKDF2_SCHEME || !iterationsRaw || !salt || !digest) return null;
  if (!/^[0-9]+$/.test(iterationsRaw)) return null;
  const iterations = Number(iterationsRaw);
  if (iterations < PBKDF2_MIN_ITERATIONS || iterations > PBKDF2_MAX_ITERATIONS) return null;
  return { iterations, salt, digest };
}

function verifyPbkdf2(stored: string, candidate: string): boolean {
  const parsed = parsePbkdf2Hash(stored);
  if (!parsed) return false;
  const expected = Buffer.from(parsed.digest, 'base64');
  const actual = Buffer.from(
    derivePbkdf2(candidate, parsed.salt, parsed.iterations),
    'base64',
  );
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function pbkdf2Backend(): HashBackend {
  return {
    name: 'pbkdf2-sha256',
    // Fresh random material: no real password can match this hash.
    dummyHash: formatPbkdf2Hash(randomBytes(32).toString('hex')),
    hash: async (password) => formatPbkdf2Hash(password),
    verify: async (stored, candidate) => verifyPbkdf2(stored, candidate),
  };
}

async function selectBackend(): Promise<HashBackend> {
  if (cachedBackend) return cachedBackend;

  const mod = await loadArgon2();
  if (mod) {
    cachedBackend = argon2Backend(mod);
    return cachedBackend;
  }

  if (getPasswordHashPolicy() === 'argon2id-required') {
    throw argon2RequiredError();
  }

  warnOnceAboutFallback();
  cachedBackend = pbkdf2Backend();
  return cachedBackend;
}

/**
 * The algorithm that will be used for new hashes. Triggers backend selection,
 * so calling it at startup surfaces a misconfigured `argon2id-required` policy
 * before the server accepts traffic.
 */
export async function getPasswordHashAlgorithm(): Promise<PasswordHashAlgorithm> {
  return (await selectBackend()).name;
}

/**
 * A dummy hash matching the active backend. Used to keep unknown-account logins
 * as slow as real ones; without it, PBKDF2-deployed instances would answer
 * unknown emails faster than known ones (account enumeration).
 */
export async function getDummyPasswordHash(): Promise<string> {
  return (await selectBackend()).dummyHash;
}

/**
 * Hash a password with the active backend. Argon2id outputs PHC-formatted
 * `$argon2id$...` strings; PBKDF2 outputs
 * `pbkdf2-sha256:<iterations>:<salt>:<digest>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const backend = await selectBackend();
  return backend.hash(password);
}

/**
 * Verify a candidate against a stored hash. The scheme prefix decides which
 * backend performs the check, so a deployment can switch backends without
 * invalidating existing credentials. Argon2id hashes are still checked against
 * Argon2id even when new hashes are being written with PBKDF2.
 */
export async function verifyPassword(
  storedHash: string,
  candidate: string,
): Promise<boolean> {
  if (storedHash.startsWith('$argon2')) {
    const mod = await loadArgon2();
    if (!mod) {
      if (getPasswordHashPolicy() === 'argon2id-required') {
        throw argon2RequiredError();
      }
      warnOnceAboutFallback();
      return false;
    }
    try {
      return await mod.verify(storedHash, candidate);
    } catch {
      return false;
    }
  }

  if (storedHash.startsWith(`${PBKDF2_SCHEME}:`)) {
    return verifyPbkdf2(storedHash, candidate);
  }

  // Unknown or legacy scheme: fail closed.
  return false;
}

/**
 * Clears backend selection caches. Tests use this to exercise both the
 * Argon2id and the PBKDF2 path in one process; production code never calls it.
 */
export function resetPasswordBackendCacheForTests(): void {
  cachedBackend = undefined;
  cachedArgon2 = undefined;
  argon2LoadError = undefined;
  fallbackWarningEmitted = false;
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
