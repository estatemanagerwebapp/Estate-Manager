import { AppError } from '../../lib/errors.js';
import type {
  PrismaMessageRepository,
  MessageThreadRecord,
} from './messages-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  ResidentMessageThreadDto,
  ResidentMessagesResponse,
  ResidentSendMessageInput,
  ResidentSendMessageResponse,
} from '@silverstone/shared';

/** Longest accepted thread subject. */
const MAX_SUBJECT_LENGTH = 160;
/** Longest accepted message body. */
const MAX_BODY_LENGTH = 4000;

export interface ResidentMessagesServiceOptions {
  messages: PrismaMessageRepository;
  audit: PrismaAuditRepository;
}

/**
 * Resident ↔ estate-office messages (S6).
 *
 * A resident starts a thread (or replies into an open one). Everything is
 * self-scoped: the acting user's id comes from the session and is applied
 * to every query, so another resident's thread is invisible (404).
 */
export class ResidentMessagesService {
  constructor(private readonly options: ResidentMessagesServiceOptions) {}

  /** The acting resident's threads, most recently touched first. */
  async list(
    organizationId: string,
    userId: string,
  ): Promise<ResidentMessagesResponse> {
    const records = await this.options.messages.listByUser(organizationId, userId);
    return { threads: records.map(toDto) };
  }

  /**
   * Start a new thread (no `threadId`) or reply into an existing one.
   * Replies into a closed thread are rejected.
   */
  async send(
    organizationId: string,
    userId: string,
    input: ResidentSendMessageInput,
    requestId: string | null,
  ): Promise<ResidentSendMessageResponse> {
    const body = input.body.trim();
    if (!body || body.length > MAX_BODY_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Message body is required');
    }

    const record = input.threadId
      ? await this.reply(organizationId, userId, input.threadId, body)
      : await this.startThread(organizationId, userId, input.subject, body);

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.message_sent',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        threadId: record.id,
        subject: record.subject,
        reply: Boolean(input.threadId),
      },
    });

    return { ok: true, thread: toDto(record) };
  }

  private async startThread(
    organizationId: string,
    userId: string,
    subject: string | undefined,
    body: string,
  ): Promise<MessageThreadRecord> {
    const cleanSubject = (subject ?? '').trim();
    if (!cleanSubject || cleanSubject.length > MAX_SUBJECT_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Subject is required');
    }
    return this.options.messages.createThread({
      organizationId,
      residentUserId: userId,
      subject: cleanSubject,
      body,
    });
  }

  private async reply(
    organizationId: string,
    userId: string,
    threadId: string,
    body: string,
  ): Promise<MessageThreadRecord> {
    const thread = await this.options.messages.findById(
      organizationId,
      userId,
      threadId,
    );
    if (!thread) {
      throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    }
    if (thread.status === 'CLOSED') {
      throw new AppError(409, 'CONFLICT', 'This conversation is closed');
    }
    return this.options.messages.createMessage({
      threadId: thread.id,
      senderRole: 'RESIDENT',
      body,
    });
  }
}

function toDto(record: MessageThreadRecord): ResidentMessageThreadDto {
  return {
    id: record.id,
    subject: record.subject,
    status: record.status,
    messages: record.messages.map((message) => ({
      id: message.id,
      senderRole: message.senderRole,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
