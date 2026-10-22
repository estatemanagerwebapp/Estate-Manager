/**
 * Wire contracts shared by the API and the web client.
 * These types describe the envelope, not the domain — domain types arrive with
 * their modules.
 */

/** Stable, machine-readable error codes. Clients branch on these, never on prose. */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'DATABASE_UNAVAILABLE',
  'CONFIG_UNAVAILABLE',
  'CONFIG_INVALID',
  'CONFIG_NOT_PROVISIONED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldError {
  /** Dot-separated path to the offending field, e.g. `body.amountKobo`. */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: FieldError[];
  };
}

export interface ApiSuccessBody<T> {
  data: T;
}

export interface HealthCheckResult {
  status: 'ok' | 'error';
  latencyMs?: number;
  /** Safe, non-sensitive explanation. Never contains connection strings. */
  message?: string;
}

export interface LivenessResponse {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    app: HealthCheckResult;
    database: HealthCheckResult;
  };
}

export interface SystemInfo {
  organization: {
    name: string;
    slug: string;
  };
  config: {
    source: 'database' | 'bootstrap';
    /** Monotonic version of the stored configuration document. */
    version: number;
    schemaVersion: string;
  };
  modules: string[];
  branding: {
    primaryColor: string;
    portalName: string;
  };
}
