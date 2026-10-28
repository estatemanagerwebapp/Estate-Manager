import { AppError } from '../../lib/errors.js';
import {
  OrganizationConfigSchema,
  PropertyOptionsSchema,
  type OrganizationConfig,
} from '@silverstone/config-schema';
import { identifierConfigured } from '../../lib/property-identifier.js';
import type { PropertyOptionsView, UpdatePropertyOptionsRequest } from '@silverstone/shared';
import type { PrismaOrganizationConfigRepository } from './config.service.js';
import type { OrganizationConfigService } from './config.service.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { PropertyConfigSnapshot } from '../properties/property.service.js';

/**
 * Property-options surface: read the active block and update it with
 * optimistic concurrency.
 *
 * The property-options block lives inside the versioned `OrganizationConfig`
 * document. An update creates a new document version in which only the
 * `propertyOptions` block differs from the previous active version; every
 * other block is carried over unchanged. The `baseVersion` check in the
 * request body implements optimistic concurrency: if the active version has
 * advanced past the caller's `baseVersion`, the update is refused with 409.
 */
export class PropertyOptionsService {
  constructor(
    private readonly configService: OrganizationConfigService,
    private readonly configRepository: PrismaOrganizationConfigRepository,
    private readonly audit: PrismaAuditRepository,
    private readonly loadConfig: () => Promise<PropertyConfigSnapshot>,
    private readonly organizationSlug: string,
  ) {}

  /**
   * Returns the active property-options block, rendered into the view shape
   * consumed by the frontend.
   */
  async view(_context: {
    organizationId: string;
    actorId: string | null;
    requestId: string | null;
  }): Promise<PropertyOptionsView> {
    const snapshot = await this.loadConfig();
    return buildPropertyOptionsView(snapshot);
  }

  /**
   * Updates the property-options block. The caller must supply the
   * `baseVersion` they are building on; a stale version is refused with 409.
   * The update atomically archives the current active document and activates
   * a new one in the same Prisma transaction.
   */
  async update(
    context: {
      organizationId: string;
      actorId: string | null;
      requestId: string | null;
    },
    input: UpdatePropertyOptionsRequest,
  ): Promise<PropertyOptionsView> {
    // Read the committed version directly. A config write must never be
    // validated against a cached snapshot, or two writers could both pass
    // the optimistic-concurrency check.
    const resolved = await this.configService.resolve({ bypassCache: true });
    if (input.baseVersion !== resolved.version) {
      throw new AppError(
        409,
        'CONFLICT',
        `Configuration has changed since this edit began (base version ${input.baseVersion}, active version ${resolved.version}). Reload and re-apply your changes.`,
      );
    }

    // Validate the proposed block against the shared schema.
    const parsed = PropertyOptionsSchema.safeParse(input.propertyOptions);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    }

    // Build the new full config document: carry over everything except
    // propertyOptions from the active version.
    const updatedConfig = OrganizationConfigSchema.safeParse({
      ...resolved.config,
      propertyOptions: parsed.data,
    });
    if (!updatedConfig.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        updatedConfig.error.issues.map((issue) => issue.message).join('; '),
      );
    }

    const created = await this.configRepository.createRecord({
      organizationSlug: this.organizationSlug,
      config: updatedConfig.data as OrganizationConfig,
      createdBy: context.actorId ?? undefined,
    });

    // Permissions and property validation read the same cached config on this
    // instance. Drop it so the new active version is visible immediately.
    this.configService.invalidate();

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'propertyOptions.updated',
      targetType: 'organization',
      targetId: null, // organization-level event; the version is recorded in metadata
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        version: created.version,
        baseVersion: input.baseVersion,
        organizationSlug: this.organizationSlug,
      },
    });

    return buildPropertyOptionsView({
      assetTypes: resolved.config.assetModel.types,
      unitTypes: resolved.config.assetModel.unitTypes,
      propertyOptions: parsed.data,
      configVersion: created.version,
    });
  }
}

/**
 * Builds the `PropertyOptionsView` consumed by the frontend from a config
 * snapshot. Translates the raw `addressComponents` config into the view shape
 * with `requiredForLabels` resolved to human-readable labels.
 */
function buildPropertyOptionsView(snapshot: PropertyConfigSnapshot): PropertyOptionsView {
  const { propertyOptions, assetTypes, unitTypes } = snapshot;

  const typeKeyToLabel = new Map<string, string>();
  for (const type of assetTypes) {
    typeKeyToLabel.set(type.key, type.label);
  }
  const houseTypeKeyToLabel = new Map<string, string>();
  for (const houseType of propertyOptions.houseTypes ?? []) {
    houseTypeKeyToLabel.set(`house.${houseType.key}`, houseType.label);
  }

  const addressComponents = propertyOptions.addressComponents.map((component) => ({
    key: component.key,
    label: component.label,
    requiredForLabels: (component.requiredFor ?? []).map(
      (key) => typeKeyToLabel.get(key) ?? houseTypeKeyToLabel.get(key) ?? key,
    ),
    notApplicableFor: component.notApplicableFor ?? [],
    pattern: component.pattern ?? null,
    maxLength: component.maxLength ?? 64,
  }));

  return {
    configVersion: snapshot.configVersion,
    identifierConfigured: identifierConfigured(propertyOptions),
    addressComponents,
    identifierTemplate: propertyOptions.identifierTemplate,
    identifierMax: propertyOptions.identifierMax ?? 120,
    assetTypes: assetTypes.map((type) => ({
      key: type.key,
      label: type.label,
      active: type.active,
      detailKind: type.detailKind,
    })),
    unitTypes: unitTypes.map((unit) => ({
      key: unit.key,
      label: unit.label,
      bedrooms: unit.bedrooms,
      active: unit.active,
    })),
    houseTypes: (propertyOptions.houseTypes ?? []).map((houseType) => ({
      key: houseType.key,
      label: houseType.label,
      active: houseType.active,
    })),
  };
}
