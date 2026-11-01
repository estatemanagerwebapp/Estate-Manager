import type { Prisma, PrismaClient } from '@prisma/client';
import {
  OrganizationConfigError,
  assertSupportedConfigSchemaVersion,
  parseOrganizationConfig,
  toStoredPayload,
  type OrganizationConfig,
  type ResolvedOrganizationConfig,
  type StoredConfigPayload,
  type StoredConfigRecord,
} from '@silverstone/config-schema';
import { AppError } from '../../lib/errors.js';

interface CreatedConfigRow {
  version: number;
  schemaVersion: string;
  payload: Prisma.JsonValue;
  activatedAt: Date | null;
}

function rowToStoredRecord(row: CreatedConfigRow): StoredConfigRecord {
  return {
    version: row.version,
    schemaVersion: row.schemaVersion,
    payload: row.payload,
    activatedAt: row.activatedAt,
  };
}

/**
 * Data access for organization configuration documents.
 *
 * The repository returns raw, unvalidated JSON — validation belongs to the
 * config-schema package and happens in the service layer, so the database can
 * hold a document that a newer application version cannot parse without
 * failing the request instead of booting with silent drift.
 */
export class PrismaOrganizationConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveRecord(organizationSlug: string): Promise<StoredConfigRecord | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true },
    });
    if (!organization) return null;

    const record = await this.prisma.organizationConfig.findFirst({
      where: { organizationId: organization.id, status: 'ACTIVE' },
      select: { version: true, schemaVersion: true, payload: true, activatedAt: true },
    });
    if (!record) return null;

    return {
      version: record.version,
      schemaVersion: record.schemaVersion,
      payload: record.payload as Prisma.JsonValue,
      activatedAt: record.activatedAt,
    };
  }

  /**
   * Creates the next versioned, immediately-active configuration document.
   * The previous active document is archived in the same transaction, so the
   * partial unique index on (organization_id) WHERE status = 'ACTIVE' is
   * never violated.
   */
  async createRecord(input: {
    organizationSlug: string;
    config: OrganizationConfig;
    createdBy?: string;
    /** Optimistic-concurrency guard for settings writes. */
    expectedVersion?: number;
  }): Promise<StoredConfigRecord> {
    const payload: StoredConfigPayload = toStoredPayload(input.config);

    const created = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.upsert({
        where: { slug: input.organizationSlug },
        update: { name: input.config.organization.name },
        create: { name: input.config.organization.name, slug: input.organizationSlug },
      });

      const latest = await tx.organizationConfig.findFirst({
        where: { organizationId: organization.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const currentVersion = latest?.version ?? 0;
      if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
        throw new AppError(
          409,
          'CONFLICT',
          'Settings changed since they were loaded. Refresh and try again.',
        );
      }

      await tx.organizationConfig.updateMany({
        where: { organizationId: organization.id, status: 'ACTIVE' },
        data: { status: 'ARCHIVED' },
      });

      return tx.organizationConfig.create({
        data: {
          organizationId: organization.id,
          version: currentVersion + 1,
          status: 'ACTIVE',
          schemaVersion: payload.schemaVersion,
          payload: payload as unknown as Prisma.InputJsonValue,
          createdBy: input.createdBy ?? null,
          activatedAt: new Date(),
        },
      });
    });

    return rowToStoredRecord(created);
  }
}

function isPrismaError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    String((error as { name?: unknown }).name ?? '').startsWith('PrismaClient')
  );
}

/**
 * Resolves the effective organization configuration:
 *
 *  1. If a valid ACTIVE document exists in the database, it wins and the
 *     result is marked `source: 'database'`.
 *  2. Unprovisioned deployments fall back to the bootstrap file, marked
 *     `source: 'bootstrap'`, so diagnostics can tell them apart.
 *
 * Database unavailability is NOT swallowed: the database is the source of
 * truth once provisioned, and a live deployment must not silently run on
 * repository defaults.
 */
const DEFAULT_CONFIG_CACHE_TTL_MS = 30_000;

/**
 * Tests create config rows through the repository directly, so a cached
 * active version would make those writes invisible. Production keeps the
 * short-lived cache that removes repeated organization/config lookups from
 * every authenticated request.
 */
function defaultConfigCacheTtlMs(): number {
  return process.env.VITEST === 'true' ? 0 : DEFAULT_CONFIG_CACHE_TTL_MS;
}

export class OrganizationConfigService {
  private cachedConfig: { resolved: ResolvedOrganizationConfig; expiresAt: number } | null = null;

  constructor(
    private readonly repository: PrismaOrganizationConfigRepository,
    private readonly bootstrapLoader: () => OrganizationConfig,
    private readonly organizationSlug: string,
    private readonly cacheTtlMs: number = defaultConfigCacheTtlMs(),
  ) {}

  /**
   * Resolves the active config, reusing the last result for a short window.
   * Pass `bypassCache` on write paths that must compare against the committed
   * version for callers that need optimistic concurrency or provenance.
   */
  async resolve(options: { bypassCache?: boolean } = {}): Promise<ResolvedOrganizationConfig> {
    const cached = this.cachedConfig;
    if (!options.bypassCache && cached !== null && cached.expiresAt > Date.now()) {
      return cached.resolved;
    }

    const resolved = await this.loadResolved();
    if (this.cacheTtlMs > 0) {
      this.cachedConfig = {
        resolved,
        expiresAt: Date.now() + this.cacheTtlMs,
      };
    } else {
      this.cachedConfig = null;
    }
    return resolved;
  }

  /** Drops the per-instance cache after a configuration write. */
  invalidate(): void {
    this.cachedConfig = null;
  }

  private async loadResolved(): Promise<ResolvedOrganizationConfig> {
    let stored: StoredConfigRecord | null;
    try {
      stored = await this.repository.findActiveRecord(this.organizationSlug);
    } catch (error) {
      if (isPrismaError(error)) {
        throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is not available', {
          cause: error,
        });
      }
      throw error;
    }

    if (stored !== null) {
      let config: OrganizationConfig;
      try {
        assertSupportedConfigSchemaVersion(stored.schemaVersion);
        config = parseOrganizationConfig(stored.payload);
      } catch (error) {
        if (error instanceof OrganizationConfigError) {
          throw new AppError(
            503,
            'CONFIG_INVALID',
            'The active organization configuration is invalid',
            {
              cause: error,
              details: error.issues,
            },
          );
        }
        throw error;
      }
      return { config, source: 'database', version: stored.version };
    }

    const config = this.bootstrapLoader();
    return { config, source: 'bootstrap', version: 0 };
  }

  /**
   * Writes the next versioned configuration document. `config` must already be
   * validated by the config-schema package; the repository only serialises it.
   */
  async save(
    config: OrganizationConfig,
    createdBy?: string,
    options: { expectedVersion?: number } = {},
  ): Promise<StoredConfigRecord> {
    const created = await this.repository.createRecord({
      organizationSlug: this.organizationSlug,
      config,
      createdBy,
      expectedVersion: options.expectedVersion,
    });
    this.invalidate();
    return created;
  }
}
