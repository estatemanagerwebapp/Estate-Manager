/**
 * Password hashing policy tests (ADR-0005).
 *
 * Covers backend selection, the documented PBKDF2 fallback, the strict
 * `argon2id-required` policy, verification of every hash format this codebase
 * has produced (Argon2id, legacy Argon2i, PBKDF2), malformed input handling,
 * and the guarantee that fallback logging never contains secrets.
 *
 * The module under test caches its backend, so each test resets the module
 * registry and re-imports it to exercise a different environment.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const SECRET = 'Correct-Horse-77!';

// Fixed-salt vectors generated once with the real KDFs. They let verification be
// tested without depending on which backend this machine can load.
const ARGON2ID_VECTOR =
  '$argon2id$v=19$m=19456,p=4,t=3$c2lsdmVyc3RvbmUtdGVzdA$l+x/K3ZqFSzZB8pGpy/08jq88NdpATOKdkmArdqzgbY';
const ARGON2I_VECTOR =
  '$argon2i$v=19$m=19456,p=4,t=3$c2lsdmVyc3RvbmUtdGVzdA$ZXhByqmV3+5fnEJSPB64JM8E4KwtqEQDM/vET5bLJms';
const PBKDF2_VECTOR =
  'pbkdf2-sha256:600000:c2lsdmVyc3RvbmUtdGVzdA==:y+ueXt9ZAcwakIVfLS6elSLVSrs/WoB0UDimUlOd42s=';

// Stable spies: `vi.resetModules()` re-runs mock factories, so the logger mock
// must hand back an object created once at file scope.
const loggerSpies = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
}));
vi.mock('./lib/logger.js', () => ({ logger: loggerSpies }));

let argon2Available = false;

beforeAll(async () => {
  argon2Available = await import('argon2').then(
    () => true,
    () => false,
  );
});

afterEach(() => {
  vi.doUnmock('argon2');
  vi.resetModules();
  delete process.env.PASSWORD_HASH_POLICY;
  loggerSpies.warn.mockClear();
  loggerSpies.info.mockClear();
  loggerSpies.error.mockClear();
});

/** Import a fresh copy of the module so cached backend selection does not leak. */
async function loadPasswordModule() {
  vi.resetModules();
  return import('./lib/password.js');
}

/** Simulate a platform where the argon2 native binary failed to build/load. */
function mockArgon2Unavailable(): void {
  vi.doMock('argon2', () => {
    throw new Error('No native build was found for platform=darwin arch=x64');
  });
}

/** Simulate a healthy argon2 install without needing a compiler. */
function mockArgon2Available(): void {
  vi.doMock('argon2', () => {
    const hashes = new Map<string, string>();
    let counter = 0;
    return {
      argon2id: 2,
      hash: async (password: string) => {
        const stored = `$argon2id$v=19$m=19456,t=3,p=4$bW9ja3NhbHQ$${++counter}`;
        hashes.set(stored, password);
        return stored;
      },
      verify: async (stored: string, candidate: string) => hashes.get(stored) === candidate,
    };
  });
}

describe('policy configuration', () => {
  it('defaults to allow-fallback when unset', async () => {
    const pw = await loadPasswordModule();
    expect(pw.getPasswordHashPolicy()).toBe('allow-fallback');
  });

  it('rejects an unknown policy value with an actionable message', async () => {
    process.env.PASSWORD_HASH_POLICY = 'argon2';
    const pw = await loadPasswordModule();
    expect(() => pw.getPasswordHashPolicy()).toThrow(
      /invalid PASSWORD_HASH_POLICY="argon2"/i,
    );
  });

  it('accepts argon2id-required', async () => {
    process.env.PASSWORD_HASH_POLICY = 'argon2id-required';
    const pw = await loadPasswordModule();
    expect(pw.getPasswordHashPolicy()).toBe('argon2id-required');
  });
});

