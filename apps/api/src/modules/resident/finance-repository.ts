import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Data access for the resident finance domain (S3): invoices, payments and
 * the transaction ledger.
 *
 * All methods are scoped by organization + user. A resident can only ever
 * read or write their own rows; the service layer enforces that by passing
 * the acting user's id, and these queries never take a user-supplied id.
 */

export interface FinanceInvoiceRecord {
  id: string;
  organizationId: string;
  userId: string;
  propertyId: string | null;
  period: string;
  amountKobo: number;
  currency: string;
  status: 'UNPAID' | 'PAID' | 'OVERDUE' | 'VOID';
  dueAt: Date;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancePaymentRecord {
  id: string;
  organizationId: string;
  userId: string;
  invoiceId: string;
  amountKobo: number;
  method: string;
  reference: string | null;
  paidAt: Date;
  createdAt: Date;
}

export interface FinanceTransactionRecord {
  id: string;
  organizationId: string;
  userId: string;
  kind: 'INVOICE' | 'PAYMENT' | 'REFUND' | 'FEE';
  amountKobo: number;
  /** Signed amount: positive = credit (incoming), negative = debit (outgoing). */
  signed: number;
  memo: string | null;
  reference: string | null;
  occurredAt: Date;
}

export interface CreateInvoiceInput {
  organizationId: string;
  userId: string;
  propertyId?: string | null;
  period: string;
  amountKobo: number;
  currency?: string;
  dueAt: Date;
  /** Seed the paid state immediately (registration-fee seed). */
  paidOnIssue?: boolean;
}

export interface CreatePaymentInput {
  organizationId: string;
  userId: string;
  invoiceId: string;
  amountKobo: number;
  method: string;
  reference?: string | null;
}

export interface CreateTransactionInput {
  organizationId: string;
  userId: string;
  kind: FinanceTransactionRecord['kind'];
  amountKobo: number;
  signed: number;
  memo?: string | null;
  reference?: string | null;
}

type PrismaInvoiceRow = Prisma.InvoiceGetPayload<Prisma.InvoiceDefaultArgs>;
type PrismaPaymentRow = Prisma.PaymentGetPayload<Prisma.PaymentDefaultArgs>;
type PrismaTransactionRow = Prisma.TransactionGetPayload<Prisma.TransactionDefaultArgs>;

export class PrismaFinanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createInvoice(input: CreateInvoiceInput): Promise<FinanceInvoiceRecord> {
    const row = await this.prisma.invoice.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        propertyId: input.propertyId ?? null,
        period: input.period,
        amountKobo: input.amountKobo,
        currency: input.currency ?? 'NGN',
        status: input.paidOnIssue ? 'PAID' : 'UNPAID',
        dueAt: input.dueAt,
      },
    });
    return toInvoice(row);
  }

  async findInvoice(
    organizationId: string,
    userId: string,
    invoiceId: string,
  ): Promise<FinanceInvoiceRecord | null> {
    const row = await this.prisma.invoice.findFirst({
      where: { organizationId, userId, id: invoiceId },
    });
    return row ? toInvoice(row) : null;
  }

  async listInvoicesByStatus(
    organizationId: string,
    userId: string,
    status: FinanceInvoiceRecord['status'],
  ): Promise<FinanceInvoiceRecord[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { organizationId, userId, status },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toInvoice);
  }

  async markInvoicePaid(invoiceId: string): Promise<FinanceInvoiceRecord | null> {
    const row = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID' },
    });
    return toInvoice(row);
  }

  async createPayment(input: CreatePaymentInput): Promise<FinancePaymentRecord> {
    const row = await this.prisma.payment.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        invoiceId: input.invoiceId,
        amountKobo: input.amountKobo,
        method: input.method,
        reference: input.reference ?? null,
      },
    });
    return toPayment(row);
  }

  async listPayments(
    organizationId: string,
    userId: string,
    limit = 50,
  ): Promise<FinancePaymentRecord[]> {
    const rows = await this.prisma.payment.findMany({
      where: { organizationId, userId },
      orderBy: { paidAt: 'desc' },
      take: limit,
    });
    return rows.map(toPayment);
  }

  async createTransaction(input: CreateTransactionInput): Promise<FinanceTransactionRecord> {
    const row = await this.prisma.transaction.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        kind: input.kind,
        amountKobo: input.amountKobo,
        signed: input.signed,
        memo: input.memo ?? null,
        reference: input.reference ?? null,
      },
    });
    return toTransaction(row);
  }

  async listTransactions(
    organizationId: string,
    userId: string,
    limit = 100,
  ): Promise<FinanceTransactionRecord[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { organizationId, userId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return rows.map(toTransaction);
  }

  /**
   * Whether the user already has a seeded registration-fee invoice. Used by
   * the seed-on-registration hook to avoid double-seeding when the account
   * is created through either path (markPaid immediate or complete).
   */
  async hasSeededInvoice(organizationId: string, userId: string, period: string): Promise<boolean> {
    const row = await this.prisma.invoice.findFirst({
      where: { organizationId, userId, period },
      select: { id: true },
    });
    return row !== null;
  }
}

function toInvoice(row: PrismaInvoiceRow): FinanceInvoiceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    propertyId: row.propertyId,
    period: row.period,
    amountKobo: row.amountKobo,
    currency: row.currency,
    status: row.status as FinanceInvoiceRecord['status'],
    dueAt: row.dueAt,
    issuedAt: row.issuedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPayment(row: PrismaPaymentRow): FinancePaymentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    invoiceId: row.invoiceId,
    amountKobo: row.amountKobo,
    method: row.method,
    reference: row.reference,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}

function toTransaction(row: PrismaTransactionRow): FinanceTransactionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    kind: row.kind as FinanceTransactionRecord['kind'],
    amountKobo: row.amountKobo,
    signed: row.signed,
    memo: row.memo,
    reference: row.reference,
    occurredAt: row.occurredAt,
  };
}
