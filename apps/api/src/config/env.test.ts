import { getEnv, parseEnv, resetEnvForTests, EnvSchema } from './env.js';
import { describe, expect, it } from 'vitest';

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

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _drop, ...rest } = base;
    expect(() => parseEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('rejects non-postgres database URLs', () => {
    expect(() =>
      parseEnv({ ...base, DATABASE_URL: 'mysql://user:pass@localhost/db' } as NodeJS.ProcessEnv),
    ).toThrow(/PostgreSQL URL/);
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
