import { AppError } from '../../lib/errors.js';
import {
  requireAuditActor,
  requireAuditOrganization,
  type AuthAuditContext,
} from '../auth/auth.service.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { NotifyInput } from '../resident/notifications.service.js';
import type {
  OperatorInvoiceRecord,
  OperatorInvoiceFilter,
  OperatorPaymentFilter,
  OperatorPaymentRecord,
  PrismaFinanceRepository,
} from '../resident/finance-repository.js';
import { formatNaira } from '@silverstone/shared';
import type {
  OperatorCreateInvoiceInput,
  OperatorInvoiceDto,
  OperatorInvoiceResponse,
  OperatorInvoicesResponse,
  OperatorPaymentDto,
  OperatorPaymentsResponse,
  OperatorRecordPaymentInput,
  OperatorRecordPaymentResponse,
  ResidentInvoiceStatus,
} from '@silverstone/shared';

const MAX_PERIOD_LENGTH = 48;
const MAX_TITLE_LENGTH = 160;
const MAX_REFERENCE_LENGTH = 120;

export interface OperatorBillingServiceOptions {
  finance: PrismaFinanceRepository;
  audit: PrismaAuditRepository;
  /**
   * Resident inbox hook. A notification failure never undoes a billing
   * action; the resident simply misses the in-app note.
   */
  notify?: (organizationId: string, userId: string, input: NotifyInput) => Promise<void>;
  /** Injectable clock for tests; production uses the wall clock. */
  now?: () => Date;
}

/**
 * Manual operator billing (Phase 5).
 *
 * The provider is deliberately absent. Staff issue invoices for a resident,
 * void an unpaid invoice, or record a payment they received out of band.
 * Recording a payment settles the full invoice and writes the same
 * resident-visible payment/transaction ledger entries as the resident flow.
 *
 * All lookups are organization-scoped. Cross-organization invoices are
 * indistinguishable from missing ones (404).
 */
export class OperatorBillingService {
  constructor(private readonly options: OperatorBillingServiceOptions) {}

  async listInvoices(
    organizationId: string,
    filter: OperatorInvoiceFilter,
  ): Promise<OperatorInvoicesResponse> {
    const records = await this.options.finance.listInvoicesForOrganization(organizationId, filter);
    return { invoices: records.map((record) => toOperatorInvoiceDto(record, this.now())) };
  }

