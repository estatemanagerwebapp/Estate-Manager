import { AppError } from '../../lib/errors.js';
import type { PrismaPropertyRepository, PropertyRecord } from './property-repository.js';
import { validateHierarchy } from './property-rules.js';
import { deriveIdentifier } from '../../lib/property-identifier.js';
import type { PrismaEstateRepository } from '../estates/estate-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { AssetType, UnitType, OrganizationConfig } from '@silverstone/config-schema';
import type {
  PropertyDto,
  PropertyListResponse,
  PropertyDetailResponse,
  PropertyStatus,
} from '@silverstone/shared';

/**
 * Property registry: create, read, update, archive.
 *
 * Identifier derivation, address-component validation and the parent-child
 * hierarchy rules all run against the *resolved* organization configuration,
 * never against a client-supplied type list. The canonical identifier is
 * computed once at create time and is immutable thereafter.
 *
 * Every mutation is audited; the caller's identity comes from the
 * authenticated session, never the request body.
 */

export interface PropertyServiceContext {
  organizationId: string;
  actorId: string | null;
  requestId: string | null;
}

export interface PropertyConfigSnapshot {
  assetTypes: readonly AssetType[];
  unitTypes: readonly UnitType[];
  propertyOptions: OrganizationConfig['propertyOptions'];
  configVersion: number;
}

export class PropertyService {
  constructor(
    private readonly properties: PrismaPropertyRepository,
    private readonly estates: PrismaEstateRepository,
    private readonly audit: PrismaAuditRepository,
  ) {}

