import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { PrismaNotificationRepository, NotificationKind } from './notifications-repository.js';
import type {
  ResidentMarkNotificationReadResponse,
  ResidentNotificationDto,
} from '@silverstone/shared';

export interface ResidentNotificationsServiceOptions {
  notifications: PrismaNotificationRepository;
}

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  linkTo?: string | null;
}

/** The inbox without the bookings section (the route composes both). */
export interface ResidentNotificationInbox {
  recentNotifications: ResidentNotificationDto[];
  unreadCount: number;
}

/**
 * Resident notifications (S10).
 *
 * The inbox shows the resident's recent notifications with an unread
 * count. Everything is scoped to the acting user.
 */
export class ResidentNotificationsService {
  constructor(private readonly options: ResidentNotificationsServiceOptions) {}

  /** The resident's recent notifications plus the unread count. */
  async list(organizationId: string, userId: string): Promise<ResidentNotificationInbox> {
    const [records, unreadCount] = await Promise.all([
      this.options.notifications.listByUser(organizationId, userId),
      this.options.notifications.countUnread(organizationId, userId),
    ]);

    return {
      recentNotifications: records.map(toDto),
      unreadCount,
    };
  }

  /**
   * Mark one of the resident's own notifications as read. Marking an
   * already-read notification is a no-op, not an error.
   */
  async markRead(
    organizationId: string,
    userId: string,
    notificationId: string,
  ): Promise<ResidentMarkNotificationReadResponse> {
    const record = await this.options.notifications.markRead(
      organizationId,
      userId,
      notificationId,
    );
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Notification not found');
    }
    return { ok: true };
  }

  /** Enqueue a notification for a resident. */
  async notify(organizationId: string, userId: string, input: NotifyInput): Promise<void> {
    await this.options.notifications.create({
      organizationId,
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      linkTo: input.linkTo ?? null,
    });
  }

  /** Enqueue a notification inside the caller's transaction. */
  async notifyWithin(
    client: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    input: NotifyInput,
  ): Promise<void> {
    await this.options.notifications.createWithin(client, {
      organizationId,
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      linkTo: input.linkTo ?? null,
    });
  }
}

function toDto(record: {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  linkTo: string | null;
  createdAt: Date;
}): ResidentNotificationDto {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    body: record.body,
    read: record.read,
    linkTo: record.linkTo,
    createdAt: record.createdAt.toISOString(),
  };
}
