import { AppError } from '../../lib/errors.js';
import type {
  PrismaFinanceRepository,
  FinanceInvoiceRecord,
  FinancePaymentRecord,
  FinanceTransactionRecord,
} from './finance-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import { formatNaira } from '@silverstone/shared';
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
  registrationFee: (organizationId: string, propertyId: string | null) => Promise<RegistrationFee>;
  /** Bank-transfer instructions, when the estate office has configured them. */
  paymentDetails?: (
    organizationId: string,
    userId: string,
  ) => Promise<BankTransferDetailsDto | null>;
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
  async view(
    organizationId: string,
    userIds: string | readonly string[],
  ): Promise<ResidentFinanceView> {
    const primaryUserId = typeof userIds === 'string' ? userIds : userIds[0] ?? '';
    const [outstanding, paid, payments, transactions, paymentDetails] = await Promise.all([
      // OVERDUE belongs in the outstanding list; a past-due invoice must not
      // vanish from the resident's finance page.
      this.options.finance.listInvoicesWithTotals(organizationId, userIds, ['UNPAID', 'OVERDUE']),
      this.options.finance.listInvoicesWithTotals(organizationId, userIds, ['PAID']),
      this.options.finance.listPayments(organizationId, userIds),
      this.options.finance.listTransactions(organizationId, userIds),
      this.options.paymentDetails
        ? this.options.paymentDetails(organizationId, primaryUserId)
        : Promise.resolve(null),
    ]);

    return {
      outstanding: outstanding.map(({ invoice, paidKobo }) => toInvoiceDto(invoice, paidKobo)),
      paid: paid.map(({ invoice, paidKobo }) => toInvoiceDto(invoice, paidKobo)),
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
    actorUserId: string,
    accountUserIds: readonly string[],
    input: { invoiceId: string; amountKobo?: number; method?: string; reference: string | null },
    requestId: string | null,
  ): Promise<ResidentCreatePaymentResponse> {
    const current = await this.options.finance.findInvoiceWithTotals(
      organizationId,
      accountUserIds,
      input.invoiceId,
    );
    if (!current) {
      // Never reveals whether another user's invoice exists with this id.
      throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    }
    if (current.invoice.status === 'VOID') {
      throw new AppError(409, 'CONFLICT', 'This invoice has been voided');
    }
    const outstanding = Math.max(current.invoice.amountKobo - current.paidKobo, 0);
    if (current.invoice.status === 'PAID' || outstanding === 0) {
      throw new AppError(409, 'CONFLICT', 'This invoice is already settled');
    }
    // No amount means "pay the balance"; a smaller amount is a part payment.
    const amountKobo = input.amountKobo ?? outstanding;
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid payment amount');
    }
    if (amountKobo > outstanding) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `The amount exceeds the outstanding balance of ${formatNaira(outstanding)}`,
      );
    }

    const method = input.method?.trim() || 'CASH';
    const reference = input.reference?.trim() || null;

    const applied = await this.options.finance.applyInvoicePayment({
      organizationId,
      invoiceId: current.invoice.id,
      userId: current.invoice.userId,
      amountKobo,
      method,
      reference,
      paidAt: new Date(),
      recordedById: null,
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
      actorId: actorUserId,
      eventType: 'resident.payment_recorded',
      targetType: 'resident',
      targetId: current.invoice.userId,
      requestId,
      outcome: 'success',
      metadata: {
        invoiceId: current.invoice.id,
        paymentId: applied.payment.id,
        amountKobo,
        paidKobo: applied.paidKobo,
        outstandingKobo: applied.outstandingKobo,
        status: applied.status,
        method,
        reference,
      },
    });

    return { ok: true, payment: toPaymentDto(applied.payment) };
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
    const fee = await this.options.registrationFee(organizationId, propertyId);
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

function toInvoiceDto(invoice: FinanceInvoiceRecord, paidKobo: number): ResidentInvoiceDto {
  return {
    id: invoice.id,
    propertyId: invoice.propertyId,
    title: invoice.title,
    period: invoice.period,
    amountKobo: invoice.amountKobo,
    currency: invoice.currency,
    status: invoice.status as ResidentInvoiceDto['status'],
    dueAt: invoice.dueAt.toISOString(),
    issuedAt: invoice.issuedAt.toISOString(),
    paidKobo,
    outstandingKobo: Math.max(invoice.amountKobo - paidKobo, 0),
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
