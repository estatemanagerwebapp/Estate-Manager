import { getEnv, parseEnv as parseEnvWithFiles, resetEnvForTests, EnvSchema } from './env.js';
import { describe, expect, it } from 'vitest';

/**
 * Validation tests describe an environment from scratch, so they must not
 * inherit values from a developer's local `.env`. `getEnv` below still
 * exercises the file-loading path.
 */
const parseEnv = (raw: NodeJS.ProcessEnv) => parseEnvWithFiles(raw, { loadFiles: false });

describe('parseEnv', () => {
  const base = {
    NODE_ENV: 'development',
    APP_NAME: 'Silverstone Managers',
    PORT: '4000',
    API_BASE_PATH: '/api/v1',
    CORS_ORIGINS: 'http://localhost:5173',
    BODY_LIMIT: '1mb',
    TRUST_PROXY: '0',
    LOG_LEVEL: 'info',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX: '100',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    ORGANIZATION_SLUG: 'silverstone',
    SHUTDOWN_TIMEOUT_MS: '5000',
    WEB_BASE_URL: 'http://localhost:5173',
    EMAIL_PROVIDER: 'mock',
  };

  it('parses a fully-specified development environment', () => {
    const env = parseEnv(base as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(4000);
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.isProduction).toBe(false);
    expect(env.corsOrigins).toEqual(['http://localhost:5173']);
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
  });

  it('parses multiple CORS origins and strips whitespace', () => {
    const env = parseEnv({
      ...base,
      CORS_ORIGINS: 'http://a.example, http://b.example',
    } as NodeJS.ProcessEnv);
    expect(env.corsOrigins).toEqual(['http://a.example', 'http://b.example']);
  });

  it('rejects an invalid database URL', () => {
    // A malformed value (rather than omission) wins over any .env or
    // process.env fallback, so the required-check is exercised reliably.
    expect(() =>
      parseEnv({ ...base, DATABASE_URL: 'not-a-postgres-url' } as NodeJS.ProcessEnv),
    ).toThrow(/PostgreSQL URL/);
  });

  it('rejects non-postgres database URLs', () => {
    expect(() =>
      parseEnv({ ...base, DATABASE_URL: 'mysql://user:pass@localhost/db' } as NodeJS.ProcessEnv),
    ).toThrow(/PostgreSQL URL/);
  });

  it('normalises quotes and a copied prefix around the database URL', () => {
    const env = parseEnv({
      ...base,
      DATABASE_URL: '  "DATABASE_URL=postgresql://user:pass@localhost:5432/db"\n',
    } as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
  });

  it('explains which part of the database URL is missing', () => {
    expect(() =>
      parseEnv({
        ...base,
        DATABASE_URL: 'postgresql://user@localhost:5432/db',
      } as NodeJS.ProcessEnv),
    ).toThrow(/missing the :password part/);

    expect(() =>
      parseEnv({
        ...base,
        DATABASE_URL: 'postgresql://user:pass@localhost:5432',
      } as NodeJS.ProcessEnv),
    ).toThrow(/missing the \/database path/);
  });

  it('rejects a production environment that allows wildcard CORS', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: '*',
      } as NodeJS.ProcessEnv),
    ).toThrow(/wildcard/);
  });

  it('requires R2-backed durable storage in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://example.com',
      } as NodeJS.ProcessEnv),
    ).toThrow(/MEDIA_STORAGE=r2/);
  });

  it('allows ephemeral media in production only when explicitly enabled', () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://example.com',
      ALLOW_EPHEMERAL_MEDIA: 'true',
    } as NodeJS.ProcessEnv);
    expect(env.ALLOW_EPHEMERAL_MEDIA).toBe(true);
    expect(env.MEDIA_STORAGE).toBe('local');

    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://example.com',
        ALLOW_EPHEMERAL_MEDIA: 'false',
      } as NodeJS.ProcessEnv),
    ).toThrow(/MEDIA_STORAGE=r2/);
  });

  it('requires all R2 settings when R2 storage is selected', () => {
    expect(() =>
      parseEnv({
        ...base,
        MEDIA_STORAGE: 'r2',
        R2_ACCOUNT_ID: 'account',
        R2_ACCESS_KEY_ID: 'key',
      } as NodeJS.ProcessEnv),
    ).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it('rejects a production environment with no CORS origins', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: '   ',
      } as NodeJS.ProcessEnv),
    ).toThrow(/at least one CORS origin/);
  });

  it('parses the base path with a trailing slash preserved', () => {
    const env = parseEnv({ ...base, API_BASE_PATH: '/api/v1/' } as NodeJS.ProcessEnv);
    expect(env.API_BASE_PATH).toBe('/api/v1/');
  });

  it('exposes a cached environment for the process', () => {
    resetEnvForTests();
    const env = getEnv();
    expect(env).toEqual(getEnv());
  });

  it('keeps the schema exported for documentation', () => {
    expect(EnvSchema.shape).toBeDefined();
  });
});
