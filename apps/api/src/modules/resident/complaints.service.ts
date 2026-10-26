import { AppError } from '../../lib/errors.js';
import type {
  PrismaComplaintRepository,
  ComplaintRecord,
  ComplaintStatus,
} from './complaints-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  ResidentComplaintDto,
  ResidentComplaintsResponse,
  ResidentCreateComplaintInput,
  ResidentCreateComplaintResponse,
} from '@silverstone/shared';

/** Longest accepted complaint subject. */
const MAX_SUBJECT_LENGTH = 160;
/** Longest accepted category label. */
const MAX_CATEGORY_LENGTH = 48;
/** Longest accepted description. */
const MAX_DESCRIPTION_LENGTH = 4000;

export interface ResidentComplaintsServiceOptions {
  complaints: PrismaComplaintRepository;
  audit: PrismaAuditRepository;
  /** Resolves the acting resident's assigned property (may be null). */
  loadPropertyId: (organizationId: string, userId: string) => Promise<string | null>;
}

/**
 * Resident complaints (S5).
 *
 * A resident files a complaint against their own property; the estate office
 * answers through the reply thread. Everything is self-scoped: the acting
 * user's id comes from the session and is applied to every query.
 */
export class ResidentComplaintsService {
  constructor(private readonly options: ResidentComplaintsServiceOptions) {}

  /**
   * The acting resident's complaints, newest first. `status` narrows the
   * list (the dashboard asks for the open ones).
   */
  async list(
    organizationId: string,
    userId: string,
    status?: ComplaintStatus,
  ): Promise<ResidentComplaintsResponse> {
    const records = await this.options.complaints.listByUser(
      organizationId,
      userId,
      status,
    );
    return { complaints: records.map(toDto) };
  }

  /** File a complaint on the acting resident's property. */
  async create(
    organizationId: string,
    userId: string,
    input: ResidentCreateComplaintInput,
    requestId: string | null,
  ): Promise<ResidentCreateComplaintResponse> {
    const category = input.category.trim();
    const subject = input.subject.trim();
    const description = input.description.trim();

    if (!category || category.length > MAX_CATEGORY_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Category is required');
    }
    if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Subject is required');
    }
    if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Description is required');
    }

    const propertyId = await this.options.loadPropertyId(organizationId, userId);

    const record = await this.options.complaints.create({
      organizationId,
      userId,
      propertyId,
      category,
      subject,
      description,
    });

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.complaint_created',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        complaintId: record.id,
        category,
        subject,
        propertyId,
      },
    });

    return { ok: true, complaint: toDto(record) };
  }
}

function toDto(record: ComplaintRecord): ResidentComplaintDto {
  return {
    id: record.id,
    category: record.category,
    subject: record.subject,
    description: record.description,
    status: record.status,
    replies: record.replies.map((reply) => ({
      id: reply.id,
      authorId: reply.authorId ?? '',
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
