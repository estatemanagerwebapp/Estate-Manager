import type { PrismaClient } from '@prisma/client';

/**
 * Data access for the resident community feed (S7).
 *
 * Read-only: announcements are organization-wide and broadcasts are
 * estate-scoped. Residents never write to either table.
 */

export type BroadcastPriority = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AnnouncementRecord {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  authorId: string | null;
  publishedAt: Date;
  createdAt: Date;
}

export interface EstateBroadcastRecord {
  id: string;
  organizationId: string;
  estateId: string;
  title: string;
  body: string;
  priority: BroadcastPriority;
  issuedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
}

export class PrismaCommunityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** The organization's announcements, newest first. */
  async listAnnouncements(
    organizationId: string,
    limit = 20,
  ): Promise<AnnouncementRecord[]> {
    const rows = await this.prisma.announcement.findMany({
      where: { organizationId },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      title: row.title,
      body: row.body,
      authorId: row.authorId,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
    }));
  }

  /**
   * The estate's active broadcast, if any. A broadcast is active while it
   * has been issued and has not expired; the most recent one wins.
   */
  async findActiveBroadcast(
    organizationId: string,
    estateId: string,
    now: Date,
  ): Promise<EstateBroadcastRecord | null> {
    const row = await this.prisma.estateBroadcast.findFirst({
      where: {
        organizationId,
        estateId,
        issuedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { issuedAt: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      estateId: row.estateId,
      title: row.title,
      body: row.body,
      priority: row.priority as BroadcastPriority,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }
}
