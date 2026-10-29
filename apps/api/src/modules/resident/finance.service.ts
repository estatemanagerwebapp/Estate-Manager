import { AppError } from '../../lib/errors.js';
import type {
  PrismaFinanceRepository,
  FinanceInvoiceRecord,
  FinancePaymentRecord,
  FinanceTransactionRecord,
} from './finance-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  BankTransferDetailsDto,
  ResidentFinanceView,
  ResidentInvoiceDto,
  ResidentPaymentDto,
  ResidentTransactionDto,
  ResidentCreatePaymentResponse,
} from '@silverstone/shared';

export interface RegistrationFee {
  amountKobo: number;
  currency: string;
}

export interface ResidentFinanceServiceOptions {
  finance: PrismaFinanceRepository;
  audit: PrismaAuditRepository;
  /** The configured registration fee (amount + currency). 0 = free onboarding. */
  registrationFee: () => Promise<RegistrationFee>;
  /** Bank-transfer instructions, when the estate office has configured them. */
  paymentDetails?: () => Promise<BankTransferDetailsDto | null>;
}

/**
 * Resident finance service (S3).
 *
 * Self-scoped: every query carries the acting user's id (pinned by the
 * router from the session). The registration fee seeds the first invoice,
 * payment and transaction when a resident account is created, so the finance
 * page is never empty.
 *
 * The payment provider is NONE: `createPayment` records a reference and flips
 * the invoice PAID when the amount covers the outstanding balance. A future
 * Zest webhook re-enters through the same `createPayment` path.
 */
export class ResidentFinanceService {
  constructor(private readonly options: ResidentFinanceServiceOptions) {}

  /**
   * The four-section finance view for the acting resident: outstanding
   * invoices, paid invoices, payment history and the transaction ledger.
   */
  async view(organizationId: string, userId: string): Promise<ResidentFinanceView> {
    const [outstanding, paid, payments, transactions, paymentDetails] = await Promise.all([
      this.options.finance.listInvoicesByStatus(organizationId, userId, 'UNPAID'),
      this.options.finance.listInvoicesByStatus(organizationId, userId, 'PAID'),
      this.options.finance.listPayments(organizationId, userId),
      this.options.finance.listTransactions(organizationId, userId),
      this.options.paymentDetails ? this.options.paymentDetails() : Promise.resolve(null),
    ]);

    return {
      outstanding: outstanding.map(toInvoiceDto),
      paid: paid.map(toInvoiceDto),
      payments: payments.map(toPaymentDto),
      transactions: transactions.map(toTransactionDto),
      paymentDetails,
    };
  }

