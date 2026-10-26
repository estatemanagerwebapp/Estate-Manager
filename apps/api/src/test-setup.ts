/**
 * Test setup, run before any application module is imported.
 * All required environment variables are provided with inert values so the
 * env validator passes and no network access is attempted.
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  APP_NAME: 'Silverstone Managers (test)',
  PORT: '4321',
  API_BASE_PATH: '/api/v1',
  CORS_ORIGINS: 'http://localhost:5173',
  BODY_LIMIT: '1mb',
  TRUST_PROXY: '0',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX: '1000',
  DATABASE_URL:
    process.env.SILVERSTONE_TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/silverstone_test',
  ORGANIZATION_SLUG: 'test_org',
  SHUTDOWN_TIMEOUT_MS: '5000',
  SILVERSTONE_CONFIG_FILE: '../../config/organization.default.json',
  SESSION_LIFETIME_DAYS: '7',
  WEB_BASE_URL: 'http://localhost:5173',
  RESET_TOKEN_TTL_MINUTES: '60',
  EMAIL_PROVIDER: 'mock',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}
