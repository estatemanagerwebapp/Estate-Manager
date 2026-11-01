import { AppError } from '../../lib/errors.js';
import type {
  OperatorMessageThreadRecord,
  PrismaMessageRepository,
} from '../resident/messages-repository.js';
import type { Prisma } from '@prisma/client';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import { requireAuditActor, type AuthAuditContext } from '../auth/auth.service.js';
import type {
  OperatorComposeMessageInput,
  OperatorComposeMessageResponse,
  MessageThreadStatus,
  OperatorMessageRecipientsResponse,
  OperatorMessageReplyInput,
  OperatorMessagesResponse,
  OperatorMessageThreadDto,
  OperatorMessageThreadResponse,
} from '@silverstone/shared';
import type { NotifyInput } from '../resident/notifications.service.js';

const MAX_BODY_LENGTH = 4000;

export interface OperatorMessageFilter {
  status?: MessageThreadStatus;
  limit?: number;
}

export interface OperatorMessagesServiceOptions {
  messages: PrismaMessageRepository;
  audit: PrismaAuditRepository;
  /**
   * Writes a resident notification inside the compose transaction. Passing the
   * transaction keeps the conversations, audit row and notifications atomic.
   */
  notifyWithin?: (
    client: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    input: NotifyInput,
  ) => Promise<void>;
}

/**
 * Operator-side resident messaging.
 *
 * Staff read every organization-scoped thread. Replies are posted as
 * ESTATE_OFFICE with the acting staff account as author; closing/reopening is
 * explicit and audited. The resident routes stay self-scoped and unchanged.
 */
export class OperatorMessagesService {
  constructor(private readonly options: OperatorMessagesServiceOptions) {}

  async recipients(organizationId: string): Promise<OperatorMessageRecipientsResponse> {
    return { recipients: await this.options.messages.listOperatorRecipients(organizationId) };
  }

