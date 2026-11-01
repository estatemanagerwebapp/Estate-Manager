import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Data access for the resident notification inbox (S10).
 *
 * Every query is scoped by organization + the acting user's id, so a
 * resident can only ever reach their own notifications.
 */

export type NotificationKind =
  | 'BOOKING'
  | 'ANNOUNCEMENT'
  | 'BROADCAST'
  | 'COMPLANT'
  | 'SYSTEM'
  | 'CODE'
  | 'MESSAGE'
  | 'PAYMENT'
  | 'SOS';

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
   * Unread notifications grouped by their target route.
   *
   * The resident sidebar maps each group to a badge, so one query produces
   * every resident counter. A null `linkTo` is grouped as-is.
   */
  async unreadGroupsByLink(
    organizationId: string,
    userId: string,
  ): Promise<Array<{ linkTo: string | null; count: number }>> {
    const rows = await this.prisma.notification.groupBy({
      by: ['linkTo'],
      where: { organizationId, userId, read: false },
      _count: { _all: true },
    });
    return rows.map((row) => ({ linkTo: row.linkTo, count: row._count._all }));
  }

  /**
   * Distinct notification destinations written since a cursor. Used by the
   * live-sync endpoint to decide which resident screens to refresh.
   */
  async linksSince(
    organizationId: string,
    userId: string,
    since: Date,
  ): Promise<Array<string | null>> {
    const rows = await this.prisma.notification.findMany({
      where: { organizationId, userId, createdAt: { gte: since } },
      select: { linkTo: true },
      distinct: ['linkTo'],
      take: 100,
    });
    return rows.map((row) => row.linkTo);
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
    return this.createWithin(this.prisma, input);
  }

  /**
   * Enqueue a notification inside an existing transaction.
   *
   * Composed messages use this so the conversations, their audit row and the
   * resident notifications either all commit or all roll back.
   */
  async createWithin(
    client: Prisma.TransactionClient,
    input: CreateNotificationInput,
  ): Promise<NotificationRecord> {
    const row = await client.notification.create({
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
