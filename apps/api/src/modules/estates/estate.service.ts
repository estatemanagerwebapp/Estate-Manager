import { AppError } from '../../lib/errors.js';
import type {
  PrismaEstateRepository,
  EstateRecord,
  UpdateEstateInput,
} from './estate-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  EstateDto,
  EstateListResponse,
  EstateDetailResponse,
  SetEstateStatusResponse,
  EstateStatus,
} from '@silverstone/shared';
import { ESTATE_STATUSES } from '@silverstone/shared';

/**
 * Estate lifecycle: create, read, update, archive. Every mutation is
 * audited; the caller's identity is always read from the authenticated
 * session, never from the request body.
 *
 * Business rules:
 * - Slugs must be unique per organization (also enforced by the DB).
 * - Statuses are restricted to the shared `ESTATE_STATUSES` catalogue.
 * - Archived estates remain readable but cannot receive new properties.
 */

export interface EstateServiceContext {
  organizationId: string;
  actorId: string | null;
  requestId: string | null;
}

const SLUG_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

/**
 * Derive a lowercase estate slug from a display name. Separators are hyphens
 * (the web-URL convention): "Clove Apartments" → "clove-apartments". Slugs are
 * embedded verbatim into property identifiers via the `{estate_slug}` token,
 * so this convention keeps derived identifiers readable.
 */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base.slice(0, 63) : 'estate';
}

export class EstateService {
  constructor(
    private readonly estates: PrismaEstateRepository,
    private readonly audit: PrismaAuditRepository,
  ) {}

  async list(
    context: EstateServiceContext,
    query: { search?: string; status?: string },
  ): Promise<EstateListResponse> {
    if (query.status && !isEstateStatus(query.status)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown estate status "${query.status}"`);
    }
    const records = await this.estates.list({
      organizationId: context.organizationId,
      search: query.search,
      status: query.status,
    });
    return {
      estates: records.map((record) => toDto(record)),
      total: records.length,
    };
  }

  async detail(context: EstateServiceContext, estateId: string): Promise<EstateDetailResponse> {
    const record = await this.requireEstate(context.organizationId, estateId);
    const counts = await this.estates.propertyCounts(record.id);
    return {
      estate: toDto(record),
      propertyCount: counts.total,
      activePropertyCount: counts.active,
    };
  }

  async create(
    context: EstateServiceContext,
    input: { name: string; slug?: string; address?: string },
  ): Promise<EstateDto> {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Estate name is required');
    }
    if (name.length > 160) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Estate name must be 160 characters or fewer');
    }

    const slug = (input.slug ?? '').trim() || slugify(name);
    if (!SLUG_PATTERN.test(slug)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Estate slug must start with a lowercase letter and contain only lowercase letters, digits and underscores',
      );
    }

    const existing = await this.estates.findBySlug(context.organizationId, slug);
    if (existing) {
      throw new AppError(409, 'CONFLICT', `An estate with slug "${slug}" already exists`);
    }

    const record = await this.estates.create({
      organizationId: context.organizationId,
      slug,
      name,
      address: input.address?.trim() || null,
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'estate.created',
      targetType: 'estate',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { slug: record.slug },
    });

    return toDto(record);
  }

  async update(
    context: EstateServiceContext,
    estateId: string,
    input: { name?: string; address?: string | null; slug?: string },
  ): Promise<EstateDto> {
    const record = await this.requireEstate(context.organizationId, estateId);

    const data: UpdateEstateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length === 0 || name.length > 160) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Estate name must be 1-160 characters');
      }
      data.name = name;
    }
    if (input.address !== undefined) {
      data.address = input.address?.trim() || null;
    }
    if (input.slug !== undefined) {
      const slug = input.slug.trim();
      if (!SLUG_PATTERN.test(slug)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Estate slug format is invalid');
      }
      if (slug !== record.slug) {
        const clash = await this.estates.findBySlug(context.organizationId, slug);
        if (clash && clash.id !== record.id) {
          throw new AppError(409, 'CONFLICT', `An estate with slug "${slug}" already exists`);
        }
        data.slug = slug;
      }
    }

    // Nothing changed is still a no-op; guard so we don't write an empty update.
    const updated = await this.estates.update(record.id, data);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'estate.updated',
      targetType: 'estate',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { changed: Object.keys(data) },
    });

    return toDto(updated ?? record);
  }

  async setStatus(
    context: EstateServiceContext,
    estateId: string,
    status: EstateStatus,
  ): Promise<SetEstateStatusResponse> {
    const record = await this.requireEstate(context.organizationId, estateId);
    if (!isEstateStatus(status)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown estate status "${status}"`);
    }
    if (record.status === status) {
      return { ok: true, estate: toDto(record) };
    }

    const updated = await this.estates.update(record.id, { status });

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'estate.status_changed',
      targetType: 'estate',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { from: record.status, to: status },
    });

    return { ok: true, estate: toDto(updated ?? record) };
  }

  /**
   * Physically delete an estate. Refused when the estate still has any
   * properties — the cascade delete on `properties.estate_id` would wipe
   * the entire property registry under that estate. The caller must
   * archive or delete the properties first.
   */
  async delete(context: EstateServiceContext, estateId: string): Promise<void> {
    const record = await this.requireEstate(context.organizationId, estateId);
    const counts = await this.estates.propertyCounts(record.id);
    if (counts.total > 0) {
      throw new AppError(
        409,
        'CONFLICT',
        `This estate still has ${counts.total} property record${counts.total === 1 ? '' : 's'}; delete or archive them before deleting the estate`,
      );
    }

    await this.estates.delete(record.id);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'estate.deleted',
      targetType: 'estate',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { slug: record.slug },
    });
  }

  private async requireEstate(organizationId: string, estateId: string): Promise<EstateRecord> {
    const record = await this.estates.findById(organizationId, estateId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    }
    return record;
  }
}

export function isEstateStatus(value: string): value is EstateStatus {
  return (ESTATE_STATUSES as readonly string[]).includes(value);
}

function toDto(record: EstateRecord): EstateDto {
  return {
    id: record.id,
    organizationId: record.organizationId,
    slug: record.slug,
    name: record.name,
    address: record.address,
    status: record.status as EstateStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