  /**
   * Record a payment against one of the acting resident's invoices.
   *
   * - Ownership: the invoice must belong to the acting user (404 otherwise).
   * - NONE provider: the payment is recorded with the supplied method +
   *   reference; when its amount covers the invoice balance the invoice is
   *   marked PAID.
   * - Writes a PAYMENT transaction to the ledger and audits the event.
   */
  async createPayment(
    organizationId: string,
    userId: string,
    input: { invoiceId: string; method?: string; reference: string | null },
    requestId: string | null,
  ): Promise<ResidentCreatePaymentResponse> {
    const invoice = await this.options.finance.findInvoice(organizationId, userId, input.invoiceId);
    if (!invoice) {
      // Never reveals whether another user's invoice exists with this id.
      throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    }
    if (invoice.status === 'PAID') {
      throw new AppError(409, 'CONFLICT', 'This invoice is already paid');
    }
    if (invoice.status === 'VOID') {
      throw new AppError(409, 'CONFLICT', 'This invoice has been voided');
    }

    const amountKobo = invoice.amountKobo;
    const method = input.method?.trim() || 'CASH';
    const reference = input.reference?.trim() || null;

    const payment = await this.options.finance.createPayment({
      organizationId,
      userId,
      invoiceId: invoice.id,
      amountKobo,
      method,
      reference,
    });

    // The provider is NONE, so a recorded reference is treated as settled:
    // flip the invoice PAID.
    await this.options.finance.markInvoicePaid(invoice.id);

    // Ledger entries: one for the payment (credit, incoming), one for the
    // now-settled invoice (debit, outgoing).
    await this.options.finance.createTransaction({
      organizationId,
      userId,
      kind: 'PAYMENT',
      amountKobo,
      signed: amountKobo,
      memo: `Payment against ${invoice.period}`,
      reference: payment.id,
    });
    await this.options.finance.createTransaction({
      organizationId,
      userId,
      kind: 'INVOICE',
      amountKobo,
      signed: -amountKobo,
      memo: `${invoice.period} settled`,
      reference: invoice.id,
    });

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.payment_recorded',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        invoiceId: invoice.id,
        paymentId: payment.id,
        amountKobo,
        method,
        reference,
      },
    });

    return { ok: true, payment: toPaymentDto(payment) };
  }

  /**
   * Seed the registration-fee invoice + payment + transaction when a resident
   * account is created. Called from both account-creation paths
   * (`markPaid` immediate and `complete`). Idempotent per (user, period):
   * re-calls for the same seeded period are no-ops.
   *
   * A zero-amount fee is still seeded (the invoice is PAID at issue) so the
   * finance ledger always reflects the onboarding event.
   */
  async seedRegistrationFee(
    organizationId: string,
    userId: string,
    propertyId: string | null,
    requestId: string | null,
  ): Promise<void> {
    const fee = await this.options.registrationFee();
    const period = 'Registration fee';

    if (await this.options.finance.hasSeededInvoice(organizationId, userId, period)) {
      return;
    }

    const dueAt = new Date();
    const invoice = await this.options.finance.createInvoice({
      organizationId,
      userId,
      propertyId,
      period,
      amountKobo: fee.amountKobo,
      currency: fee.currency,
      dueAt,
      paidOnIssue: true,
    });

    // Record the settlement as a payment (the fee was verified before the
    // account was created — provider NONE).
    const payment = await this.options.finance.createPayment({
      organizationId,
      userId,
      invoiceId: invoice.id,
      amountKobo: fee.amountKobo,
      method: 'ADMIN',
      reference: null,
    });

    // Ledger: payment in, invoice out.
    await this.options.finance.createTransaction({
      organizationId,
      userId,
      kind: 'PAYMENT',
      amountKobo: fee.amountKobo,
      signed: fee.amountKobo,
      memo: 'Registration fee settled at onboarding',
      reference: payment.id,
    });
    await this.options.finance.createTransaction({
      organizationId,
      userId,
      kind: 'INVOICE',
      amountKobo: fee.amountKobo,
      signed: -fee.amountKobo,
      memo: `${period} issued and settled`,
      reference: invoice.id,
    });

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.invoice_created',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        invoiceId: invoice.id,
        period,
        amountKobo: fee.amountKobo,
      },
    });
  }
}

function toInvoiceDto(invoice: FinanceInvoiceRecord): ResidentInvoiceDto {
  return {
    id: invoice.id,
    period: invoice.period,
    amountKobo: invoice.amountKobo,
    currency: invoice.currency,
    status: invoice.status as ResidentInvoiceDto['status'],
    dueAt: invoice.dueAt.toISOString(),
    issuedAt: invoice.issuedAt.toISOString(),
  };
}

function toPaymentDto(payment: FinancePaymentRecord): ResidentPaymentDto {
  return {
    id: payment.id,
    invoiceId: payment.invoiceId,
    amountKobo: payment.amountKobo,
    method: payment.method,
    reference: payment.reference,
    paidAt: payment.paidAt.toISOString(),
  };
}

function toTransactionDto(transaction: FinanceTransactionRecord): ResidentTransactionDto {
  return {
    id: transaction.id,
    kind: transaction.kind,
    amountKobo: transaction.amountKobo,
    signed: transaction.signed,
    memo: transaction.memo,
    reference: transaction.reference,
    occurredAt: transaction.occurredAt.toISOString(),
  };
}
