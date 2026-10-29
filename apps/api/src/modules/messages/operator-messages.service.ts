import { AppError } from '../../lib/errors.js';
import type {
  OperatorMessageThreadRecord,
  PrismaMessageRepository,
} from '../resident/messages-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { AuthAuditContext } from '../auth/auth.service.js';
import type {
  MessageThreadStatus,
  OperatorMessageReplyInput,
  OperatorMessagesResponse,
  OperatorMessageThreadDto,
  OperatorMessageThreadResponse,
} from '@silverstone/shared';

const MAX_BODY_LENGTH = 4000;

export interface OperatorMessageFilter {
  status?: MessageThreadStatus;
  limit?: number;
}

export interface OperatorMessagesServiceOptions {
  messages: PrismaMessageRepository;
  audit: PrismaAuditRepository;
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
    const actorId = requireActor(context);
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
    requireActor(context);
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
    const actorId = requireActor(context);
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

function requireActor(context: AuthAuditContext): string {
  if (!context.actorId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return context.actorId;
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
