import type {
  PrismaCommunityRepository,
  AnnouncementRecord,
  EstateBroadcastRecord,
} from './community-repository.js';
import type {
  AnnouncementDto,
  EstateBroadcastDto,
  ResidentCommunityView,
} from '@silverstone/shared';

export interface ResidentCommunityServiceOptions {
  community: PrismaCommunityRepository;
  /**
   * Resolves the acting resident's estate (may be null when the resident
   * has no property yet). The broadcast is estate-scoped, so this is what
   * decides which broadcast the resident sees.
   */
  loadEstateId: (organizationId: string, userId: string) => Promise<string | null>;
}

/**
 * Resident community feed (S7).
 *
 * Read-only: the latest organization announcements plus the active
 * broadcast for the resident's own estate. Residents never write here.
 */
export class ResidentCommunityService {
  constructor(private readonly options: ResidentCommunityServiceOptions) {}

  async get(
    organizationId: string,
    userId: string,
  ): Promise<ResidentCommunityView> {
    const announcements = await this.options.community.listAnnouncements(
      organizationId,
    );
    const estateId = await this.options.loadEstateId(organizationId, userId);
    const broadcast = estateId
      ? await this.options.community.findActiveBroadcast(
          organizationId,
          estateId,
          new Date(),
        )
      : null;

    return {
      announcements: announcements.map(toAnnouncementDto),
      broadcast: broadcast ? toBroadcastDto(broadcast) : null,
    };
  }
}

function toAnnouncementDto(record: AnnouncementRecord): AnnouncementDto {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    publishedAt: record.publishedAt.toISOString(),
  };
}

function toBroadcastDto(record: EstateBroadcastRecord): EstateBroadcastDto {
  return {
    id: record.id,
    estateId: record.estateId,
    title: record.title,
    body: record.body,
    priority: record.priority,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
  };
}
