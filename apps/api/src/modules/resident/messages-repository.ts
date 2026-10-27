import type { PrismaClient } from '@prisma/client';

/**
 * Data access for resident ↔ estate-office message threads (S6).
 *
 * Every query is scoped by organization + the acting user's id. The service
 * passes the session-derived user id, never a request-supplied one, so a
 * resident can only ever reach their own threads.
 */

export type MessageThreadStatus = 'OPEN' | 'CLOSED';
export type MessageSenderRole = 'RESIDENT' | 'ESTATE_OFFICE';

export interface MessageRecord {
  id: string;
  threadId: string;
  senderRole: MessageSenderRole;
  body: string;
  createdAt: Date;
}

export interface MessageThreadRecord {
  id: string;
  organizationId: string;
  residentUserId: string;
  subject: string;
  status: MessageThreadStatus;
  createdAt: Date;
  updatedAt: Date;
  messages: MessageRecord[];
}

export interface CreateMessageThreadInput {
  organizationId: string;
  residentUserId: string;
  subject: string;
  body: string;
}

export interface CreateMessageInput {
  threadId: string;
  senderRole: MessageSenderRole;
  body: string;
}

export class PrismaMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Start a thread with its first message. */
  async createThread(input: CreateMessageThreadInput): Promise<MessageThreadRecord> {
    return this.prisma.$transaction(async (tx) => {
      const thread = await tx.messageThread.create({
        data: {
          organizationId: input.organizationId,
          residentUserId: input.residentUserId,
          subject: input.subject,
          status: 'OPEN',
        },
      });
      await tx.message.create({
        data: {
          threadId: thread.id,
          senderRole: 'RESIDENT',
          body: input.body,
        },
      });
      const full = await tx.messageThread.findUniqueOrThrow({
        where: { id: thread.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      return toThreadRecord(full);
    });
  }

  /** Post into an existing thread and bump its updatedAt. */
  async createMessage(input: CreateMessageInput): Promise<MessageThreadRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          threadId: input.threadId,
          senderRole: input.senderRole,
          body: input.body,
        },
      });
      await tx.messageThread.update({
        where: { id: input.threadId },
        data: { updatedAt: new Date() },
      });
      const full = await tx.messageThread.findUniqueOrThrow({
        where: { id: input.threadId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      return toThreadRecord(full);
    });
  }

  /** The acting user's threads, most recently touched first. */
  async listByUser(
    organizationId: string,
    residentUserId: string,
    limit = 50,
  ): Promise<MessageThreadRecord[]> {
    const rows = await this.prisma.messageThread.findMany({
      where: { organizationId, residentUserId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return rows.map(toThreadRecord);
  }

  /** Ownership-checked lookup: another resident's thread is invisible. */
  async findById(
    organizationId: string,
    residentUserId: string,
    threadId: string,
  ): Promise<MessageThreadRecord | null> {
    const row = await this.prisma.messageThread.findFirst({
      where: { organizationId, residentUserId, id: threadId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? toThreadRecord(row) : null;
  }
}

type MessageRow = {
  id: string;
  threadId: string;
  senderRole: string;
  body: string;
  createdAt: Date;
};

type ThreadRow = {
  id: string;
  organizationId: string;
  residentUserId: string;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: MessageRow[];
};

function toThreadRecord(row: ThreadRow): MessageThreadRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    residentUserId: row.residentUserId,
    subject: row.subject,
    status: row.status as MessageThreadStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messages: (row.messages ?? []).map((message) => ({
      id: message.id,
      threadId: message.threadId,
      senderRole: message.senderRole as MessageSenderRole,
      body: message.body,
      createdAt: message.createdAt,
    })),
  };
}
