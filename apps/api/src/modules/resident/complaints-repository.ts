import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Data access for resident complaints (S5).
 *
 * Every query is scoped by organization + the acting user's id. The service
 * passes the session-derived user id, never a request-supplied one, so a
 * resident can only ever reach their own complaints.
 */

export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface ComplaintReplyRecord {
  id: string;
  complaintId: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
}

export interface ComplaintRecord {
  id: string;
  organizationId: string;
  userId: string;
  propertyId: string | null;
  category: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  replies: ComplaintReplyRecord[];
}

export interface CreateComplaintInput {
  organizationId: string;
  userId: string;
  propertyId: string | null;
  category: string;
  subject: string;
  description: string;
}

export interface OperatorComplaintQuery {
  organizationId: string;
  status?: ComplaintStatus;
  limit?: number;
}

export interface OperatorComplaintActorRecord {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
}

export interface OperatorComplaintResidentRecord {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
}

export interface OperatorComplaintPropertyRecord {
  id: string;
  identifier: string;
  name: string | null;
  estate: { id: string; name: string; slug: string };
}

export interface OperatorComplaintReplyRecord {
  id: string;
  complaintId: string;
  body: string;
  createdAt: Date;
  author: OperatorComplaintActorRecord | null;
}

export interface OperatorComplaintRecord {
  id: string;
  organizationId: string;
  userId: string;
  propertyId: string | null;
  category: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resident: OperatorComplaintResidentRecord | null;
  property: OperatorComplaintPropertyRecord | null;
  replies: OperatorComplaintReplyRecord[];
}

const operatorComplaintInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true } },
  property: {
    select: {
      id: true,
      identifier: true,
      name: true,
      estate: { select: { id: true, name: true, slug: true } },
    },
  },
  replies: {
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, fullName: true, email: true, role: true } },
    },
  },
} satisfies Prisma.ComplaintInclude;

type OperatorComplaintRow = Prisma.ComplaintGetPayload<{
  include: typeof operatorComplaintInclude;
}>;

export class PrismaComplaintRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateComplaintInput): Promise<ComplaintRecord> {
    const row = await this.prisma.complaint.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        propertyId: input.propertyId,
        category: input.category,
        subject: input.subject,
        description: input.description,
        status: 'OPEN',
      },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });
    return toRecord(row);
  }

  /**
   * The acting user's complaints, newest first, with their reply threads.
   * `status` filters to a single status; omit it for every complaint.
   */
  async listByUser(
    organizationId: string,
    userId: string,
    status?: ComplaintStatus,
    limit = 100,
  ): Promise<ComplaintRecord[]> {
    const rows = await this.prisma.complaint.findMany({
      where: {
        organizationId,
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });
    return rows.map(toRecord);
  }

  /** Ownership-checked lookup: another resident's complaint is invisible. */
  async findById(
    organizationId: string,
    userId: string,
    complaintId: string,
  ): Promise<ComplaintRecord | null> {
    const row = await this.prisma.complaint.findFirst({
      where: { organizationId, userId, id: complaintId },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? toRecord(row) : null;
  }

  /** Staff queue: every complaint in the organization with resident context. */
  async listForOrganization(query: OperatorComplaintQuery): Promise<OperatorComplaintRecord[]> {
    const where: Prisma.ComplaintWhereInput = { organizationId: query.organizationId };
    if (query.status) where.status = query.status;
    const rows = await this.prisma.complaint.findMany({
      where,
      include: operatorComplaintInclude,
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100,
    });
    return rows.map(toOperatorComplaintRecord);
  }

  /** Organization-scoped staff lookup; another organization's complaint is 404. */
  async findForOrganization(
    organizationId: string,
    complaintId: string,
  ): Promise<OperatorComplaintRecord | null> {
    const row = await this.prisma.complaint.findFirst({
      where: { id: complaintId, organizationId },
      include: operatorComplaintInclude,
    });
    return row ? toOperatorComplaintRecord(row) : null;
  }

  /** Add a staff reply and bump the complaint's updatedAt. */
  async addReply(
    organizationId: string,
    complaintId: string,
    authorId: string,
    body: string,
  ): Promise<OperatorComplaintRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.complaintReply.create({
        data: { complaintId, authorId, body },
      });
      await tx.complaint.update({
        where: { id: complaintId },
        data: { updatedAt: new Date() },
      });
      const row = await tx.complaint.findFirst({
        where: { id: complaintId, organizationId },
        include: operatorComplaintInclude,
      });
      return row ? toOperatorComplaintRecord(row) : null;
    });
  }

  /** Apply a staff status change, including the resolved timestamp. */
  async updateStatus(
    organizationId: string,
    complaintId: string,
    status: ComplaintStatus,
    resolvedAt: Date | null,
  ): Promise<boolean> {
    const result = await this.prisma.complaint.updateMany({
      where: { id: complaintId, organizationId },
      data: { status, resolvedAt },
    });
    return result.count === 1;
  }
}

type ComplaintRow = {
  id: string;
  organizationId: string;
  userId: string;
  propertyId: string | null;
  category: string;
  subject: string;
  description: string;
  status: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  replies?: Array<{
    id: string;
    complaintId: string;
    authorId: string | null;
    body: string;
    createdAt: Date;
  }>;
};

function toRecord(row: ComplaintRow): ComplaintRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    propertyId: row.propertyId,
    category: row.category,
    subject: row.subject,
    description: row.description,
    status: row.status as ComplaintStatus,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    replies: (row.replies ?? []).map((reply) => ({
      id: reply.id,
      complaintId: reply.complaintId,
      authorId: reply.authorId,
      body: reply.body,
      createdAt: reply.createdAt,
    })),
  };
}

function toOperatorComplaintRecord(row: OperatorComplaintRow): OperatorComplaintRecord {
  return {
    ...toRecord(row),
    resident: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          email: row.user.email,
          phone: row.user.phone,
        }
      : null,
    property: row.property
      ? {
          id: row.property.id,
          identifier: row.property.identifier,
          name: row.property.name,
          estate: row.property.estate,
        }
      : null,
    replies: row.replies.map((reply) => ({
      id: reply.id,
      complaintId: reply.complaintId,
      body: reply.body,
      createdAt: reply.createdAt,
      author: reply.author
        ? {
            id: reply.author.id,
            fullName: reply.author.fullName,
            email: reply.author.email,
            role: reply.author.role,
          }
        : null,
    })),
  };
}
