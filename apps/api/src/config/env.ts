/**
 * Environment configuration.
 *
 * Every deployment-sensitive value enters the API through this module. The
 * process is fail-fast: an invalid or missing required variable aborts
 * startup with a readable, secret-free error. Tests override the raw
 * environment before importing application modules.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Loads `.env` files without overriding already-set process variables,
 * so deployed values always win over committed templates.
 */
function loadDotenvFiles(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    // `npm -w @silverstone/api` runs with the workspace as cwd.
    resolve(process.cwd(), '../../.env'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false });
      break;
    }
  }
}

export function loadDotenvForRuntime(): void {
  loadDotenvFiles();
}

function isPostgresUrl(value: string): boolean {
  return /^(?:postgres|postgresql):\/\/\S+/.test(value);
}

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

    DATABASE_URL: z.string().refine(isPostgresUrl, {
      message: 'PostgreSQL URL must look like postgresql://user:password@host:port/dbname',
    }),
    DIRECT_URL: z
      .string()
      .refine(isPostgresUrl, {
        message: 'PostgreSQL URL must look like postgresql://user:password@host:port/dbname',
      })
      .optional(),

    ORGANIZATION_SLUG: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, 'Lowercase letters, digits and underscores only')
      .default('silverstone'),

    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const origins = env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
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
  readonly issues: Array<{ variable: string; message: string }>;

  constructor(issues: Array<{ variable: string; message: string }>) {
    super(
      `Environment configuration is invalid. Fix the following and restart:\n` +
        issues.map((issue) => `  - ${issue.variable}: ${issue.message}`).join('\n'),
    );
    this.name = 'EnvironmentError';
    this.issues = issues;
  }
}

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(raw);
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
    cached = parseEnv();
  }
  return cached;
}

/** For tests that need to re-parse with a different environment. */
export function resetEnvForTests(): void {
  cached = undefined;
}