  async createInvoice(
    context: AuthAuditContext,
    input: OperatorCreateInvoiceInput,
  ): Promise<OperatorInvoiceResponse> {
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);
    const title = input.title.trim();
    if (!title || title.length > MAX_TITLE_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid bill name');
    }
    const period = input.period.trim();
    if (!period || period.length > MAX_PERIOD_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid billing period');
    }
    if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid invoice amount');
    }
    const dueAt = parseDate(input.dueAt, 'Invalid due date');

    const resident = await this.options.finance.findResidentBillingContext(
      organizationId,
      input.residentId,
    );
    if (!resident) {
      throw new AppError(404, 'NOT_FOUND', 'Resident not found');
    }
    const linkedProperty = input.propertyId
      ? resident.properties.find((item) => item.propertyId === input.propertyId)
      : resident.properties.length === 1
        ? resident.properties[0]
        : null;
    if (!linkedProperty) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        resident.properties.length > 1
          ? 'Choose which resident property this invoice belongs to'
          : 'Resident has no active property assignment',
      );
    }
    // The form asks for an estate and unit. Check the pair rather than
    // trusting the client: a mismatched resident must never be billed.
    if (input.estateId && linkedProperty.property.estate.id !== input.estateId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Resident is not in the selected estate');
    }

    const created = await this.options.finance.createInvoice({
      organizationId,
      userId: resident.id,
      propertyId: linkedProperty.propertyId,
      title,
      period,
      amountKobo: input.amountKobo,
      currency: 'NGN',
      dueAt,
      createdById: actorId,
    });

    const record = await this.options.finance.findInvoiceForOrganization(
      organizationId,
      created.id,
    );
    if (!record) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Invoice could not be loaded');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'invoice.created',
      targetType: 'invoice',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        residentId: resident.id,
        propertyId: linkedProperty.propertyId,
        estateId: linkedProperty.property.estate.id,
        title,
        period,
        amountKobo: input.amountKobo,
        dueAt: dueAt.toISOString(),
      },
    });

    await this.notifyResident(organizationId, resident.id, {
      kind: 'PAYMENT',
      title: 'New invoice',
      body: `${title} (${period}) is now available.`,
      linkTo: '/resident/app/invoices',
    });

    return { ok: true, invoice: toOperatorInvoiceDto(record, this.now()) };
  }

  async voidInvoice(
    context: AuthAuditContext,
    invoiceId: string,
  ): Promise<OperatorInvoiceResponse> {
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);
    const invoice = await this.options.finance.findInvoiceForOrganization(
      organizationId,
      invoiceId,
    );
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    }
    this.assertCanVoid(invoice);

    const updated = await this.options.finance.voidInvoice(
      organizationId,
      invoiceId,
      actorId,
      this.now(),
    );
    if (!updated) {
      throw new AppError(409, 'CONFLICT', 'Invoice can no longer be voided');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'invoice.voided',
      targetType: 'invoice',
      targetId: updated.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        residentId: updated.userId,
        period: updated.period,
        amountKobo: updated.amountKobo,
      },
    });

    return { ok: true, invoice: toOperatorInvoiceDto(updated, this.now()) };
  }

  async listPayments(
    organizationId: string,
    filter: OperatorPaymentFilter,
  ): Promise<OperatorPaymentsResponse> {
    const records = await this.options.finance.listPaymentsForOrganization(organizationId, filter);
    return { payments: records.map((record) => toOperatorPaymentDto(record)) };
  }

  async recordPayment(
    context: AuthAuditContext,
    invoiceId: string,
    input: OperatorRecordPaymentInput,
  ): Promise<OperatorRecordPaymentResponse> {
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);
    const invoice = await this.options.finance.findInvoiceForOrganization(
      organizationId,
      invoiceId,
    );
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    }
    if (invoice.status === 'VOID') {
      throw new AppError(409, 'CONFLICT', 'This invoice has been voided');
    }
    const outstanding = Math.max(invoice.amountKobo - invoice.paidKobo, 0);
    if (invoice.status === 'PAID' || outstanding === 0) {
      throw new AppError(409, 'CONFLICT', 'This invoice is already settled');
    }
    if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid payment amount');
    }
    if (input.amountKobo > outstanding) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `The amount exceeds the outstanding balance of ${formatNaira(outstanding)}`,
      );
    }

    const method = input.method.trim();
    if (!method || method.length > 32) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid payment method');
    }
    const reference = input.reference?.trim() || null;
    if (reference && reference.length > MAX_REFERENCE_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Payment reference is too long');
    }
    const paidAt = input.paidAt ? parseDate(input.paidAt, 'Invalid payment date') : this.now();

    const applied = await this.options.finance.applyInvoicePayment({
      organizationId,
      invoiceId: invoice.id,
      amountKobo: input.amountKobo,
      method,
      reference,
      paidAt,
      recordedById: actorId,
    });
    if (!applied.ok) {
      if (applied.reason === 'OVERPAYMENT') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `The amount exceeds the outstanding balance of ${formatNaira(applied.remainingKobo ?? 0)}`,
        );
      }
      if (applied.reason === 'NOT_FOUND') {
        throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
      }
      if (applied.reason === 'VOID') {
        throw new AppError(409, 'CONFLICT', 'This invoice has been voided');
      }
      throw new AppError(409, 'CONFLICT', 'This invoice is already settled');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'payment.recorded',
      targetType: 'payment',
      targetId: applied.payment.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        invoiceId: invoice.id,
        residentId: applied.userId,
        amountKobo: input.amountKobo,
        paidKobo: applied.paidKobo,
        outstandingKobo: applied.outstandingKobo,
        status: applied.status,
        method,
        reference,
      },
    });

    const [savedPayment, savedInvoice] = await Promise.all([
      this.options.finance.findPaymentForOrganization(organizationId, applied.payment.id),
      this.options.finance.findInvoiceForOrganization(organizationId, invoice.id),
    ]);
    if (!savedPayment || !savedInvoice) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Payment could not be loaded');
    }

    const label = applied.title || applied.period;
    await this.notifyResident(organizationId, applied.userId, {
      kind: 'PAYMENT',
      title: applied.outstandingKobo === 0 ? 'Invoice settled' : 'Part payment recorded',
      body:
        applied.outstandingKobo === 0
          ? `${label} is fully settled.`
          : `${formatNaira(input.amountKobo)} recorded towards ${label}. ${formatNaira(applied.outstandingKobo)} still outstanding.`,
      linkTo: '/resident/app/invoices',
    });

    return {
      ok: true,
      payment: toOperatorPaymentDto(savedPayment),
      invoice: toOperatorInvoiceDto(savedInvoice, this.now()),
    };
  }

  private assertCanVoid(invoice: OperatorInvoiceRecord): void {
    if (invoice.status === 'VOID') {
      throw new AppError(409, 'CONFLICT', 'This invoice has already been voided');
    }
    if (invoice.status === 'PAID' || invoice.paymentCount > 0) {
      throw new AppError(409, 'CONFLICT', 'Paid invoices cannot be voided');
    }
  }

  private async notifyResident(
    organizationId: string,
    userId: string,
    input: NotifyInput,
  ): Promise<void> {
    if (!this.options.notify) return;
    try {
      await this.options.notify(organizationId, userId, input);
    } catch {
      // The inbox is best-effort; the invoice/payment is already committed.
    }
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export function toOperatorInvoiceDto(record: OperatorInvoiceRecord, now: Date): OperatorInvoiceDto {
  const overdue =
    record.status === 'OVERDUE' ||
    (record.status === 'UNPAID' && record.dueAt.getTime() < now.getTime());
  return {
    id: record.id,
    title: record.title,
    period: record.period,
    amountKobo: record.amountKobo,
    currency: record.currency,
    status: record.status as ResidentInvoiceStatus,
    dueAt: record.dueAt.toISOString(),
    issuedAt: record.issuedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    overdue,
    resident: record.resident,
    property: record.property,
    paidKobo: record.paidKobo,
    outstandingKobo: Math.max(record.amountKobo - record.paidKobo, 0),
    paymentCount: record.paymentCount,
    createdBy: record.createdBy,
    voidedAt: record.voidedAt ? record.voidedAt.toISOString() : null,
    voidedBy: record.voidedBy,
  };
}

export function toOperatorPaymentDto(record: OperatorPaymentRecord): OperatorPaymentDto {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    period: record.period,
    amountKobo: record.amountKobo,
    method: record.method,
    reference: record.reference,
    paidAt: record.paidAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    resident: record.resident,
    property: record.property,
    recordedBy: record.recordedBy,
  };
}

function parseDate(value: string, message: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return date;
}
