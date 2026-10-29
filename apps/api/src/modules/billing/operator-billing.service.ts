import { AppError } from '../../lib/errors.js';
import type { AuthAuditContext } from '../auth/auth.service.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  OperatorInvoiceRecord,
  OperatorInvoiceFilter,
  OperatorPaymentFilter,
  OperatorPaymentRecord,
  PrismaFinanceRepository,
} from '../resident/finance-repository.js';
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
const MAX_REFERENCE_LENGTH = 120;

export interface OperatorBillingServiceOptions {
  finance: PrismaFinanceRepository;
  audit: PrismaAuditRepository;
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
    return { invoices: records.map((record) => this.toInvoiceDto(record)) };
  }

  async createInvoice(
    context: AuthAuditContext,
    input: OperatorCreateInvoiceInput,
  ): Promise<OperatorInvoiceResponse> {
    const actorId = requireActor(context);
    const organizationId = requireOrganization(context);
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

    const created = await this.options.finance.createInvoice({
      organizationId,
      userId: resident.id,
      propertyId: resident.propertyId,
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
        propertyId: resident.propertyId,
        period,
        amountKobo: input.amountKobo,
        dueAt: dueAt.toISOString(),
      },
    });

    return { ok: true, invoice: this.toInvoiceDto(record) };
  }

  async voidInvoice(
    context: AuthAuditContext,
    invoiceId: string,
  ): Promise<OperatorInvoiceResponse> {
    const actorId = requireActor(context);
    const organizationId = requireOrganization(context);
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

    return { ok: true, invoice: this.toInvoiceDto(updated) };
  }

  async listPayments(
    organizationId: string,
    filter: OperatorPaymentFilter,
  ): Promise<OperatorPaymentsResponse> {
    const records = await this.options.finance.listPaymentsForOrganization(organizationId, filter);
    return { payments: records.map((record) => this.toPaymentDto(record)) };
  }

  async recordPayment(
    context: AuthAuditContext,
    invoiceId: string,
    input: OperatorRecordPaymentInput,
  ): Promise<OperatorRecordPaymentResponse> {
    const actorId = requireActor(context);
    const organizationId = requireOrganization(context);
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
    if (invoice.status === 'PAID' || invoice.paymentCount > 0) {
      throw new AppError(409, 'CONFLICT', 'This invoice is already paid');
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

    const payment = await this.options.finance.recordManualPayment({
      organizationId,
      userId: invoice.userId,
      invoiceId: invoice.id,
      period: invoice.period,
      amountKobo: invoice.amountKobo,
      method,
      reference,
      paidAt,
      recordedById: actorId,
    });
    if (!payment) {
      throw new AppError(409, 'CONFLICT', 'This invoice is already paid');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'payment.recorded',
      targetType: 'payment',
      targetId: payment.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        invoiceId: invoice.id,
        residentId: invoice.userId,
        amountKobo: invoice.amountKobo,
        method,
        reference,
      },
    });

    const [savedPayment, savedInvoice] = await Promise.all([
      this.options.finance.findPaymentForOrganization(organizationId, payment.id),
      this.options.finance.findInvoiceForOrganization(organizationId, invoice.id),
    ]);
    if (!savedPayment || !savedInvoice) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Payment could not be loaded');
    }

    return {
      ok: true,
      payment: this.toPaymentDto(savedPayment),
      invoice: this.toInvoiceDto(savedInvoice),
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

  private toInvoiceDto(record: OperatorInvoiceRecord): OperatorInvoiceDto {
    const overdue =
      record.status === 'OVERDUE' ||
      (record.status === 'UNPAID' && record.dueAt.getTime() < this.now().getTime());
    return {
      id: record.id,
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
      paymentCount: record.paymentCount,
      createdBy: record.createdBy,
      voidedAt: record.voidedAt ? record.voidedAt.toISOString() : null,
      voidedBy: record.voidedBy,
    };
  }

  private toPaymentDto(record: OperatorPaymentRecord): OperatorPaymentDto {
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

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function requireActor(context: AuthAuditContext): string {
  if (!context.actorId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return context.actorId;
}

function requireOrganization(context: AuthAuditContext): string {
  if (!context.organizationId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return context.organizationId;
}

function parseDate(value: string, message: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return date;
}
