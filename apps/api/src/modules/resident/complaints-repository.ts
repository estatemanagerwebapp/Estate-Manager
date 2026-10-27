import type { PrismaClient } from '@prisma/client';

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
