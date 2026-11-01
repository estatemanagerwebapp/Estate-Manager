import { AppError } from '../../lib/errors.js';
import type { PrismaSosRepository, SosEventRecord } from './sos-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  ResidentCreateSosInput,
  ResidentCreateSosResponse,
  ResidentSosEventsResponse,
  SosContactDto,
  SosEventDto,
} from '@silverstone/shared';

/** Longest accepted note. */
const MAX_NOTE_LENGTH = 500;

export interface ResidentSosServiceOptions {
  sos: PrismaSosRepository;
  audit: PrismaAuditRepository;
  /**
   * Resolves the acting resident's property (may be null when they have no
   * property yet). The SOS is always raised by the session user, never by
   * an id in the request.
   */
  loadPropertyId: (organizationId: string, userId: string) => Promise<string | null>;
  /** Active predefined emergency contacts, when configured. */
  contacts?: (organizationId: string, propertyId: string | null) => Promise<SosContactDto[]>;
}

/**
 * Resident emergency / SOS (S9).
 *
 * A resident raises an SOS against their own property; the estate office
 * is alerted out of band. The history is self-scoped to the acting user.
 */
export class ResidentSosService {
  constructor(private readonly options: ResidentSosServiceOptions) {}

  /** The resident's own SOS history, most recent first. */
  async list(organizationId: string, userId: string): Promise<ResidentSosEventsResponse> {
    const propertyId = await this.options.loadPropertyId(organizationId, userId);
    const [records, contacts] = await Promise.all([
      this.options.sos.listByUser(organizationId, userId),
      this.options.contacts
        ? this.options.contacts(organizationId, propertyId)
        : Promise.resolve([]),
    ]);
    return { events: records.map(toDto), contacts };
  }

  /** Raise an SOS event for the acting resident. */
  async raise(
    organizationId: string,
    userId: string,
    input: ResidentCreateSosInput,
    requestId: string | null,
  ): Promise<ResidentCreateSosResponse> {
    const note = input.note?.trim() ?? '';
    if (note.length > MAX_NOTE_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `The note cannot be longer than ${MAX_NOTE_LENGTH} characters`,
      );
    }

    const propertyId = await this.options.loadPropertyId(organizationId, userId);
    const record = await this.options.sos.create({
      organizationId,
      userId,
      propertyId,
      note: note.length > 0 ? note : null,
    });

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.sos_raised',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        sosEventId: record.id,
        propertyId: record.propertyId,
        note: record.note,
      },
    });

    return { ok: true, event: toDto(record) };
  }
}

function toDto(record: SosEventRecord): SosEventDto {
  return {
    id: record.id,
    note: record.note,
    status: record.status,
    raisedAt: record.raisedAt.toISOString(),
    acknowledgedAt: record.acknowledgedAt ? record.acknowledgedAt.toISOString() : null,
    resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
  };
}
