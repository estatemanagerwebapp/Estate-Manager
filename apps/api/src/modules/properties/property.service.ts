import { AppError } from '../../lib/errors.js';
import type { PrismaPropertyRepository, PropertyRecord } from './property-repository.js';
import {
  normalizeAddressFields,
  validatePropertyFields,
  type PropertyAddressFields,
} from './property-rules.js';
import { deriveIdentifier } from '../../lib/property-identifier.js';
import type { PrismaEstateRepository } from '../estates/estate-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { HouseTypeRecord, PrismaHouseTypeRepository } from './house-type-repository.js';
import {
  PROPERTY_KINDS,
  PROPERTY_KIND_LABELS,
  PROPERTY_STATUSES,
  type CreatePropertyInput,
  type PropertyDetailResponse,
  type PropertyDto,
  type HouseTypesResponse,
  type PropertyKind,
  type PropertyListResponse,
  type PropertyStatus,
  type UpdatePropertyInput,
} from '@silverstone/shared';

/**
 * Property registry: create, read, update, archive.
 *
 * The property shape is explicit (kind + typed address columns). There is no
 * runtime property configuration, no parent/child property hierarchy,
 * and no "identifier not configured" state. The canonical identifier is
 * computed once at create time from the typed fields and is immutable.
 *
 * Every mutation is audited; the caller's identity comes from the
 * authenticated session, never the request body.
 */

export interface PropertyServiceContext {
  organizationId: string;
  actorId: string | null;
  requestId: string | null;
}

export interface PropertyListQuery {
  estateId?: string;
  kind?: string;
  status?: string;
  identifierContains?: string;
  page?: number;
  pageSize?: number;
}

export class PropertyService {
  constructor(
    private readonly properties: PrismaPropertyRepository,
    private readonly estates: PrismaEstateRepository,
    private readonly houseTypes: PrismaHouseTypeRepository,
    private readonly audit: PrismaAuditRepository,
  ) {}

  /** Active house types for the create form and import template. */
  async listHouseTypes(): Promise<HouseTypesResponse> {
    const houseTypes = await this.houseTypes.listActive();
    return {
      houseTypes: houseTypes.map((type) => ({
        key: type.key,
        label: type.label,
        requiresUnitFields: type.requiresUnitFields,
        active: type.active,
      })),
    };
  }

