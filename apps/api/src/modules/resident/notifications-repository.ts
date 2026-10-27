import type { PrismaClient } from '@prisma/client';

/**
 * Data access for the resident notification inbox (S10).
 *
 * Every query is scoped by organization + the acting user's id, so a
 * resident can only ever reach their own notifications.
 */

export type NotificationKind = 'BOOKING' | 'ANNOUNCEMENT' | 'BROADCAST' | 'COMPLANT' | 'SYSTEM';

export interface NotificationRecord {
  id: string;
  organizationId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  linkTo: string | null;
  createdAt: Date;
}

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  linkTo: string | null;
}

export class PrismaNotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** The acting user's notifications, newest first. */
  async listByUser(
    organizationId: string,
    userId: string,
    limit = 50,
  ): Promise<NotificationRecord[]> {
    const rows = await this.prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toNotificationRecord);
  }

  /** How many notifications the user has not read yet. */
  async countUnread(organizationId: string, userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { organizationId, userId, read: false },
    });
  }

  /**
   * Ownership-checked read receipt. Another resident's notification is
   * invisible, so this returns null for it.
   */
  async markRead(
    organizationId: string,
    userId: string,
    notificationId: string,
  ): Promise<NotificationRecord | null> {
    const existing = await this.prisma.notification.findFirst({
      where: { organizationId, userId, id: notificationId },
    });
    if (!existing) return null;
    const row = await this.prisma.notification.update({
      where: { id: existing.id },
      data: { read: true },
    });
    return toNotificationRecord(row);
  }

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    const row = await this.prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        linkTo: input.linkTo,
        read: false,
      },
    });
    return toNotificationRecord(row);
  }
}

type NotificationRow = {
  id: string;
  organizationId: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  linkTo: string | null;
  createdAt: Date;
};

function toNotificationRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    read: row.read,
    linkTo: row.linkTo,
    createdAt: row.createdAt,
  };
}
