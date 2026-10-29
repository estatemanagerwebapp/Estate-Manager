import { AppError } from '../../lib/errors.js';
import type {
  OperatorSosEventRecord,
  PrismaSosRepository,
  SosStatus,
} from '../resident/sos-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { AuthAuditContext } from '../auth/auth.service.js';
import type {
  OperatorResolveSosInput,
  OperatorSosEventsResponse,
  OperatorSosMutationResponse,
  SosOperatorEventDto,
} from '@silverstone/shared';

const MAX_RESOLUTION_NOTE_LENGTH = 500;

export interface OperatorSosFilter {
  status?: SosStatus;
  activeOnly?: boolean;
  limit?: number;
}

export interface OperatorSosServiceOptions {
  sos: PrismaSosRepository;
  audit: PrismaAuditRepository;
}

/**
 * Operator-side SOS handling.
 *
 * The staff queue is organization-scoped and read with `sos.read`; every
 * mutation requires `sos.manage`. Lifecycle is deliberately strict:
 * RAISED → ACKNOWLEDGED → RESOLVED, with RESOLVED terminal. The conditional
 * repository updates make concurrent acknowledgements resolve to one winner.
 */
export class OperatorSosService {
  constructor(private readonly options: OperatorSosServiceOptions) {}

  async list(
    organizationId: string,
    filter: OperatorSosFilter,
  ): Promise<OperatorSosEventsResponse> {
    const records = await this.options.sos.listForOrganization({
      organizationId,
      status: filter.status,
      activeOnly: filter.activeOnly,
      limit: filter.limit,
    });
    return { events: records.map(toDto) };
  }

  async acknowledge(
    context: AuthAuditContext,
    sosEventId: string,
  ): Promise<OperatorSosMutationResponse> {
    const actorId = requireActor(context);
    const current = await this.requireEvent(context.organizationId, sosEventId);
    if (current.status !== 'RAISED') {
      throw new AppError(
        409,
        'CONFLICT',
        current.status === 'RESOLVED'
          ? 'This SOS alert has already been resolved.'
          : 'This SOS alert has already been acknowledged.',
      );
    }

    const updated = await this.options.sos.acknowledge(context.organizationId, current.id, actorId);
    if (!updated) {
      throw new AppError(409, 'CONFLICT', 'Another operator already handled this alert.');
    }

    const record = await this.requireEvent(context.organizationId, current.id);
    await this.options.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'sos.acknowledged',
      targetType: 'sos_event',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        residentUserId: record.userId,
        propertyId: record.propertyId,
        from: 'RAISED',
        to: 'ACKNOWLEDGED',
      },
    });

    return { ok: true, event: toDto(record) };
  }

  async resolve(
    context: AuthAuditContext,
    sosEventId: string,
    input: OperatorResolveSosInput,
  ): Promise<OperatorSosMutationResponse> {
    const actorId = requireActor(context);
    const note = input.resolutionNote?.trim() ?? '';
    if (note.length > MAX_RESOLUTION_NOTE_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `The resolution note cannot be longer than ${MAX_RESOLUTION_NOTE_LENGTH} characters`,
      );
    }

    const current = await this.requireEvent(context.organizationId, sosEventId);
    if (current.status === 'RAISED') {
      throw new AppError(409, 'CONFLICT', 'Acknowledge the alert before resolving it.');
    }
    if (current.status === 'RESOLVED') {
      throw new AppError(409, 'CONFLICT', 'This SOS alert has already been resolved.');
    }

    const updated = await this.options.sos.resolve(
      context.organizationId,
      current.id,
      actorId,
      note.length > 0 ? note : null,
    );
    if (!updated) {
      throw new AppError(409, 'CONFLICT', 'Another operator already handled this alert.');
    }

    const record = await this.requireEvent(context.organizationId, current.id);
    await this.options.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'sos.resolved',
      targetType: 'sos_event',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        residentUserId: record.userId,
        propertyId: record.propertyId,
        from: 'ACKNOWLEDGED',
        to: 'RESOLVED',
      },
    });

    return { ok: true, event: toDto(record) };
  }

  private async requireEvent(
    organizationId: string,
    sosEventId: string,
  ): Promise<OperatorSosEventRecord> {
    const record = await this.options.sos.findForOrganization(organizationId, sosEventId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'SOS alert not found');
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

function toDto(record: OperatorSosEventRecord): SosOperatorEventDto {
  return {
    id: record.id,
    note: record.note,
    status: record.status,
    raisedAt: record.raisedAt.toISOString(),
    acknowledgedAt: record.acknowledgedAt ? record.acknowledgedAt.toISOString() : null,
    resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
    resolutionNote: record.resolutionNote,
    resident: record.resident,
    property: record.property,
    acknowledgedBy: record.acknowledgedBy,
    resolvedBy: record.resolvedBy,
  };
}