  async compose(
    context: AuthAuditContext,
    input: OperatorComposeMessageInput,
  ): Promise<OperatorComposeMessageResponse> {
    const actorId = requireAuditActor(context);
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!subject || subject.length > 160) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Subject must be between 1 and 160 characters');
    }
    if (!body || body.length > MAX_BODY_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Message body must be between 1 and ${MAX_BODY_LENGTH} characters`,
      );
    }

    const recipients = await this.options.messages.listOperatorRecipients(context.organizationId);
    const targets =
      input.mode === 'DIRECT'
        ? recipients.filter((recipient) => recipient.id === input.recipientUserId)
        : recipients.filter((recipient) => recipient.estate.id === input.estateId);
    if (targets.length === 0) {
      throw new AppError(
        404,
        'NOT_FOUND',
        input.mode === 'DIRECT'
          ? 'Resident recipient not found'
          : 'No active residents are assigned to this estate',
      );
    }

    const threads = await this.options.messages.createOperatorThreads(
      targets.map((recipient) => ({
        organizationId: context.organizationId,
        residentUserId: recipient.id,
        authorId: actorId,
        subject,
        body,
      })),
      {
        // The audit row commits with the conversations. If it fails — for
        // example because the database is missing the `message_sent` enum
        // value — the whole batch rolls back instead of leaving recipients
        // messaged with no audit trail.
        beforeCommit: async (tx, createdThreads) => {
          await this.options.audit.recordWithin(tx, {
            organizationId: context.organizationId,
            actorId,
            eventType: 'message.sent',
            targetType: 'message_thread',
            targetId: createdThreads[0]?.id ?? null,
            requestId: context.requestId,
            outcome: 'success',
            metadata: {
              subject,
              mode: input.mode,
              recipientCount: targets.length,
              estateId: input.mode === 'BROADCAST' ? input.estateId : targets[0]?.estate.id,
            },
          });

          if (this.options.notifyWithin) {
            for (const recipient of targets) {
              await this.options.notifyWithin(tx, context.organizationId, recipient.id, {
                kind: 'MESSAGE',
                title: subject,
                body: body.slice(0, 240),
                // The resident Messages screen is not part of the portal; the
                // inbox is the surface that can open this update.
                linkTo: '/resident/app/notifications',
              });
            }
          }
        },
      },
    );

    return {
      ok: true,
      recipientCount: targets.length,
      ...(input.mode === 'DIRECT' && threads[0] ? { threadId: threads[0].id } : {}),
    };
  }

  async list(
    organizationId: string,
    filter: OperatorMessageFilter,
  ): Promise<OperatorMessagesResponse> {
    const records = await this.options.messages.listForOrganization({
      organizationId,
      status: filter.status,
      limit: filter.limit,
    });
    return { threads: records.map(toDto) };
  }

  async reply(
    context: AuthAuditContext,
    threadId: string,
    input: OperatorMessageReplyInput,
  ): Promise<OperatorMessageThreadResponse> {
    const actorId = requireAuditActor(context);
    const body = input.body.trim();
    if (!body || body.length > MAX_BODY_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `The message body must be between 1 and ${MAX_BODY_LENGTH} characters`,
      );
    }

    const current = await this.requireThread(context.organizationId, threadId);
    if (current.status === 'CLOSED') {
      throw new AppError(409, 'CONFLICT', 'This conversation is closed');
    }

    await this.options.messages.createMessage({
      threadId: current.id,
      senderRole: 'ESTATE_OFFICE',
      authorId: actorId,
      body,
    });
    await this.options.messages.markReadByStaff(context.organizationId, current.id, new Date());

    const record = await this.requireThread(context.organizationId, current.id);
    await this.options.audit.record({
      organizationId: context.organizationId,
      actorId,
      eventType: 'message.replied',
      targetType: 'message_thread',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        subject: record.subject,
        residentUserId: record.residentUserId,
      },
    });

    return { ok: true, thread: toDto(record) };
  }

  /** Mark the shared staff read position for one thread. */
  async markRead(
    context: AuthAuditContext,
    threadId: string,
  ): Promise<OperatorMessageThreadResponse> {
    requireAuditActor(context);
    const current = await this.requireThread(context.organizationId, threadId);
    await this.options.messages.markReadByStaff(context.organizationId, current.id, new Date());
    const record = await this.requireThread(context.organizationId, current.id);
    return { ok: true, thread: toDto(record) };
  }

  async setStatus(
    context: AuthAuditContext,
    threadId: string,
    status: MessageThreadStatus,
  ): Promise<OperatorMessageThreadResponse> {
    const actorId = requireAuditActor(context);
    const current = await this.requireThread(context.organizationId, threadId);
    if (current.status === status) {
      return { ok: true, thread: toDto(current) };
    }

    await this.options.messages.setStatus(context.organizationId, current.id, status);
    const record = await this.requireThread(context.organizationId, current.id);
    await this.options.audit.record({
      organizationId: context.organizationId,
      actorId,
      eventType: status === 'CLOSED' ? 'message.thread_closed' : 'message.thread_reopened',
      targetType: 'message_thread',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        subject: record.subject,
        residentUserId: record.residentUserId,
        from: current.status,
        to: status,
      },
    });

    return { ok: true, thread: toDto(record) };
  }

  private async requireThread(
    organizationId: string,
    threadId: string,
  ): Promise<OperatorMessageThreadRecord> {
    const record = await this.options.messages.findForOrganization(organizationId, threadId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    }
    return record;
  }
}

function toDto(record: OperatorMessageThreadRecord): OperatorMessageThreadDto {
  const readAt = record.staffLastReadAt?.getTime() ?? 0;
  const unreadCount = record.messages.filter(
    (message) => message.senderRole === 'RESIDENT' && message.createdAt.getTime() > readAt,
  ).length;

  return {
    id: record.id,
    subject: record.subject,
    status: record.status,
    resident: record.resident,
    property: record.property,
    messages: record.messages.map((message) => ({
      id: message.id,
      senderRole: message.senderRole,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      author: message.author,
    })),
    unreadCount,
    staffLastReadAt: record.staffLastReadAt ? record.staffLastReadAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