  async list(
    context: PropertyServiceContext,
    config: PropertyConfigSnapshot,
    query: {
      estateId?: string;
      typeKey?: string;
      status?: string;
      identifierContains?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<PropertyListResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 50), 200);
    const result = await this.properties.list({
      organizationId: context.organizationId,
      estateId: query.estateId,
      typeKey: query.typeKey,
      status: query.status,
      identifierContains: query.identifierContains,
      page,
      pageSize,
    });
    return {
      properties: result.items.map((record) => this.toDto(record, config)),
      total: result.total,
      page,
      pageSize,
    };
  }

  async detail(
    context: PropertyServiceContext,
    config: PropertyConfigSnapshot,
    propertyId: string,
  ): Promise<PropertyDetailResponse> {
    const record = await this.properties.findById(context.organizationId, propertyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }
    return { property: this.toDto(record, config) };
  }

  async create(
    context: PropertyServiceContext,
    config: PropertyConfigSnapshot,
    input: {
      estateId: string;
      typeKey: string;
      parentPropertyId?: string;
      name?: string;
      addressComponents?: Record<string, string>;
    },
  ): Promise<PropertyDto> {
    const estate = await this.estates.findById(context.organizationId, input.estateId);
    if (!estate) {
      throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    }
    if (estate.status !== 'ACTIVE') {
      throw new AppError(409, 'CONFLICT', 'Properties cannot be created under an archived estate');
    }

    const typeKey = assertConfiguredTypeKey(config, input.typeKey);
    const addressComponents = input.addressComponents ?? {};
    validateAddressComponents(config, typeKey, addressComponents);

    // Hierarchy validation (depth-1, parent type supports units, unit type allowed).
    let parentRecord: PropertyRecord | null = null;
    let parentHasChildren = false;
    if (input.parentPropertyId) {
      parentRecord = await this.properties.findById(context.organizationId, input.parentPropertyId);
      if (!parentRecord || parentRecord.estateId !== estate.id) {
        throw new AppError(404, 'NOT_FOUND', 'Parent property not found in this estate');
      }
      parentHasChildren = await this.properties.hasChildren(parentRecord.id);
      const unitTypeKey = addressComponents['unit_type_key'] ?? null;
      const hierarchy = validateHierarchy({
        parentPropertyId: parentRecord.id,
        propertyId: '', // property does not exist yet; self-reference not applicable
        unitTypeKey,
        estateId: estate.id,
        assetTypes: config.assetTypes,
        propertyOptions: config.propertyOptions,
        parentHasChildren,
        parentIdentifier: parentRecord.identifier,
        parentTypeKey: parentRecord.typeKey,
      });
      if (!hierarchy.valid) {
        throw new AppError(400, 'VALIDATION_ERROR', hierarchy.reasons.join('; '));
      }
    }

    // Derive the canonical identifier from the configured template.
    const derived = deriveIdentifier({
      estateSlug: estate.slug,
      typeKey,
      addressComponents,
      propertyOptions: config.propertyOptions,
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
      typeKey,
      unitTypeKey: input.parentPropertyId ? (addressComponents['unit_type_key'] ?? null) : null,
      parentPropertyId: input.parentPropertyId ?? null,
      addressComponents,
      name: input.name?.trim() || null,
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'property.created',
      targetType: 'property',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { identifier: record.identifier, typeKey: record.typeKey, estateId: estate.id },
    });

    return this.toDto(record, config);
  }

  async update(
    context: PropertyServiceContext,
    config: PropertyConfigSnapshot,
    propertyId: string,
    input: {
      status?: PropertyStatus;
      name?: string | null;
      addressComponents?: Record<string, string>;
    },
  ): Promise<PropertyDto> {
    const record = await this.properties.findById(context.organizationId, propertyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }

    const data: {
      status?: string;
      name?: string | null;
      addressComponents?: Record<string, string>;
    } = {};
    if (input.status !== undefined) {
      if (input.status !== record.status) {
        data.status = input.status;
      }
    }
    if (input.name !== undefined) {
      data.name = input.name?.trim() || null;
    }
    if (input.addressComponents !== undefined) {
      data.addressComponents = input.addressComponents;
    }

    if (Object.keys(data).length === 0) {
      return this.toDto(record, config);
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

    return this.toDto(updated ?? record, config);
  }

  /**
   * Archive a property (status transition only; the record is preserved).
   */
  async archive(
    context: PropertyServiceContext,
    config: PropertyConfigSnapshot,
    propertyId: string,
  ): Promise<PropertyDto> {
    const record = await this.properties.findById(context.organizationId, propertyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }
    const archived = await this.properties.setArchived(propertyId);

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

    return this.toDto(archived ?? record, config);
  }

  /**
   * Physically delete a property. The identifier becomes available again for
   * re-registration within the same estate. Refused when the property has
   * child properties (units) — archive them first.
   */
  async delete(context: PropertyServiceContext, propertyId: string): Promise<void> {
    const record = await this.properties.findById(context.organizationId, propertyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }

    const deleted = await this.properties.deleteIfNoChildren(propertyId);
    if (!deleted) {
      throw new AppError(
        409,
        'CONFLICT',
        'This property has child properties; archive or re-parent them before deleting',
      );
    }

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

  private toDto(record: PropertyRecord, config?: PropertyConfigSnapshot): PropertyDto {
    const typeLabel =
      config?.assetTypes.find((type) => type.key === record.typeKey)?.label ?? record.typeKey;
    const parentProperty =
      record.parentPropertyId && record.parentProperty
        ? { id: record.parentProperty.id, identifier: record.parentProperty.identifier }
        : null;
    return {
      id: record.id,
      estateId: record.estateId,
      identifier: record.identifier,
      name: record.name,
      typeKey: record.typeKey,
      typeLabel,
      status: record.status as PropertyStatus,
      parentPropertyId: record.parentPropertyId,
      parentProperty,
      unitTypeKey: record.unitTypeKey,
      defaultUnitTypeKey: null,
      addressComponents: record.addressComponents,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

/** Enforce the configured property-field contract at the API boundary. */
export function validateAddressComponents(
  config: PropertyConfigSnapshot,
  typeKey: string,
  values: Record<string, string>,
): void {
  const components = config.propertyOptions.addressComponents;
  const configuredKeys = new Set(components.map((component) => component.key));
  const rejectField = (key: string, message: string): never => {
    throw new AppError(400, 'VALIDATION_ERROR', message, {
      details: [{ path: `addressComponents.${key}`, message }],
    });
  };
  for (const key of Object.keys(values)) {
    if (!configuredKeys.has(key)) {
      rejectField(key, `Unknown address component "${key}"`);
    }
    if (typeof values[key] !== 'string') {
      rejectField(key, `Address component "${key}" must be text`);
    }
  }
  for (const component of components) {
    const value = values[component.key]?.trim() ?? '';
    const notApplicable = component.notApplicableFor.includes(typeKey);
    const required =
      !notApplicable &&
      (component.requiredFor.length === 0 || component.requiredFor.includes(typeKey));
    if (required && value === '') {
      rejectField(component.key, `Address component "${component.label}" is required`);
    }
    if (value === '') continue;
    if (value.length > component.maxLength) {
      rejectField(
        component.key,
        `Address component "${component.label}" exceeds ${component.maxLength} characters`,
      );
    }
    if (component.pattern) {
      let matches = false;
      try {
        matches = new RegExp(component.pattern).test(value);
      } catch {
        /* invalid config is surfaced below */
      }
      if (!matches) {
        rejectField(
          component.key,
          `Address component "${component.label}" does not match the required format`,
        );
      }
    }
  }
}

/**
 * Validates that a type key references an active, configured asset type.
 * Throws a 400 when the key is unknown or the type is inactive, so the
 * registry never references a classification that no longer exists.
 */
function assertConfiguredTypeKey(config: PropertyConfigSnapshot, typeKey: string): string {
  const assetType = config.assetTypes.find((type) => type.key === typeKey);
  if (!assetType) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Unknown property type "${typeKey}"; it is not in the configured asset types`,
    );
  }
  if (!assetType.active) {
    throw new AppError(
      409,
      'CONFLICT',
      `Property type "${assetType.label}" is not active; it cannot be assigned to new properties`,
    );
  }
  return typeKey;
}