describe('argon2id available', () => {
  it('selects argon2id and produces self-describing hashes', async () => {
    mockArgon2Available();
    const pw = await loadPasswordModule();

    expect(await pw.getPasswordHashAlgorithm()).toBe('argon2id');
    const hash = await pw.hashPassword(SECRET);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await pw.verifyPassword(hash, SECRET)).toBe(true);
    expect(await pw.verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('returns an argon2id dummy hash for timing equalization', async () => {
    mockArgon2Available();
    const pw = await loadPasswordModule();

    const dummy = await pw.getDummyPasswordHash();
    expect(dummy).toMatch(/^\$argon2id\$/);
    expect(await pw.verifyPassword(dummy, SECRET)).toBe(false);
  });

  it('honours argon2id-required when the module loads', async () => {
    mockArgon2Available();
    process.env.PASSWORD_HASH_POLICY = 'argon2id-required';
    const pw = await loadPasswordModule();

    expect(await pw.getPasswordHashAlgorithm()).toBe('argon2id');
    expect(await pw.hashPassword(SECRET)).toMatch(/^\$argon2id\$/);
  });
});

describe('argon2id unavailable', () => {
  it('falls back to PBKDF2-SHA256 under allow-fallback', async () => {
    mockArgon2Unavailable();
    const pw = await loadPasswordModule();

    expect(await pw.getPasswordHashAlgorithm()).toBe('pbkdf2-sha256');
    const hash = await pw.hashPassword(SECRET);
    expect(hash).toMatch(/^pbkdf2-sha256:600000:/);
    expect(await pw.verifyPassword(hash, SECRET)).toBe(true);
    expect(await pw.verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('logs one secret-free warning when it downgrades', async () => {
    mockArgon2Unavailable();
    const pw = await loadPasswordModule();

    const hash = await pw.hashPassword(SECRET);
    await pw.hashPassword(SECRET);
    await pw.verifyPassword(hash, SECRET);

    expect(loggerSpies.warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(loggerSpies.warn.mock.calls);
    expect(logged).not.toContain(SECRET);
    // No digest, salt, or full hash material in the warning.
    expect(logged).not.toContain(hash.slice(hash.lastIndexOf(':') + 1));
    expect(logged).toContain('pbkdf2-sha256');
  });

  it('uses a PBKDF2 dummy hash so unknown-account logins stay slow', async () => {
    mockArgon2Unavailable();
    const pw = await loadPasswordModule();

    const dummy = await pw.getDummyPasswordHash();
    expect(dummy).toMatch(/^pbkdf2-sha256:600000:/);
    expect(await pw.verifyPassword(dummy, SECRET)).toBe(false);
  });

  it('fails clearly instead of downgrading when Argon2id is required', async () => {
    mockArgon2Unavailable();
    process.env.PASSWORD_HASH_POLICY = 'argon2id-required';
    const pw = await loadPasswordModule();

    await expect(pw.getPasswordHashAlgorithm()).rejects.toThrow(
      /Argon2id is required/i,
    );
    await expect(pw.hashPassword(SECRET)).rejects.toMatchObject({
      name: 'PasswordBackendUnavailableError',
      code: 'PASSWORD_BACKEND_UNAVAILABLE',
    });
    await expect(pw.hashPassword(SECRET)).rejects.toThrow(
      /npm install-scripts approve argon2/,
    );
  });

  it('still verifies legacy PBKDF2 hashes under the strict policy', async () => {
    mockArgon2Unavailable();
    process.env.PASSWORD_HASH_POLICY = 'argon2id-required';
    const pw = await loadPasswordModule();

    // Existing credentials must keep working even when new hashing is blocked.
    expect(await pw.verifyPassword(PBKDF2_VECTOR, SECRET)).toBe(true);
    expect(await pw.verifyPassword(PBKDF2_VECTOR, 'wrong-password')).toBe(false);
  });
});

describe('verifying existing hash formats', () => {
  it('verifies a stored PBKDF2 hash regardless of the active backend', async () => {
    mockArgon2Available();
    const pw = await loadPasswordModule();

    expect(await pw.getPasswordHashAlgorithm()).toBe('argon2id');
    expect(await pw.verifyPassword(PBKDF2_VECTOR, SECRET)).toBe(true);
    expect(await pw.verifyPassword(PBKDF2_VECTOR, 'wrong-password')).toBe(false);
  });

  it('verifies a PBKDF2 hash written before a backend change', async () => {
    // Write a hash while Argon2id is unavailable...
    mockArgon2Unavailable();
    let pw = await loadPasswordModule();
    const stored = await pw.hashPassword(SECRET);

    // ...then verify it in a process where Argon2id is available again.
    vi.doUnmock('argon2');
    mockArgon2Available();
    pw = await loadPasswordModule();
    expect(await pw.getPasswordHashAlgorithm()).toBe('argon2id');
    expect(await pw.verifyPassword(stored, SECRET)).toBe(true);
  });

  it('verifies Argon2id and legacy Argon2i vectors', async (ctx) => {
    if (!argon2Available) ctx.skip();

    vi.doUnmock('argon2');
    const pw = await loadPasswordModule();

    expect(await pw.verifyPassword(ARGON2ID_VECTOR, SECRET)).toBe(true);
    expect(await pw.verifyPassword(ARGON2ID_VECTOR, 'wrong-password')).toBe(false);

    // Argon2i hashes predate the Argon2id switch; verification must still route
    // to the argon2 module rather than fail closed.
    expect(await pw.verifyPassword(ARGON2I_VECTOR, SECRET)).toBe(true);
    expect(await pw.verifyPassword(ARGON2I_VECTOR, 'wrong-password')).toBe(false);
  });

  it('fails closed on unknown or malformed stored values', async () => {
    const pw = await loadPasswordModule();

    const malformed = [
      '',
      'plain-text-password',
      'bcrypt:$2b$10$abcdefghijklmnopqrstuv',
      'pbkdf2-sha1:600000:c2FsdA==:ZGlnZXN0',
      'pbkdf2-sha256:abc:c2FsdA==:ZGlnZXN0',
      'pbkdf2-sha256:600000:c2FsdA==',
      'pbkdf2-sha256:600000:c2FsdA==:ZGlnZXN0:extra',
    ];
    for (const stored of malformed) {
      expect(await pw.verifyPassword(stored, SECRET)).toBe(false);
    }
  });

  it('rejects iteration counts outside the accepted range', async () => {
    const pw = await loadPasswordModule();

    expect(
      await pw.verifyPassword(
        'pbkdf2-sha256:1000:c2lsdmVyc3RvbmUtdGVzdA==:ZGlnZXN0',
        SECRET,
      ),
    ).toBe(false);
    expect(
      await pw.verifyPassword(
        'pbkdf2-sha256:999999999:c2lsdmVyc3RvbmUtdGVzdA==:ZGlnZXN0',
        SECRET,
      ),
    ).toBe(false);
  });
});
