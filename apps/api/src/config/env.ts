import { parse as parseDotenv } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Environment configuration.
 *
 * Every deployment-sensitive value enters the API through this module. The
 * process is fail-fast: an invalid or missing required variable aborts
 * startup with a readable, secret-free error.
 *
 * `.env` files are parsed into a plain object (never written to
 * `process.env`), so tests can observe exactly which values are consumed and
 * nothing leaks into the host process. Already-set process variables always
 * win over file values.
 */

function loadDotenvValues(): Record<string, string | undefined> {
  const candidates = [
    resolve(process.cwd(), '.env'),
    // `npm -w @silverstone/api` runs with the workspace as cwd.
    resolve(process.cwd(), '../../.env'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const raw = readFileSync(candidate, 'utf8');
      return parseDotenv(raw);
    } catch {
      // Unreadable file: treat as absent. Startup still validates the
      // process environment; a broken .env is not fatal on its own.
    }
  }
  return {};
}

const postgresUrlPattern = /^(?:postgres|postgresql):\/\/\S+:\S+@\S+/;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('Silverstone Managers'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),

    API_BASE_PATH: z
      .string()
      .regex(/^\/[a-z0-9/_-]*$/i, 'Must start with a slash, e.g. /api/v1')
      .default('/api/v1'),

    /** Comma-separated, explicit allowlist. An empty value is rejected. */
    CORS_ORIGINS: z
      .string()
      .min(1, 'CORS_ORIGINS must list at least one origin')
      .default('http://localhost:5173'),

    BODY_LIMIT: z
      .string()
      .regex(/^\d+(?:\.\d+)?\s*(?:[bk]b|mb)?$/i, 'Use a size such as 1mb or 2kb')
      .default('1mb'),

    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),

    DATABASE_URL: z.string().refine((value) => postgresUrlPattern.test(value), {
      message: 'PostgreSQL URL must look like postgresql://user:password@host:port/dbname',
    }),

    ORGANIZATION_SLUG: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, 'Lowercase letters, digits and underscores only')
      .default('silverstone'),

    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),

    // --- Phase 1 — Authentication --------------------------------------------
    /** Session lifetime in days (7 days is the default). */
    SESSION_LIFETIME_DAYS: z.coerce.number().int().min(1).max(30).default(7),

    /**
     * The base URL of the web console, used to build absolute reset links in
     * password-reset emails. Must be an http(s) URL.
     */
    WEB_BASE_URL: z
      .string()
      .url()
      .refine((value) => /^https?:/i.test(value), 'Must be an http or https URL')
      .default('http://localhost:5173'),

    /** Reset-token lifetime in minutes. */
    RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),

    // --- Phase 1 — Password hashing -------------------------------------------
    /**
     * Argon2id is the primary password hash (ADR-0005). `allow-fallback` permits
     * PBKDF2-SHA256 when the native module cannot load and logs a warning;
     * `argon2id-required` refuses to start rather than downgrade silently.
     */
    PASSWORD_HASH_POLICY: z.enum(['allow-fallback', 'argon2id-required']).default('allow-fallback'),

    // --- Phase 1 — Email delivery ---------------------------------------------
    /**
     * Which email adapter to use: `console` logs messages locally (no real
     * delivery), `resend` posts to the Resend API, `mock` is for tests.
     * Tests override the adapter through DI and never rely on this value.
     */
    EMAIL_PROVIDER: z.enum(['console', 'resend', 'mock']).default('console'),

    /** Resend API key (required only when `EMAIL_PROVIDER=resend`). */
    RESEND_API_KEY: z.string().optional(),

    /** Reply-to / sender address for outbound email. Defaults to a
     *  deployment-local address so the default does not impersonate. */
    EMAIL_FROM: z.string().default('Silverstone Managers <noreply@silverstone.local>'),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'EMAIL_PROVIDER=resend requires RESEND_API_KEY',
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const origins = env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    if (origins.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Production must declare at least one CORS origin',
      });
    }
    if (origins.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Production must not use the "*" wildcard for CORS origins',
      });
    }
  });

export type ParsedEnv = z.infer<typeof EnvSchema>;

export interface Env extends ParsedEnv {
  corsOrigins: string[];
  isProduction: boolean;
}

export class EnvironmentError extends Error {
  override name = 'EnvironmentError';
  readonly issues: Array<{ variable: string; message: string }>;

  constructor(issues: Array<{ variable: string; message: string }>) {
    super(
      'Environment configuration is invalid. Fix the following and restart:\n' +
        issues.map((issue) => `  - ${issue.variable}: ${issue.message}`).join('\n'),
    );
    this.issues = issues;
  }
}

export function parseEnv(raw: Record<string, string | undefined> = process.env): Env {
  // File values fill in only where the host environment is silent.
  const fromFile = loadDotenvValues();
  const merged: Record<string, string | undefined> = { ...fromFile };
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) merged[key] = value;
  }

  const result = EnvSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      variable: issue.path.join('.') || '(environment)',
      message: issue.message,
    }));
    throw new EnvironmentError(issues);
  }

  const parsed = result.data;
  const corsOrigins = parsed.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return {
    ...parsed,
    corsOrigins,
    isProduction: parsed.NODE_ENV === 'production',
  };
}

let cached: Env | undefined;

/** Validated environment, parsed once for the process lifetime. */
export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env as Record<string, string | undefined>);
  }
  return cached;
}

/** For tests that need to re-parse with a different environment. */
export function resetEnvForTests(): void {
  cached = undefined;
}
