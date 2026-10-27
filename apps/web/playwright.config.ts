import { defineConfig, devices } from '@playwright/test';
import {
  E2E_API_ORIGIN,
  E2E_API_PORT,
  E2E_DATABASE_URL,
  E2E_WEB_ORIGIN,
  E2E_WEB_PORT,
  REPO_ROOT,
} from './e2e/support/environment';

/**
 * Absolute path to a locally installed CLI. The path is quoted because the
 * command runs through a shell and the repository path may contain spaces.
 */
const bin = (name: string): string =>
  `"${REPO_ROOT}/node_modules/.bin/${name}${process.platform === 'win32' ? '.cmd' : ''}"`;

/**
 * Playwright configuration for the Silverstone web console.
 *
 * The suite drives the real application against local processes only:
 *
 *   - an API instance on port 4100, pointed at the disposable
 *     `silverstone_test` database in the local Docker Postgres container;
 *   - a Vite dev server on port 5175 that proxies `/api` to that instance.
 *
 * The API's start command runs the guarded reset first (see
 * `apps/api/src/e2e/reset-database.ts`), so every run starts from a freshly
 * migrated and seeded test database. The reset refuses to run against any
 * database other than `silverstone_test` and refuses Supabase hosts outright.
 *
 * Tests share one database, so they run serially in a single worker: the
 * scenarios assert on global lists (the estates list, the properties list),
 * and parallel workers would make those assertions depend on each other.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',

  // One worker: the scenarios share a single database and assert on the
  // organisation-wide estate and property lists.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: E2E_WEB_ORIGIN,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // Rebuild the workspace packages first: both the API and the web app
      // resolve `@silverstone/shared` and `@silverstone/config-schema` from
      // their built `dist/`, so a stale build would silently test the previous
      // contract. Then reset the disposable test database and start the API.
      command: `npm --prefix "${REPO_ROOT}" run build:packages && npm run e2e:reset && ${bin('tsx')} src/main.ts`,
      cwd: `${REPO_ROOT}/apps/api`,
      url: `${E2E_API_ORIGIN}/api/v1/health`,
      timeout: 180_000,
      // Never reuse a server that is already listening: it may be serving a
      // different database than the one this run intends to test.
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test',
        PORT: String(E2E_API_PORT),
        API_BASE_PATH: '/api/v1',
        CORS_ORIGINS: `${E2E_WEB_ORIGIN},http://127.0.0.1:${E2E_WEB_PORT}`,
        BODY_LIMIT: '5mb',
        TRUST_PROXY: '0',
        LOG_LEVEL: 'warn',
        RATE_LIMIT_WINDOW_MS: '60000',
        RATE_LIMIT_MAX: '1000',
        // The whole suite signs in many times from one IP; the production
        // login cap (10 per 15 minutes) would otherwise fail the run.
        AUTH_LOGIN_RATE_LIMIT_MAX: '1000',
        DATABASE_URL: E2E_DATABASE_URL,
        SILVERSTONE_TEST_DATABASE_URL: E2E_DATABASE_URL,
        ORGANIZATION_SLUG: 'silverstone',
        SHUTDOWN_TIMEOUT_MS: '5000',
        SESSION_LIFETIME_DAYS: '1',
        WEB_BASE_URL: E2E_WEB_ORIGIN,
        RESET_TOKEN_TTL_MINUTES: '60',
        EMAIL_PROVIDER: 'mock',
        PASSWORD_HASH_POLICY: 'allow-fallback',
        SILVERSTONE_CONFIG_FILE: '../../config/organization.default.json',
      },
    },
    {
      command: `${bin('vite')} --port ${E2E_WEB_PORT} --strictPort`,
      cwd: `${REPO_ROOT}/apps/web`,
      url: E2E_WEB_ORIGIN,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        VITE_API_PROXY_TARGET: E2E_API_ORIGIN,
      },
    },
  ],
});
