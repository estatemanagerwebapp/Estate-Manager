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
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ORGANIZATION_SLUG: 'test_org',
  SHUTDOWN_TIMEOUT_MS: '5000',
  SILVERSTONE_CONFIG_FILE: '../../config/organization.default.json',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}
