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
  /** Operator who issued the invoice; null for system seeds. */
  createdById?: string | null;
}

export interface CreatePaymentInput {
  organizationId: string;
  userId: string;
  invoiceId: string;
  amountKobo: number;
  method: string;
  reference?: string | null;
  /** Manual/bank timestamp supplied by the operator. Defaults to now. */
  paidAt?: Date;
  /** Operator who recorded the payment; null for resident/seed payments. */
  recordedById?: string | null;
}

export interface OperatorBillingActorRecord {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
}

export interface OperatorBillingResidentRecord {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
}

export interface OperatorBillingPropertyRecord {
  id: string;
  identifier: string;
  name: string | null;
  estate: { id: string; name: string; slug: string };
}

export interface OperatorInvoiceRecord extends FinanceInvoiceRecord {
  resident: OperatorBillingResidentRecord | null;
  property: OperatorBillingPropertyRecord | null;
  paidKobo: number;
  paymentCount: number;
  createdBy: OperatorBillingActorRecord | null;
  voidedAt: Date | null;
  voidedBy: OperatorBillingActorRecord | null;
}

export interface OperatorPaymentRecord extends FinancePaymentRecord {
  period: string;
  resident: OperatorBillingResidentRecord | null;
  property: OperatorBillingPropertyRecord | null;
  recordedBy: OperatorBillingActorRecord | null;
}

export interface OperatorInvoiceFilter {
  status?: FinanceInvoiceRecord['status'];
  limit?: number;
}

export interface OperatorPaymentFilter {
  limit?: number;
}

