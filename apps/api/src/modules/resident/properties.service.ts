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
 * Self-scoped: completed onboarding records identify properties linked to
 * the authenticated household account.
 *
 * The full address is assembled from the typed property columns. There is no
 * runtime address-component configuration.
 */
export class ResidentPropertiesService {
  constructor(private readonly options: ResidentPropertiesServiceOptions) {}

  async list(
    organizationId: string,
    userIds: string | readonly string[],
  ): Promise<ResidentPropertiesResponse> {
    const accountIds = typeof userIds === 'string' ? [userIds] : [...userIds];
    const drafts = await this.options.drafts.findManyByUsers(accountIds);
    const propertyIds = [...new Set(drafts.map((draft) => draft.propertyId))];
    const properties = await Promise.all(
      propertyIds.map(async (propertyId) => {
        const property = await this.options.properties.findById(organizationId, propertyId);
        if (!property) return null;
        const estate = property.estateId
          ? await this.options.estates.findById(organizationId, property.estateId)
          : null;
        return toResidentPropertyDto(property, estate);
      }),
    );
    return { properties: properties.filter((property) => property !== null) };
  }
}

function toResidentPropertyDto(
  property: PropertyRecord,
  estate: EstateRecord | null,
): ResidentPropertyDto {
  return {
    id: property.id,
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
    estate: estate
      ? { id: estate.id, name: estate.name, slug: estate.slug }
      : { id: property.estateId, name: '—', slug: '' },
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
