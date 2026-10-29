import type { Prisma, PrismaClient } from '@prisma/client';

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
  authorId: string | null;
  body: string;
  createdAt: Date;
}

export interface MessageThreadRecord {
  id: string;
  organizationId: string;
  residentUserId: string;
  subject: string;
  status: MessageThreadStatus;
  staffLastReadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  messages: MessageRecord[];
}

export interface CreateMessageThreadInput {
  organizationId: string;
  residentUserId: string;
  authorId?: string | null;
  subject: string;
  body: string;
}

export interface CreateMessageInput {
  threadId: string;
  senderRole: MessageSenderRole;
  authorId?: string | null;
  body: string;
}

export interface OperatorMessageQuery {
  organizationId: string;
  status?: MessageThreadStatus;
  limit?: number;
}

export interface OperatorMessageActorRecord {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
}

export interface OperatorMessageResidentRecord {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
}

export interface OperatorMessagePropertyRecord {
  id: string;
  identifier: string;
  name: string | null;
  estate: { id: string; name: string; slug: string };
}

export interface OperatorMessageRecord {
  id: string;
  senderRole: MessageSenderRole;
  body: string;
  createdAt: Date;
  author: OperatorMessageActorRecord | null;
}

export interface OperatorMessageThreadRecord {
  id: string;
  organizationId: string;
  residentUserId: string;
  subject: string;
  status: MessageThreadStatus;
  staffLastReadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resident: OperatorMessageResidentRecord | null;
  property: OperatorMessagePropertyRecord | null;
  messages: OperatorMessageRecord[];
}

const operatorThreadInclude = {
  resident: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      residentOnboarding: {
        select: {
          property: {
            select: {
              id: true,
              identifier: true,
              name: true,
              estate: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
  },
  messages: {
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, fullName: true, email: true, role: true } },
    },
  },
} satisfies Prisma.MessageThreadInclude;

type OperatorThreadRow = Prisma.MessageThreadGetPayload<{ include: typeof operatorThreadInclude }>;

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
          authorId: input.authorId ?? null,
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
          authorId: input.authorId ?? null,
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

  /** Staff queue: every thread in the organization with resident context. */
  async listForOrganization(query: OperatorMessageQuery): Promise<OperatorMessageThreadRecord[]> {
    const where: Prisma.MessageThreadWhereInput = { organizationId: query.organizationId };
    if (query.status) where.status = query.status;
    const rows = await this.prisma.messageThread.findMany({
      where,
      include: operatorThreadInclude,
      orderBy: { updatedAt: 'desc' },
      take: query.limit ?? 100,
    });
    return rows.map(toOperatorThreadRecord);
  }

  /** Organization-scoped staff lookup; another organization's thread is 404. */
  async findForOrganization(
    organizationId: string,
    threadId: string,
  ): Promise<OperatorMessageThreadRecord | null> {
    const row = await this.prisma.messageThread.findFirst({
      where: { id: threadId, organizationId },
      include: operatorThreadInclude,
    });
    return row ? toOperatorThreadRecord(row) : null;
  }

  /** Mark the shared estate-office read position. */
  async markReadByStaff(organizationId: string, threadId: string, readAt: Date): Promise<boolean> {
    const result = await this.prisma.messageThread.updateMany({
      where: { id: threadId, organizationId },
      data: { staffLastReadAt: readAt },
    });
    return result.count === 1;
  }

  /** Close or reopen a thread. */
  async setStatus(
    organizationId: string,
    threadId: string,
    status: MessageThreadStatus,
  ): Promise<boolean> {
    const result = await this.prisma.messageThread.updateMany({
      where: { id: threadId, organizationId },
      data: { status },
    });
    return result.count === 1;
  }
}

type MessageRow = {
  id: string;
  threadId: string;
  senderRole: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
};

type ThreadRow = {
  id: string;
  organizationId: string;
  residentUserId: string;
  subject: string;
  status: string;
  staffLastReadAt: Date | null;
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
    staffLastReadAt: row.staffLastReadAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messages: (row.messages ?? []).map((message) => ({
      id: message.id,
      threadId: message.threadId,
      senderRole: message.senderRole as MessageSenderRole,
      authorId: message.authorId,
      body: message.body,
      createdAt: message.createdAt,
    })),
  };
}

function toOperatorThreadRecord(row: OperatorThreadRow): OperatorMessageThreadRecord {
  const onboardingProperty = row.resident?.residentOnboarding?.property ?? null;
  return {
    ...toThreadRecord(row),
    resident: row.resident
      ? {
          id: row.resident.id,
          fullName: row.resident.fullName,
          email: row.resident.email,
          phone: row.resident.phone,
        }
      : null,
    property: onboardingProperty
      ? {
          id: onboardingProperty.id,
          identifier: onboardingProperty.identifier,
          name: onboardingProperty.name,
          estate: onboardingProperty.estate,
        }
      : null,
    messages: row.messages.map((message) => ({
      id: message.id,
      senderRole: message.senderRole as MessageSenderRole,
      body: message.body,
      createdAt: message.createdAt,
      author: message.author
        ? {
            id: message.author.id,
            fullName: message.author.fullName,
            email: message.author.email,
            role: message.author.role,
          }
        : null,
    })),
  };
}