  async list(
    context: PropertyServiceContext,
    query: PropertyListQuery,
  ): Promise<PropertyListResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 50), 200);
    const result = await this.properties.list({
      organizationId: context.organizationId,
      estateId: query.estateId,
      kind: query.kind,
      status: query.status,
      identifierContains: query.identifierContains,
      page,
      pageSize,
    });
    const houseTypes = await this.houseTypes.list();
    const byKey = new Map(houseTypes.map((type) => [type.key, type]));
    return {
      properties: result.items.map((record) =>
        this.toDto(record, record.houseTypeKey ? (byKey.get(record.houseTypeKey) ?? null) : null),
      ),
      total: result.total,
      page,
      pageSize,
    };
  }

  async detail(
    context: PropertyServiceContext,
    propertyId: string,
  ): Promise<PropertyDetailResponse> {
    const record = await this.properties.findById(context.organizationId, propertyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }
    const houseType = record.houseTypeKey
      ? await this.houseTypes.findByKey(record.houseTypeKey)
      : null;
    return { property: this.toDto(record, houseType) };
  }

  async create(context: PropertyServiceContext, input: CreatePropertyInput): Promise<PropertyDto> {
    if (!PROPERTY_KINDS.includes(input.kind)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Property type must be House, Land, or Both');
    }

    const estate = await this.estates.findById(context.organizationId, input.estateId);
    if (!estate) {
      throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    }
    if (estate.status !== 'ACTIVE') {
      throw new AppError(409, 'CONFLICT', 'Properties cannot be created under an archived estate');
    }

    const houseType = await this.resolveHouseType(input.kind, input.houseType ?? null);
    const fields = normalizeAddressFields({
      streetName: input.streetName,
      houseNumber: input.houseNumber,
      blockName: input.blockName,
      floorNumber: input.floorNumber,
      unitNumber: input.unitNumber,
      plotNumber: input.plotNumber,
      plotName: input.plotName,
    });
    this.assertValidFields(input.kind, houseType, fields);

    const name = normalizeName(input.name);
    const derived = deriveIdentifier({
      estateSlug: estate.slug,
      kind: input.kind,
      houseType: houseType
        ? { key: houseType.key, requiresUnitFields: houseType.requiresUnitFields }
        : null,
      streetName: fields.streetName ?? '',
      houseNumber: fields.houseNumber,
      blockName: fields.blockName,
      floorNumber: fields.floorNumber,
      unitNumber: fields.unitNumber,
      plotNumber: fields.plotNumber,
    });
    if (derived.incomplete || derived.identifier === null) {
      throw new AppError(
        409,
        'CONFLICT',
        `A valid identifier could not be derived: ${derived.reasons.join('; ')}`,
      );
    }

    // Pre-check for collisions (friendly 409 with the existing property id);
    // the database unique index is the authoritative backstop under a race.
    const existing = await this.properties.findExistingIdentifier(estate.id, derived.identifier);
    if (existing) {
      throw new AppError(
        409,
        'CONFLICT',
        `A property with identifier "${derived.identifier}" already exists (${existing.id})`,
      );
    }

    const record = await this.properties.create({
      estateId: estate.id,
      organizationId: context.organizationId,
      identifier: derived.identifier,
      kind: input.kind,
      houseTypeKey: houseType?.key ?? null,
      streetName: fields.streetName ?? '',
      houseNumber: fields.houseNumber ?? null,
      blockName: fields.blockName ?? null,
      floorNumber: fields.floorNumber ?? null,
      unitNumber: fields.unitNumber ?? null,
      plotNumber: fields.plotNumber ?? null,
      plotName: fields.plotName ?? null,
      name,
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'property.created',
      targetType: 'property',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        identifier: record.identifier,
        kind: record.kind,
        houseTypeKey: record.houseTypeKey,
        estateId: estate.id,
      },
    });

    return this.toDto(record, houseType);
  }

  async update(
    context: PropertyServiceContext,
    propertyId: string,
    input: UpdatePropertyInput,
  ): Promise<PropertyDto> {
    const record = await this.properties.findById(context.organizationId, propertyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }

    const houseType = record.houseTypeKey
      ? await this.houseTypes.findByKey(record.houseTypeKey)
      : null;

    const merged = normalizeAddressFields({
      streetName: input.streetName !== undefined ? input.streetName : record.streetName,
      houseNumber: input.houseNumber !== undefined ? input.houseNumber : record.houseNumber,
      blockName: input.blockName !== undefined ? input.blockName : record.blockName,
      floorNumber: input.floorNumber !== undefined ? input.floorNumber : record.floorNumber,
      unitNumber: input.unitNumber !== undefined ? input.unitNumber : record.unitNumber,
      plotNumber: input.plotNumber !== undefined ? input.plotNumber : record.plotNumber,
      plotName: input.plotName !== undefined ? input.plotName : record.plotName,
    });
    this.assertValidFields(record.kind, houseType, merged);

    const data: {
      status?: string;
      name?: string | null;
      streetName?: string;
      houseNumber?: string | null;
      blockName?: string | null;
      floorNumber?: string | null;
      unitNumber?: string | null;
      plotNumber?: string | null;
      plotName?: string | null;
    } = {};

    if (input.status !== undefined && input.status !== record.status) {
      if (!PROPERTY_STATUSES.includes(input.status)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid property status');
      }
      data.status = input.status;
    }
    if (input.name !== undefined) {
      data.name = normalizeName(input.name);
    }
    if (input.streetName !== undefined) data.streetName = merged.streetName ?? '';
    for (const field of [
      'houseNumber',
      'blockName',
      'floorNumber',
      'unitNumber',
      'plotNumber',
      'plotName',
    ] as const) {
      if (input[field] !== undefined) data[field] = merged[field] ?? null;
    }

    if (Object.keys(data).length === 0) {
      return this.toDto(record, houseType);
    }

    const updated = await this.properties.update(propertyId, data);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: input.status !== undefined ? 'property.status_changed' : 'property.updated',
      targetType: 'property',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { changed: Object.keys(data) },
    });

    return this.toDto(updated ?? record, houseType);
  }

  /** Archive a property (status transition only; the record is preserved). */
  async archive(context: PropertyServiceContext, propertyId: string): Promise<PropertyDto> {
    const record = await this.properties.findById(context.organizationId, propertyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }
    const archived = await this.properties.setArchived(propertyId);
    const houseType = archived?.houseTypeKey
      ? await this.houseTypes.findByKey(archived.houseTypeKey)
      : null;

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'property.status_changed',
      targetType: 'property',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { from: record.status, to: 'ARCHIVED' },
    });

    return this.toDto(archived ?? record, houseType);
  }

  /** Physically delete a property. Its identifier becomes available again. */
  async delete(context: PropertyServiceContext, propertyId: string): Promise<void> {
    const record = await this.properties.findById(context.organizationId, propertyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }

    await this.properties.delete(propertyId);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'property.deleted',
      targetType: 'property',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { identifier: record.identifier, estateId: record.estateId },
    });
  }

  private async resolveHouseType(
    kind: PropertyKind,
    key: string | null,
  ): Promise<HouseTypeRecord | null> {
    if (kind === 'LAND') {
      if (!key) return null;
      const supplied = await this.houseTypes.findByKey(key);
      if (!supplied) {
        throw new AppError(400, 'VALIDATION_ERROR', `House type "${key}" does not exist`);
      }
      return supplied;
    }

    if (!key) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Select a house type');
    }
    const houseType = await this.houseTypes.findByKey(key);
    if (!houseType || !houseType.active) {
      throw new AppError(400, 'VALIDATION_ERROR', `House type "${key}" is not available`);
    }
    return houseType;
  }

  private assertValidFields(
    kind: PropertyKind,
    houseType: HouseTypeRecord | null,
    fields: PropertyAddressFields,
  ): void {
    const validation = validatePropertyFields({ kind, houseType, ...fields });
    if (!validation.valid) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Property details are invalid', {
        details: Object.entries(validation.fieldErrors).map(([path, message]) => ({
          path,
          message,
        })),
      });
    }
  }

  private toDto(record: PropertyRecord, houseType: HouseTypeRecord | null): PropertyDto {
    return {
      id: record.id,
      estateId: record.estateId,
      identifier: record.identifier,
      name: record.name,
      kind: record.kind,
      kindLabel: PROPERTY_KIND_LABELS[record.kind] ?? record.kind,
      houseType: record.houseTypeKey,
      houseTypeLabel: houseType?.label ?? record.houseTypeKey,
      houseTypeRequiresUnitFields: houseType?.requiresUnitFields ?? false,
      streetName: record.streetName,
      houseNumber: record.houseNumber,
      blockName: record.blockName,
      floorNumber: record.floorNumber,
      unitNumber: record.unitNumber,
      plotNumber: record.plotNumber,
      plotName: record.plotName,
      status: record.status as PropertyStatus,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

function normalizeName(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length > 120) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Property name must be 120 characters or fewer');
  }
  return trimmed.length === 0 ? null : trimmed;
}
