import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OrganizationConfigError,
  parseOrganizationConfig,
  type OrganizationConfig,
} from '@silverstone/config-schema';

/**
 * Loads bootstrap defaults from the repository.
 *
 * Candidate locations, in order:
 *   1. $SILVERSTONE_CONFIG_FILE (explicit override for tests and deployments)
 *   2. ./config/organization.default.json   (repo root, when cwd is the repo)
 *   3. ../../config/organization.default.json (when cwd is apps/api)
 *
 * The loader validates the document, so a corrupt or drift-edited file fails
 * startup instead of producing a half-configured organization.
 */
export function loadBootstrapConfig(pathOverride?: string): OrganizationConfig {
  const candidates: string[] = [];
  if (pathOverride) candidates.push(pathOverride);
  if (process.env.SILVERSTONE_CONFIG_FILE) candidates.push(process.env.SILVERSTONE_CONFIG_FILE);
  candidates.push(
    resolve(process.cwd(), 'config/organization.default.json'),
    resolve(process.cwd(), '../../config/organization.default.json'),
  );

  const found = candidates
    .map((candidate) => resolve(candidate))
    .find((candidate) => existsSync(candidate));

  if (!found) {
    throw new OrganizationConfigError(
      'No bootstrap organization configuration found. Looked for: ' +
        candidates.map((candidate) => resolve(candidate)).join(', '),
    );
  }

  const raw = readFileSync(found, 'utf8');
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new OrganizationConfigError(
      `Bootstrap configuration at ${found} is not valid JSON`,
      [
        {
          path: '$file',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    );
  }

  const config = parseOrganizationConfig(document);
  configSource = found;
  return config;
}

/** The resolved path of the bootstrap file, set on the last successful load. */
let configSource: string | undefined;

export function bootstrapConfigSource(): string | undefined {
  return configSource;
}
