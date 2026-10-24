import { AppError } from '../../lib/errors.js';
import { PropertyOptionsSchema, type OrganizationConfig } from '@silverstone/config-schema';
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
  async view(
    _context: {
      organizationId: string;
      actorId: string | null;
      requestId: string | null;
    },
  ): Promise<PropertyOptionsView> {
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
    // Load the active config and verify the base version.
    const snapshot = await this.loadConfig();
    if (input.baseVersion !== snapshot.configVersion) {
      throw new AppError(
        409,
        'CONFLICT',
        `Configuration has changed since this edit began (base version ${input.baseVersion}, active version ${snapshot.configVersion}). Reload and re-apply your changes.`,
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
    const resolved = await this.configService.resolve();
    const updatedConfig: OrganizationConfig = {
      ...resolved.config,
      propertyOptions: parsed.data,
    };

    const created = await this.configRepository.createRecord({
      organizationSlug: this.organizationSlug,
      config: updatedConfig,
      createdBy: context.actorId ?? undefined,
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'propertyOptions.updated',
      targetType: 'organization',
      targetId: created.version.toString(),
      requestId: context.requestId,
      outcome: 'success',
      metadata: { version: created.version, baseVersion: input.baseVersion },
    });

    return buildPropertyOptionsView({
      assetTypes: snapshot.assetTypes,
      unitTypes: snapshot.unitTypes,
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

  const addressComponents = propertyOptions.addressComponents.map((component) => ({
    key: component.key,
    label: component.label,
    requiredForLabels: (component.requiredFor ?? []).map((key) => typeKeyToLabel.get(key) ?? key),
  }));

  return {
    configVersion: snapshot.configVersion,
    identifierConfigured: identifierConfigured(propertyOptions),
    addressComponents,
    identifierTemplate: propertyOptions.identifierTemplate,
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
  };
}