export interface OperatorResidentBillingContext extends OperatorBillingResidentRecord {
  propertyId: string | null;
  property: OperatorBillingPropertyRecord | null;
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

export interface RecordManualPaymentInput {
  organizationId: string;
  userId: string;
  invoiceId: string;
  period: string;
  amountKobo: number;
  method: string;
  reference: string | null;
  paidAt: Date;
  recordedById: string;
}

export interface CreatePaidBookingInvoiceInput {
  organizationId: string;
  bookingId: string;
  userId: string;
  propertyId: string | null;
  facilityId: string;
  facilityName: string;
  amountKobo: number;
  period: string;
  method: string;
  reference: string | null;
  paidAt: Date;
  recordedById: string;
}

export interface CreatePaidBookingInvoiceResult {
  invoiceId: string;
  paymentId: string;
}

type PrismaInvoiceRow = Prisma.InvoiceGetPayload<Prisma.InvoiceDefaultArgs>;
type PrismaPaymentRow = Prisma.PaymentGetPayload<Prisma.PaymentDefaultArgs>;
type PrismaTransactionRow = Prisma.TransactionGetPayload<Prisma.TransactionDefaultArgs>;

const OPERATOR_ACTOR_SELECT = {
  id: true,
  fullName: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

const OPERATOR_RESIDENT_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
} satisfies Prisma.UserSelect;

const OPERATOR_PROPERTY_SELECT = {
  id: true,
  identifier: true,
  name: true,
  estate: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.PropertySelect;

const OPERATOR_INVOICE_INCLUDE = {
  user: { select: OPERATOR_RESIDENT_SELECT },
  property: { select: OPERATOR_PROPERTY_SELECT },
  payments: { select: { amountKobo: true } },
  createdBy: { select: OPERATOR_ACTOR_SELECT },
  voidedBy: { select: OPERATOR_ACTOR_SELECT },
} satisfies Prisma.InvoiceInclude;

const OPERATOR_PAYMENT_INCLUDE = {
  user: { select: OPERATOR_RESIDENT_SELECT },
  invoice: {
    select: {
      period: true,
      property: { select: OPERATOR_PROPERTY_SELECT },
    },
  },
  recordedBy: { select: OPERATOR_ACTOR_SELECT },
} satisfies Prisma.PaymentInclude;

type PrismaOperatorInvoiceRow = Prisma.InvoiceGetPayload<{
  include: typeof OPERATOR_INVOICE_INCLUDE;
}>;
type PrismaOperatorPaymentRow = Prisma.PaymentGetPayload<{
  include: typeof OPERATOR_PAYMENT_INCLUDE;
}>;

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
        createdById: input.createdById ?? null,
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
        paidAt: input.paidAt,
        recordedById: input.recordedById ?? null,
      },
    });
    return toPayment(row);
  }

  /**
   * Atomically claim an unpaid invoice, create the payment and write both
   * ledger entries. Returns null when another request has already paid or
   * voided the invoice, so a duplicate operator payment cannot settle twice.
   */
  async recordManualPayment(input: RecordManualPaymentInput): Promise<FinancePaymentRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.invoice.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.invoiceId,
          status: { in: ['UNPAID', 'OVERDUE'] },
          payments: { none: {} },
        },
        data: { status: 'PAID' },
      });
      if (claimed.count === 0) return null;

      const payment = await transaction.payment.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          invoiceId: input.invoiceId,
          amountKobo: input.amountKobo,
          method: input.method,
          reference: input.reference,
          paidAt: input.paidAt,
          recordedById: input.recordedById,
        },
      });

      await transaction.transaction.createMany({
        data: [
          {
            organizationId: input.organizationId,
            userId: input.userId,
            kind: 'PAYMENT',
            amountKobo: input.amountKobo,
            signed: input.amountKobo,
            memo: `Payment against ${input.period}`,
            reference: payment.id,
          },
          {
            organizationId: input.organizationId,
            userId: input.userId,
            kind: 'INVOICE',
            amountKobo: input.amountKobo,
            signed: -input.amountKobo,
            memo: `${input.period} settled`,
            reference: input.invoiceId,
          },
        ],
      });

      return toPayment(payment);
    });
  }

  /**
   * Phase 7: atomically claim an unpaid booking, create its paid invoice,
   * record the payment, write both ledger entries and link the invoice.
   *
   * Returns null when another request already paid the booking or the booking
   * stopped being a REQUESTED, UNPAID paid-fee request. No invoice is created
   * in that case.
   */
  async createPaidBookingInvoice(
    input: CreatePaidBookingInvoiceInput,
  ): Promise<CreatePaidBookingInvoiceResult | null> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.booking.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.bookingId,
          status: 'REQUESTED',
          paymentStatus: 'UNPAID',
          feeKobo: input.amountKobo,
        },
        data: { paymentStatus: 'PAID' },
      });
      if (claimed.count === 0) return null;

      const invoice = await transaction.invoice.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          propertyId: input.propertyId,
          period: input.period,
          amountKobo: input.amountKobo,
          currency: 'NGN',
          status: 'PAID',
          dueAt: input.paidAt,
          createdById: input.recordedById,
        },
      });

      const payment = await transaction.payment.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          invoiceId: invoice.id,
          amountKobo: input.amountKobo,
          method: input.method,
          reference: input.reference,
          paidAt: input.paidAt,
          recordedById: input.recordedById,
        },
      });

      await transaction.booking.update({
        where: { id: input.bookingId },
        data: { invoiceId: invoice.id },
      });

      await transaction.transaction.createMany({
        data: [
          {
            organizationId: input.organizationId,
            userId: input.userId,
            kind: 'PAYMENT',
            amountKobo: input.amountKobo,
            signed: input.amountKobo,
            memo: `Payment against ${input.period}`,
            reference: payment.id,
          },
          {
            organizationId: input.organizationId,
            userId: input.userId,
            kind: 'INVOICE',
            amountKobo: input.amountKobo,
            signed: -input.amountKobo,
            memo: `${input.period} settled`,
            reference: invoice.id,
          },
        ],
      });

      return { invoiceId: invoice.id, paymentId: payment.id };
    });
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

  /** Resolve a resident account and its assigned property for invoice creation. */
  async findResidentBillingContext(
    organizationId: string,
    residentId: string,
  ): Promise<OperatorResidentBillingContext | null> {
    const row = await this.prisma.user.findFirst({
      where: { organizationId, id: residentId, role: 'RESIDENT' },
      select: {
        ...OPERATOR_RESIDENT_SELECT,
        residentOnboarding: {
          select: {
            propertyId: true,
            property: { select: OPERATOR_PROPERTY_SELECT },
          },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      propertyId: row.residentOnboarding?.propertyId ?? null,
      property: row.residentOnboarding?.property ?? null,
    };
  }

  /** Organization-scoped invoice queue with resident, property and payment totals. */
  async listInvoicesForOrganization(
    organizationId: string,
    filter: OperatorInvoiceFilter = {},
  ): Promise<OperatorInvoiceRecord[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        // The operator UI shows a past-due UNPAID invoice as Overdue even
        // before a background job flips the stored status. Match that view.
        ...(filter.status === 'OVERDUE'
          ? {
              OR: [{ status: 'OVERDUE' }, { status: 'UNPAID', dueAt: { lt: new Date() } }],
            }
          : filter.status
            ? { status: filter.status }
            : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { dueAt: 'asc' }],
      take: filter.limit ?? 100,
      include: OPERATOR_INVOICE_INCLUDE,
    });
    return rows.map(toOperatorInvoice);
  }

  /** One organization-scoped invoice, or null when it is not visible. */
  async findInvoiceForOrganization(
    organizationId: string,
    invoiceId: string,
  ): Promise<OperatorInvoiceRecord | null> {
    const row = await this.prisma.invoice.findFirst({
      where: { organizationId, id: invoiceId },
      include: OPERATOR_INVOICE_INCLUDE,
    });
    return row ? toOperatorInvoice(row) : null;
  }

  /**
   * Void an unpaid invoice. The conditional update makes a concurrent payment
   * or void lose the race instead of leaving a paid invoice marked VOID.
   */
  async voidInvoice(
    organizationId: string,
    invoiceId: string,
    voidedById: string,
    voidedAt: Date,
  ): Promise<OperatorInvoiceRecord | null> {
    const updated = await this.prisma.invoice.updateMany({
      where: {
        organizationId,
        id: invoiceId,
        status: { in: ['UNPAID', 'OVERDUE'] },
        payments: { none: {} },
      },
      data: { status: 'VOID', voidedAt, voidedById },
    });
    if (updated.count === 0) return null;
    return this.findInvoiceForOrganization(organizationId, invoiceId);
  }

  /** Organization-scoped manual payment history. */
  async listPaymentsForOrganization(
    organizationId: string,
    filter: OperatorPaymentFilter = {},
  ): Promise<OperatorPaymentRecord[]> {
    const rows = await this.prisma.payment.findMany({
      where: { organizationId },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit ?? 100,
      include: OPERATOR_PAYMENT_INCLUDE,
    });
    return rows.map(toOperatorPayment);
  }

  /** One organization-scoped payment with its resident/property context. */
  async findPaymentForOrganization(
    organizationId: string,
    paymentId: string,
  ): Promise<OperatorPaymentRecord | null> {
    const row = await this.prisma.payment.findFirst({
      where: { organizationId, id: paymentId },
      include: OPERATOR_PAYMENT_INCLUDE,
    });
    return row ? toOperatorPayment(row) : null;
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

function toOperatorInvoice(row: PrismaOperatorInvoiceRow): OperatorInvoiceRecord {
  return {
    ...toInvoice(row),
    resident: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          email: row.user.email,
          phone: row.user.phone,
        }
      : null,
    property: row.property
      ? {
          id: row.property.id,
          identifier: row.property.identifier,
          name: row.property.name,
          estate: row.property.estate,
        }
      : null,
    paidKobo: row.payments.reduce((total, payment) => total + payment.amountKobo, 0),
    paymentCount: row.payments.length,
    createdBy: row.createdBy,
    voidedAt: row.voidedAt,
    voidedBy: row.voidedBy,
  };
}

function toOperatorPayment(row: PrismaOperatorPaymentRow): OperatorPaymentRecord {
  return {
    ...toPayment(row),
    period: row.invoice.period,
    resident: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          email: row.user.email,
          phone: row.user.phone,
        }
      : null,
    property: row.invoice.property
      ? {
          id: row.invoice.property.id,
          identifier: row.invoice.property.identifier,
          name: row.invoice.property.name,
          estate: row.invoice.property.estate,
        }
      : null,
    recordedBy: row.recordedBy,
  };
}
