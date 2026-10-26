import type {
  PrismaResidentOnboardingRepository,
} from '../auth/resident-onboarding-repository.js';
import type { PrismaPropertyRepository, PropertyRecord } from '../properties/property-repository.js';
import type { PrismaEstateRepository, EstateRecord } from '../estates/estate-repository.js';
import type { PropertyConfigSnapshot } from '../properties/property.service.js';
import type {
  ResidentPropertyDto,
  ResidentPropertiesResponse,
} from '@silverstone/shared';

export interface ResidentPropertiesServiceOptions {
  drafts: PrismaResidentOnboardingRepository;
  properties: PrismaPropertyRepository;
  estates: PrismaEstateRepository;
  loadConfig: () => Promise<PropertyConfigSnapshot>;
}

/**
 * Resident properties service (S2).
 *
 * Self-scoped: the acting user's onboarding draft is the single source of
 * truth for which property is assigned. A resident today has exactly one
 * property; the response is list-shaped so a future multi-property model
 * is non-breaking.
 *
 * The full address is formatted from the configured component labels
 * (`propertyOptions.addressComponents`, in config order) joined with the
 * stored values — the same display rule the operator property detail page
 * follows on the web.
 */
export class ResidentPropertiesService {
  constructor(private readonly options: ResidentPropertiesServiceOptions) {}

  async list(
    organizationId: string,
    userId: string,
  ): Promise<ResidentPropertiesResponse> {
    const draft = await this.options.drafts.findByUser(userId);
    if (!draft) {
      // No linked onboarding: an acting user that is not a resident with an
      // assigned property. An empty list is the non-breaking answer.
      return { properties: [] };
    }

    const property = await this.options.properties.findById(organizationId, draft.propertyId);
    if (!property) {
      return { properties: [] };
    }

    const config = await this.options.loadConfig();
    const estate = property.estateId
      ? await this.options.estates.findById(organizationId, property.estateId)
      : null;

    return {
      properties: [toResidentPropertyDto(property, estate, config)],
    };
  }
}

function toResidentPropertyDto(
  property: PropertyRecord,
  estate: EstateRecord | null,
  config: PropertyConfigSnapshot,
): ResidentPropertyDto {
  const typeLabel =
    config.assetTypes.find((type) => type.key === property.typeKey)?.label ?? property.typeKey;
  const components = config.propertyOptions.addressComponents;
  const fullAddress = components
    .map((component) => property.addressComponents[component.key])
    .filter((value): value is string => value !== undefined && value !== '')
    .join(', ');

  return {
    identifier: property.identifier,
    typeKey: property.typeKey,
    typeLabel,
    status: property.status,
    estate: estate
      ? { name: estate.name, slug: estate.slug }
      : { name: '—', slug: '' },
    fullAddress,
    addressComponents: property.addressComponents,
  };
}
