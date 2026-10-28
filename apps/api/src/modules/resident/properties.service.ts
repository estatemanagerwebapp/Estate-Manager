import type { PrismaResidentOnboardingRepository } from '../auth/resident-onboarding-repository.js';
import type {
  PrismaPropertyRepository,
  PropertyRecord,
} from '../properties/property-repository.js';
import type { PrismaEstateRepository, EstateRecord } from '../estates/estate-repository.js';
import {
  PROPERTY_KIND_LABELS,
  type ResidentPropertyDto,
  type ResidentPropertiesResponse,
} from '@silverstone/shared';

export interface ResidentPropertiesServiceOptions {
  drafts: PrismaResidentOnboardingRepository;
  properties: PrismaPropertyRepository;
  estates: PrismaEstateRepository;
}

/**
 * Resident properties service (S2).
 *
 * Self-scoped: the acting user's onboarding draft is the single source of
 * truth for which property is assigned. A resident today has exactly one
 * property; the response is list-shaped so a future multi-property model is
 * non-breaking.
 *
 * The full address is assembled from the typed property columns. There is no
 * runtime address-component configuration.
 */
export class ResidentPropertiesService {
  constructor(private readonly options: ResidentPropertiesServiceOptions) {}

  async list(organizationId: string, userId: string): Promise<ResidentPropertiesResponse> {
    const draft = await this.options.drafts.findByUser(userId);
    if (!draft) {
      return { properties: [] };
    }

    const property = await this.options.properties.findById(organizationId, draft.propertyId);
    if (!property) {
      return { properties: [] };
    }

    const estate = property.estateId
      ? await this.options.estates.findById(organizationId, property.estateId)
      : null;

    return {
      properties: [toResidentPropertyDto(property, estate)],
    };
  }
}

function toResidentPropertyDto(
  property: PropertyRecord,
  estate: EstateRecord | null,
): ResidentPropertyDto {
  return {
    identifier: property.identifier,
    kind: property.kind,
    kindLabel: PROPERTY_KIND_LABELS[property.kind] ?? property.kind,
    houseType: property.houseTypeKey,
    houseTypeLabel: property.houseTypeKey,
    streetName: property.streetName,
    houseNumber: property.houseNumber,
    blockName: property.blockName,
    floorNumber: property.floorNumber,
    unitNumber: property.unitNumber,
    plotNumber: property.plotNumber,
    plotName: property.plotName,
    status: property.status,
    estate: estate ? { name: estate.name, slug: estate.slug } : { name: '—', slug: '' },
    fullAddress: formatAddress(property),
  };
}

function formatAddress(property: PropertyRecord): string {
  const parts: string[] = [property.streetName];
  if (property.houseNumber) parts.push(`House ${property.houseNumber}`);
  if (property.blockName) parts.push(property.blockName);
  if (property.floorNumber) parts.push(`Floor ${property.floorNumber}`);
  if (property.unitNumber) parts.push(property.unitNumber);
  if (property.plotNumber) parts.push(`Plot ${property.plotNumber}`);
  if (property.plotName) parts.push(property.plotName);
  return parts.filter(Boolean).join(', ');
}
