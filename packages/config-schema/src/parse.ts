import type { ZodError } from 'zod';
import {
  CONFIG_SCHEMA_VERSION,
  OrganizationConfigSchema,
  SUPPORTED_CONFIG_SCHEMA_MAJOR,
  type OrganizationConfig,
} from './organization-config.schema.js';

export interface ConfigIssue {
  /** Dot-separated path to the offending field, e.g. `payments.bankTransfer.accountNumber`. */
  path: string;
  message: string;
}

export class OrganizationConfigError extends Error {
  readonly issues: ConfigIssue[];

  constructor(message: string, issues: ConfigIssue[] = []) {
    super(message);
    this.name = 'OrganizationConfigError';
    this.issues = issues;
  }
}

export function toConfigIssues(error: ZodError): ConfigIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }));
}

/**
 * Validates an unknown document (JSON file, database payload, admin request)
 * and returns the fully-defaulted configuration. Fails closed.
 */
export function parseOrganizationConfig(input: unknown): OrganizationConfig {
  const result = OrganizationConfigSchema.safeParse(input);
  if (!result.success) {
    throw new OrganizationConfigError(
      'Organization configuration is invalid',
      toConfigIssues(result.error),
    );
  }
  return result.data;
}

export function safeParseOrganizationConfig(
  input: unknown,
): { success: true; config: OrganizationConfig } | { success: false; issues: ConfigIssue[] } {
  const result = OrganizationConfigSchema.safeParse(input);
  if (!result.success) {
    return { success: false, issues: toConfigIssues(result.error) };
  }
  return { success: true, config: result.data };
}

/**
 * Refuses documents written by an incompatible major version. Reading them
 * optimistically would silently drop fields the running code does not know.
 */
export function assertSupportedConfigSchemaVersion(schemaVersion: string): void {
  const [major] = schemaVersion.split('.');
  if (!major || Number(major) !== SUPPORTED_CONFIG_SCHEMA_MAJOR) {
    throw new OrganizationConfigError(
      `Configuration schemaVersion "${schemaVersion}" is not supported by this build (expected ${SUPPORTED_CONFIG_SCHEMA_MAJOR}.x, current ${CONFIG_SCHEMA_VERSION}).`,
    );
  }
}
