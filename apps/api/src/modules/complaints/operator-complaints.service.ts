import { AppError } from '../../lib/errors.js';
import type {
  ComplaintStatus,
  OperatorComplaintRecord,
  PrismaComplaintRepository,
} from '../resident/complaints-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { AuthAuditContext } from '../auth/auth.service.js';
import type {
  OperatorComplaintReplyInput,
  OperatorComplaintResponse,
  OperatorComplaintsResponse,
  OperatorComplaintDto,
} from '@silverstone/shared';

const MAX_BODY_LENGTH = 4000;

export interface OperatorComplaintFilter {
  status?: ComplaintStatus;
  limit?: number;
}

export interface OperatorComplaintsServiceOptions {
  complaints: PrismaComplaintRepository;
  audit: PrismaAuditRepository;
}

/**
 * Operator-side complaint handling.
 *
 * Staff read every organization-scoped complaint, reply into the thread and
 * move the status through the shared complaint vocabulary. The resident routes
 * stay self-scoped and keep returning the same reply thread.
 */
export class OperatorComplaintsService {
  constructor(private readonly options: OperatorComplaintsServiceOptions) {}

  async list(
    organizationId: string,
    filter: OperatorComplaintFilter,
  ): Promise<OperatorComplaintsResponse> {
    const records = await this.options.complaints.listForOrganization({
      organizationId,
      status: filter.status,
      limit: filter.limit,
    });
    return { complaints: records.map(toDto) };
  }

  async reply(
    context: AuthAuditContext,
    complaintId: string,
    input: OperatorComplaintReplyInput,
  ): Promise<OperatorComplaintResponse> {
    const actorId = requireActor(context);
    const body = input.body.trim();
    if (!body || body.length > MAX_BODY_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `The reply must be between 1 and ${MAX_BODY_LENGTH} characters`,
      );
    }

    const current = await this.requireComplaint(context.organizationId, complaintId);
    if (current.status === 'CLOSED') {
      throw new AppError(409, 'CONFLICT', 'This complaint is closed');
    }

    const record = await this.options.complaints.addReply(
      context.organizationId,
      current.id,
      actorId,
      body,
    );
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Complaint not found');
    }

    await this.options.audit.record({
      organizationId: context.organizationId,
      actorId,
      eventType: 'complaint.replied',
      targetType: 'complaint',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        subject: record.subject,
        residentUserId: record.userId,
        propertyId: record.propertyId,
      },
    });

    return { ok: true, complaint: toDto(record) };
  }

  async setStatus(
    context: AuthAuditContext,
    complaintId: string,
    status: ComplaintStatus,
  ): Promise<OperatorComplaintResponse> {
    const actorId = requireActor(context);
    const current = await this.requireComplaint(context.organizationId, complaintId);
    if (current.status === status) {
      return { ok: true, complaint: toDto(current) };
    }

    const resolvedAt = resolveTimestamp(current, status);
    await this.options.complaints.updateStatus(
      context.organizationId,
      current.id,
      status,
      resolvedAt,
    );
    const record = await this.requireComplaint(context.organizationId, current.id);
    await this.options.audit.record({
      organizationId: context.organizationId,
      actorId,
      eventType: 'complaint.status_changed',
      targetType: 'complaint',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        subject: record.subject,
        residentUserId: record.userId,
        propertyId: record.propertyId,
        from: current.status,
        to: status,
      },
    });

    return { ok: true, complaint: toDto(record) };
  }

  private async requireComplaint(
    organizationId: string,
    complaintId: string,
  ): Promise<OperatorComplaintRecord> {
    const record = await this.options.complaints.findForOrganization(organizationId, complaintId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Complaint not found');
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

function resolveTimestamp(current: OperatorComplaintRecord, status: ComplaintStatus): Date | null {
  if (status === 'RESOLVED') return current.resolvedAt ?? new Date();
  if (status === 'CLOSED') return current.resolvedAt;
  return null;
}

function toDto(record: OperatorComplaintRecord): OperatorComplaintDto {
  return {
    id: record.id,
    category: record.category,
    subject: record.subject,
    description: record.description,
    status: record.status,
    resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
    resident: record.resident,
    property: record.property,
    replies: record.replies.map((reply) => ({
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      author: reply.author,
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
