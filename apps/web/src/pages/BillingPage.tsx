import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, ReceiptText, Search, Wallet } from 'lucide-react';
import {
  OPERATOR_PAYMENT_METHODS,
  formatNaira,
  parseNaira,
  type OperatorInvoiceDto,
  type OperatorPaymentDto,
  type OperatorPaymentMethod,
  type ResidentInvoiceStatus,
} from '@silverstone/shared';
import {
  api,
  ApiRequestError,
  type OperatorInvoiceFilter,
  type OperatorPaymentFilter,
} from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { invalidateNavigationCounts } from '../api/navigation';
import { useCan } from '../auth/useCan';
import { useToast } from '../toast/Toast';
import { Modal, useConfirm } from '../components/dialog';
import {
  Button,
  Card,
  CardBody,
  ErrorBanner,
  Field,
  inputClass,
  selectClass,
} from '../components/ui';
import {
  DataTable,
  DetailDrawer,
  FilterBar,
  OperatorPageHeader,
  StatusBadge,
} from '../components/operator';
import type { BadgeTone } from '../components/ui';
import { formatDate, formatDateTime } from '../lib/format';

export type InvoiceView = 'ALL' | ResidentInvoiceStatus;
export type BillingTab = 'invoices' | 'payments';

const INVOICE_VIEWS: ReadonlyArray<{ value: InvoiceView; label: string }> = [
  { value: 'ALL', label: 'All invoices' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'VOID', label: 'Void' },
];

const PAYMENT_METHOD_LABELS: Record<OperatorPaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  POS: 'POS',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

/** Build the API filter for an invoice view. */
export function invoiceFilterForView(view: InvoiceView, estateId?: string): OperatorInvoiceFilter {
  return {
    ...(view === 'ALL' ? {} : { status: view }),
    ...(estateId ? { estateId } : {}),
  };
}

export function invoiceStatusLabel(status: ResidentInvoiceStatus): string {
  switch (status) {
    case 'UNPAID':
      return 'Unpaid';
    case 'PAID':
      return 'Paid';
    case 'OVERDUE':
      return 'Overdue';
    case 'VOID':
      return 'Void';
  }
}

export function invoiceTone(status: ResidentInvoiceStatus): BadgeTone {
  switch (status) {
    case 'UNPAID':
      return 'warning';
    case 'PAID':
      return 'success';
    case 'OVERDUE':
      return 'danger';
    case 'VOID':
      return 'neutral';
  }
}

/** An UNPAID invoice past its due date is shown as overdue without mutating it. */
export function invoiceDisplayStatus(invoice: OperatorInvoiceDto): ResidentInvoiceStatus {
  return invoice.status === 'UNPAID' && invoice.overdue ? 'OVERDUE' : invoice.status;
}

export function invoiceResidentLabel(invoice: OperatorInvoiceDto): string {
  return invoice.resident?.fullName ?? invoice.resident?.email ?? 'Resident account unavailable';
}

export function invoicePropertyLabel(invoice: OperatorInvoiceDto): string {
  if (!invoice.property) return 'No property assigned';
  const property = [invoice.property.identifier, invoice.property.name].filter(Boolean).join(' · ');
  return `${property} · ${invoice.property.estate.name}`;
}

export function invoiceMatchesSearch(invoice: OperatorInvoiceDto, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return [
    invoice.title,
    invoice.period,
    invoiceStatusLabel(invoiceDisplayStatus(invoice)),
    invoiceResidentLabel(invoice),
    invoice.resident?.email ?? '',
    invoice.resident?.phone ?? '',
    invoicePropertyLabel(invoice),
    formatNaira(invoice.amountKobo),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

export function paymentResidentLabel(payment: OperatorPaymentDto): string {
  return payment.resident?.fullName ?? payment.resident?.email ?? 'Resident account unavailable';
}

export function paymentMatchesSearch(payment: OperatorPaymentDto, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const property = payment.property
    ? [payment.property.identifier, payment.property.name, payment.property.estate.name]
        .filter(Boolean)
        .join(' · ')
    : '';
  return [
    payment.period,
    payment.method,
    payment.reference ?? '',
    paymentResidentLabel(payment),
    payment.resident?.email ?? '',
    property,
    formatNaira(payment.amountKobo),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

/**
 * Operator billing (Phase 5).
 *
 * Staff issue invoices for residents, void an unpaid invoice, and record a
 * payment received out of band. There is no payment-provider integration:
 * recording a payment writes the resident-visible payment/transaction rows and
 * settles the invoice.
 */
export function BillingPage({ fixedEstateId }: { fixedEstateId?: string } = {}) {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useState<BillingTab>('invoices');
  const [invoiceView, setInvoiceView] = useState<InvoiceView>('ALL');
  const [search, setSearch] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<OperatorInvoiceDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedInvoiceId = searchParams.get('invoice');

  const canManage = can['billing.manage'] === true;
  const canVerifyPayments = can['payment.verify'] === true;

  const invoiceFilter = useMemo(() => {
    const filter = invoiceFilterForView(invoiceView, fixedEstateId);
    // A booking-payment link can point at an invoice outside the first page
    // of the default queue; ask for the larger window while linked.
    return linkedInvoiceId ? { ...filter, limit: 200 } : filter;
  }, [invoiceView, linkedInvoiceId, fixedEstateId]);
  const paymentFilter: OperatorPaymentFilter = {
    limit: 200,
    ...(fixedEstateId ? { estateId: fixedEstateId } : {}),
  };

  const invoicesQuery = useApiQuery(
    queryKeys.invoices.list(invoiceFilter),
    () => api.listOperatorInvoices(invoiceFilter),
    'Could not load invoices.',
  );
  const paymentsQuery = useApiQuery(
    queryKeys.payments.list(paymentFilter),
    () => api.listOperatorPayments(paymentFilter),
    'Could not load payments.',
  );
  const residentsQuery = useApiQuery(
    queryKeys.residents.all,
    () => api.listResidents(),
    'Could not load residents.',
    createOpen && canManage,
  );
  const estatesQuery = useApiQuery(
    queryKeys.estates.all,
    () => api.listEstates(),
    'Could not load estates.',
    createOpen && canManage,
  );

  const invoices = invoicesQuery.data?.invoices ?? [];
  const payments = paymentsQuery.data?.payments ?? [];
  const visibleInvoices = search.trim()
    ? invoices.filter((invoice) => invoiceMatchesSearch(invoice, search))
    : invoices;
  const visiblePayments = search.trim()
    ? payments.filter((payment) => paymentMatchesSearch(payment, search))
    : payments;
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;

  useEffect(() => {
    if (!linkedInvoiceId) return;
    setTab('invoices');
    setInvoiceView('ALL');
    setSearch('');
    setSelectedInvoiceId(linkedInvoiceId);
  }, [linkedInvoiceId]);

  const outstandingKobo = invoices
    .filter((invoice) => invoice.status === 'UNPAID' || invoice.status === 'OVERDUE')
    .reduce((total, invoice) => total + Math.max(invoice.amountKobo - invoice.paidKobo, 0), 0);
  const unpaidCount = invoices.filter(
    (invoice) => invoice.status === 'UNPAID' || invoice.status === 'OVERDUE',
  ).length;
  const paymentsTotalKobo = payments.reduce((total, payment) => total + payment.amountKobo, 0);

  const queryError =
    invoicesQuery.errorObject instanceof ApiRequestError &&
    invoicesQuery.errorObject.code === 'FORBIDDEN'
      ? 'You no longer have permission to view billing.'
      : invoicesQuery.error;

  async function refreshAll() {
    await Promise.all([
      invoicesQuery.refresh(),
      paymentsQuery.refresh(),
      invalidateNavigationCounts(queryClient),
    ]);
  }

  function clearLinkedInvoice() {
    if (!linkedInvoiceId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('invoice');
    setSearchParams(next, { replace: true });
  }

  function selectTab(next: BillingTab) {
    setTab(next);
    setSearch('');
    setSelectedInvoiceId(null);
    clearLinkedInvoice();
  }

  async function createInvoice(input: {
    estateId: string;
    title: string;
    residentId: string;
    propertyId: string;
    period: string;
    amountText: string;
    dueDate: string;
  }) {
    setActing(true);
    setActionError(null);
    try {
      const amountKobo = parseNaira(input.amountText);
      const dueAt = new Date(`${input.dueDate}T00:00:00.000Z`);
      if (Number.isNaN(dueAt.getTime())) {
        throw new Error('Choose a valid due date.');
      }
      await api.createOperatorInvoice({
        title: input.title.trim(),
        residentId: input.residentId,
        propertyId: input.propertyId,
        estateId: input.estateId,
        period: input.period.trim(),
        amountKobo,
        dueAt: dueAt.toISOString(),
      });
      setCreateOpen(false);
      toast.success('Invoice issued.');
      if (invoiceView === 'ALL') {
        await refreshAll();
      } else {
        setInvoiceView('ALL');
      }
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not issue the invoice.',
      );
    } finally {
      setActing(false);
    }
  }

  async function voidInvoice(invoice: OperatorInvoiceDto) {
    const confirmed = await confirm({
      title: 'Void this invoice?',
      body: `Void the ${formatNaira(invoice.amountKobo)} invoice for ${invoiceResidentLabel(
        invoice,
      )}? This cannot be undone.`,
      danger: true,
    });
    if (!confirmed) return;

    setActing(true);
    setActionError(null);
    try {
      await api.voidOperatorInvoice(invoice.id);
      toast.success('Invoice voided.');
      setSelectedInvoiceId(null);
      await refreshAll();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : 'Could not void the invoice.',
      );
    } finally {
      setActing(false);
    }
  }

  async function recordPayment(
    invoice: OperatorInvoiceDto,
    input: {
      amountText: string;
      method: OperatorPaymentMethod;
      reference: string;
      paidDate: string;
    },
  ) {
    setActing(true);
    setActionError(null);
    try {
      const paidAt = new Date(`${input.paidDate}T00:00:00.000Z`);
      if (Number.isNaN(paidAt.getTime())) {
        throw new Error('Choose a valid payment date.');
      }
      await api.recordOperatorPayment(invoice.id, {
        amountKobo: parseNaira(input.amountText),
        method: input.method,
        reference: input.reference.trim() || undefined,
        paidAt: paidAt.toISOString(),
      });
      setPaymentTarget(null);
      toast.success(`Payment recorded for ${invoiceResidentLabel(invoice)}.`);
      await refreshAll();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not record the payment.',
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <OperatorPageHeader
        icon={<Wallet aria-hidden size={20} className="text-(--color-primary)" />}
        title="Billing"
        description="Issue invoices and record payments received by the estate office."
        actions={
          <>
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setActionError(null);
                  setCreateOpen(true);
                }}
              >
                <Plus aria-hidden size={14} />
                New invoice
              </Button>
            )}
          </>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Outstanding in view"
          value={formatNaira(outstandingKobo)}
          hint={`${unpaidCount} unpaid invoice${unpaidCount === 1 ? '' : 's'}`}
        />
        <SummaryCard
          label="Invoices in view"
          value={String(invoices.length)}
          hint={invoiceView === 'ALL' ? 'All statuses' : invoiceStatusLabel(invoiceView)}
        />
        <SummaryCard
          label="Payments on record"
          value={formatNaira(paymentsTotalKobo)}
          hint={`${payments.length} recorded payment${payments.length === 1 ? '' : 's'}`}
        />
      </div>

      <div
        role="tablist"
        aria-label="Billing views"
        className="mt-6 inline-flex rounded-md border border-slate-300 bg-white p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'invoices'}
          onClick={() => selectTab('invoices')}
          className={tabClass(tab === 'invoices')}
        >
          <ReceiptText aria-hidden size={14} />
          Invoices
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'payments'}
          onClick={() => selectTab('payments')}
          className={tabClass(tab === 'payments')}
        >
          <Banknote aria-hidden size={14} />
          Payments
        </button>
      </div>

      <FilterBar
        summary={
          <span role="status" aria-live="polite">
            {tab === 'invoices'
              ? `${visibleInvoices.length} invoice${visibleInvoices.length === 1 ? '' : 's'}`
              : `${visiblePayments.length} payment${visiblePayments.length === 1 ? '' : 's'}`}
          </span>
        }
      >
        <div className="relative">
          <Search
            aria-hidden
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-ink-muted)"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              tab === 'invoices'
                ? 'Search resident, property or period'
                : 'Search resident, method or reference'
            }
            aria-label={tab === 'invoices' ? 'Search invoices' : 'Search payments'}
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        {tab === 'invoices' && (
          <select
            value={invoiceView}
            onChange={(event) => setInvoiceView(event.target.value as InvoiceView)}
            aria-label="Filter invoices"
            className={selectClass}
          >
            {INVOICE_VIEWS.map((view) => (
              <option key={view.value} value={view.value}>
                {view.label}
              </option>
            ))}
          </select>
        )}
      </FilterBar>

      {actionError && (
        <div className="mt-4">
          <ErrorBanner message={actionError} />
        </div>
      )}

      {tab === 'invoices' ? (
        <DataTable
          columns={[
            {
              key: 'invoice',
              header: 'Invoice',
              cell: (invoice) => (
                <div className="min-w-0">
                  <p className="font-medium text-(--color-ink)">
                    {invoice.title || invoice.period}
                  </p>
                  <p className="mt-0.5 text-xs text-(--color-ink-muted)">
                    {invoice.period} · Issued {formatDate(invoice.issuedAt)}
                  </p>
                </div>
              ),
            },
            {
              key: 'resident',
              header: 'Resident',
              cell: (invoice) => (
                <div className="min-w-0">
                  <p className="truncate text-xs text-(--color-ink)">
                    {invoiceResidentLabel(invoice)}
                  </p>
                  <p className="truncate text-[11px] text-(--color-ink-muted)">
                    {invoice.resident?.email ?? 'No account'}
                  </p>
                </div>
              ),
            },
            {
              key: 'property',
              header: 'Property',
              cell: (invoice) => (
                <span className="text-xs text-(--color-ink-muted)">
                  {invoicePropertyLabel(invoice)}
                </span>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              cell: (invoice) => (
                <div>
                  <p className="whitespace-nowrap text-xs font-medium text-(--color-ink)">
                    {formatNaira(invoice.amountKobo)}
                  </p>
                  {invoice.paidKobo > 0 && invoice.status !== 'PAID' && (
                    <p className="text-[11px] text-(--color-ink-muted)">
                      {formatNaira(invoice.paidKobo)} paid
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (invoice) => {
                const display = invoiceDisplayStatus(invoice);
                return (
                  <StatusBadge
                    status={display}
                    label={invoiceStatusLabel(display)}
                    tone={invoiceTone(display)}
                  />
                );
              },
            },
            {
              key: 'due',
              header: 'Due',
              cell: (invoice) => (
                <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
                  {formatDate(invoice.dueAt)}
                </span>
              ),
            },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              cell: (invoice) => (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActionError(null);
                    setSelectedInvoiceId(invoice.id);
                  }}
                  aria-label={`Open invoice: ${invoice.period} for ${invoiceResidentLabel(invoice)}`}
                >
                  Open
                </Button>
              ),
            },
          ]}
          rows={visibleInvoices}
          getRowKey={(invoice) => invoice.id}
          caption="Invoices"
          loading={invoicesQuery.loading}
          error={queryError}
          onRetry={() => void refreshAll()}
          emptyTitle={search.trim() ? 'No invoices match your search' : 'No invoices in this view'}
          emptyBody={
            search.trim()
              ? 'Clear the search or switch to another invoice view.'
              : 'Issue an invoice to start a resident billing record.'
          }
          emptyAction={
            canManage && !search.trim() ? (
              <Button
                size="sm"
                onClick={() => {
                  setActionError(null);
                  setCreateOpen(true);
                }}
              >
                <Plus aria-hidden size={14} />
                New invoice
              </Button>
            ) : undefined
          }
          footer={
            <span className="text-xs text-(--color-ink-muted)">{visibleInvoices.length} shown</span>
          }
        />
      ) : (
        <DataTable
          columns={[
            {
              key: 'paidAt',
              header: 'Paid',
              cell: (payment) => (
                <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
                  {formatDate(payment.paidAt)}
                </span>
              ),
            },
            {
              key: 'resident',
              header: 'Resident',
              cell: (payment) => (
                <div className="min-w-0">
                  <p className="truncate text-xs text-(--color-ink)">
                    {paymentResidentLabel(payment)}
                  </p>
                  <p className="truncate text-[11px] text-(--color-ink-muted)">
                    {payment.resident?.email ?? 'No account'}
                  </p>
                </div>
              ),
            },
            {
              key: 'invoice',
              header: 'Invoice',
              cell: (payment) => (
                <div className="min-w-0">
                  <p className="text-xs text-(--color-ink)">{payment.period}</p>
                  <p className="truncate text-[11px] text-(--color-ink-muted)">
                    {payment.property
                      ? `${payment.property.identifier} · ${payment.property.estate.name}`
                      : 'No property assigned'}
                  </p>
                </div>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              cell: (payment) => (
                <span className="whitespace-nowrap text-xs font-medium text-(--color-ink)">
                  {formatNaira(payment.amountKobo)}
                </span>
              ),
            },
            {
              key: 'method',
              header: 'Method',
              cell: (payment) => (
                <span className="text-xs text-(--color-ink-muted)">
                  {payment.method.replaceAll('_', ' ')}
                </span>
              ),
            },
            {
              key: 'reference',
              header: 'Reference',
              cell: (payment) => (
                <span className="text-xs text-(--color-ink-muted)">{payment.reference ?? '—'}</span>
              ),
            },
            {
              key: 'recordedBy',
              header: 'Recorded by',
              cell: (payment) => (
                <span className="text-xs text-(--color-ink-muted)">
                  {payment.recordedBy?.fullName ?? payment.recordedBy?.email ?? 'Resident / system'}
                </span>
              ),
            },
          ]}
          rows={visiblePayments}
          getRowKey={(payment) => payment.id}
          caption="Recorded payments"
          loading={paymentsQuery.loading}
          error={paymentsQuery.error}
          onRetry={() => void refreshAll()}
          emptyTitle={search.trim() ? 'No payments match your search' : 'No payments recorded'}
          emptyBody={
            search.trim()
              ? 'Clear the search to see the full payment history.'
              : 'Payments recorded by the estate office appear here.'
          }
          footer={
            <span className="text-xs text-(--color-ink-muted)">{visiblePayments.length} shown</span>
          }
        />
      )}

      <DetailDrawer
        open={selectedInvoice !== null}
        onClose={() => {
          setSelectedInvoiceId(null);
          setActionError(null);
          clearLinkedInvoice();
        }}
        title={selectedInvoice ? selectedInvoice.title || selectedInvoice.period : 'Invoice'}
        subtitle={
          selectedInvoice ? (
            <>
              {invoiceResidentLabel(selectedInvoice)} · {invoicePropertyLabel(selectedInvoice)}
            </>
          ) : null
        }
        footer={
          selectedInvoice ? (
            <>
              {canManage &&
                selectedInvoice.status !== 'PAID' &&
                selectedInvoice.status !== 'VOID' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void voidInvoice(selectedInvoice)}
                    disabled={acting}
                  >
                    Void invoice
                  </Button>
                )}
              {canVerifyPayments &&
                selectedInvoice.status !== 'PAID' &&
                selectedInvoice.status !== 'VOID' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setActionError(null);
                      setPaymentTarget(selectedInvoice);
                    }}
                    disabled={acting}
                  >
                    <Banknote aria-hidden size={14} />
                    Record payment
                  </Button>
                )}
            </>
          ) : undefined
        }
      >
        {selectedInvoice && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={invoiceDisplayStatus(selectedInvoice)}
                label={invoiceStatusLabel(invoiceDisplayStatus(selectedInvoice))}
                tone={invoiceTone(invoiceDisplayStatus(selectedInvoice))}
              />
              <span className="text-[11px] text-(--color-ink-muted)">
                Issued {formatDateTime(selectedInvoice.issuedAt)}
              </span>
            </div>

            <dl className="mt-3 grid gap-2 text-xs text-(--color-ink-muted)">
              <div>
                <dt className="font-medium uppercase tracking-wide">Amount</dt>
                <dd className="text-sm font-semibold text-(--color-ink)">
                  {formatNaira(selectedInvoice.amountKobo)}
                </dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Resident</dt>
                <dd className="text-(--color-ink)">
                  {invoiceResidentLabel(selectedInvoice)}
                  {selectedInvoice.resident?.email ? ` · ${selectedInvoice.resident.email}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Property</dt>
                <dd className="text-(--color-ink)">{invoicePropertyLabel(selectedInvoice)}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Due</dt>
                <dd className="text-(--color-ink)">{formatDate(selectedInvoice.dueAt)}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Issued by</dt>
                <dd className="text-(--color-ink)">
                  {selectedInvoice.createdBy?.fullName ??
                    selectedInvoice.createdBy?.email ??
                    'Registration seed'}
                </dd>
              </div>
              {selectedInvoice.voidedAt && (
                <div>
                  <dt className="font-medium uppercase tracking-wide">Voided</dt>
                  <dd className="text-(--color-ink)">
                    {formatDateTime(selectedInvoice.voidedAt)}
                    {selectedInvoice.voidedBy
                      ? ` · ${selectedInvoice.voidedBy.fullName ?? selectedInvoice.voidedBy.email}`
                      : ''}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-5 rounded-md bg-slate-50 px-3 py-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)">
                Payment status
              </h3>
              <p className="mt-1 text-sm text-(--color-ink)">
                {selectedInvoice.status === 'PAID'
                  ? `Settled in full · ${formatNaira(selectedInvoice.paidKobo)} recorded.`
                  : selectedInvoice.status === 'VOID'
                    ? 'This invoice was voided and is no longer due.'
                    : `Outstanding · ${formatNaira(
                        Math.max(selectedInvoice.amountKobo - selectedInvoice.paidKobo, 0),
                      )}`}
              </p>
            </div>

            {selectedInvoice.status !== 'PAID' &&
              selectedInvoice.status !== 'VOID' &&
              !canVerifyPayments && (
                <p className="mt-4 text-xs text-(--color-ink-muted)">
                  You can read this invoice but cannot record payments.
                </p>
              )}
            {selectedInvoice.status !== 'PAID' &&
              selectedInvoice.status !== 'VOID' &&
              !canManage && (
                <p className="mt-2 text-xs text-(--color-ink-muted)">
                  Voiding an invoice requires billing management permission.
                </p>
              )}
          </div>
        )}
      </DetailDrawer>

      {createOpen && (
        <CreateInvoiceModal
          fixedEstateId={fixedEstateId}
          estates={estatesQuery.data?.estates ?? []}
          residents={billableResidents(residentsQuery.data?.residents ?? [])}
          loading={residentsQuery.loading || estatesQuery.loading}
          error={residentsQuery.error ?? estatesQuery.error}
          submitting={acting}
          actionError={actionError}
          onClose={() => {
            setCreateOpen(false);
            setActionError(null);
          }}
          onSubmit={(input) => void createInvoice(input)}
        />
      )}

      {paymentTarget && (
        <RecordPaymentModal
          invoice={paymentTarget}
          submitting={acting}
          actionError={actionError}
          onClose={() => {
            setPaymentTarget(null);
            setActionError(null);
          }}
          onSubmit={(input) => void recordPayment(paymentTarget, input)}
        />
      )}

      {confirmDialog}
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card aria-label={label}>
      <CardBody className="py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)">
          {label}
        </p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-(--color-ink)">{value}</p>
        <p className="mt-0.5 text-xs text-(--color-ink-muted)">{hint}</p>
      </CardBody>
    </Card>
  );
}

function tabClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'bg-(--color-primary) text-white'
      : 'text-(--color-ink-muted) hover:bg-(--color-surface)'
  }`;
}

function CreateInvoiceModal({
  fixedEstateId,
  estates,
  residents,
  loading,
  error,
  submitting,
  actionError,
  onClose,
  onSubmit,
}: {
  fixedEstateId?: string;
  estates: ReadonlyArray<{ id: string; name: string; slug: string }>;
  residents: ReadonlyArray<{
    userId: string;
    propertyId: string;
    firstName: string;
    email: string | null;
    property: { identifier: string; name: string | null; estate: { name: string; slug: string } };
  }>;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  actionError: string | null;
  onClose: () => void;
  onSubmit: (input: {
    estateId: string;
    title: string;
    residentId: string;
    propertyId: string;
    period: string;
    amountText: string;
    dueDate: string;
  }) => void;
}) {
  const [estateId, setEstateId] = useState(fixedEstateId ?? '');
  const [residentSearch, setResidentSearch] = useState('');
  const [residentChoice, setResidentChoice] = useState('');
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState(defaultPeriod());
  const [amountText, setAmountText] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [formError, setFormError] = useState<string | null>(null);

  const estateSlug = estates.find((estate) => estate.id === estateId)?.slug ?? '';
  const estateResidents = residents.filter(
    (resident) => resident.property.estate.slug === estateSlug,
  );
  const search = residentSearch.trim().toLowerCase();
  const visibleResidents = search
    ? estateResidents.filter((resident) =>
        [
          resident.firstName,
          resident.email ?? '',
          resident.property.identifier,
          resident.property.name ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(search),
      )
    : estateResidents;
  const selected = estateResidents.find(
    (resident) => `${resident.userId}:${resident.propertyId}` === residentChoice,
  );

  function chooseEstate(next: string) {
    setEstateId(next);
    setResidentChoice('');
    setResidentSearch('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!estateId) {
      setFormError('Choose an estate.');
      return;
    }
    if (!selected) {
      setFormError('Search and choose a resident in that estate.');
      return;
    }
    if (!title.trim()) {
      setFormError('Enter a bill name.');
      return;
    }
    if (!period.trim()) {
      setFormError('Enter a billing period.');
      return;
    }
    if (!amountText.trim()) {
      setFormError('Enter an amount in naira.');
      return;
    }
    if (!dueDate) {
      setFormError('Choose a due date.');
      return;
    }
    onSubmit({
      estateId,
      title,
      residentId: selected.userId,
      propertyId: selected.propertyId,
      period,
      amountText,
      dueDate,
    });
  }

  return (
    <Modal open onClose={onClose} title="New invoice">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Estate" hint="The resident list below is limited to this estate.">
          <select
            value={estateId}
            onChange={(event) => chooseEstate(event.target.value)}
            className={inputClass}
            disabled={Boolean(fixedEstateId) || loading || submitting}
          >
            <option value="">{loading ? 'Loading estates…' : 'Choose an estate'}</option>
            {estates.map((estate) => (
              <option key={estate.id} value={estate.id}>
                {estate.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Resident"
          hint={
            !estateId
              ? 'Choose an estate first.'
              : selected
                ? `${selected.property.identifier} · ${selected.property.estate.name}`
                : 'Only residents with a completed portal account can be billed.'
          }
        >
          <input
            type="search"
            value={residentSearch}
            onChange={(event) => setResidentSearch(event.target.value)}
            placeholder="Search by name, email or property"
            aria-label="Search residents in the selected estate"
            className={inputClass}
            disabled={!estateId || loading || submitting}
          />
          <select
            value={residentChoice}
            onChange={(event) => setResidentChoice(event.target.value)}
            className={`${inputClass} mt-2`}
            aria-label="Select resident"
            disabled={!estateId || loading || submitting}
          >
            <option value="">
              {!estateId
                ? 'Choose an estate first'
                : visibleResidents.length === 0
                  ? 'No residents match'
                  : 'Choose a resident'}
            </option>
            {visibleResidents.map((resident) => (
              <option
                key={`${resident.userId}:${resident.propertyId}`}
                value={`${resident.userId}:${resident.propertyId}`}
              >
                {resident.firstName}
                {resident.email ? ` · ${resident.email}` : ''} · {resident.property.identifier}
              </option>
            ))}
          </select>
        </Field>
        {error && <p className="text-xs text-rose-600">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bill name" hint="For example “Security levy”.">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              className={inputClass}
              disabled={submitting}
            />
          </Field>
          <Field label="Period" hint="For example “2026-11” or “Q4 2026”.">
            <input
              type="text"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              maxLength={48}
              className={inputClass}
              disabled={submitting}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₦)">
            <input
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              placeholder="25,000"
              className={inputClass}
              disabled={submitting}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </Field>
        </div>

        {(formError || actionError) && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {formError ?? actionError}
          </p>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? 'Issuing…' : 'Issue invoice'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RecordPaymentModal({
  invoice,
  submitting,
  actionError,
  onClose,
  onSubmit,
}: {
  invoice: OperatorInvoiceDto;
  submitting: boolean;
  actionError: string | null;
  onClose: () => void;
  onSubmit: (input: {
    amountText: string;
    method: OperatorPaymentMethod;
    reference: string;
    paidDate: string;
  }) => void;
}) {
  const outstanding = Math.max(invoice.amountKobo - invoice.paidKobo, 0);
  const [amountText, setAmountText] = useState(String(outstanding / 100));
  const [method, setMethod] = useState<OperatorPaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidDate, setPaidDate] = useState(todayInput());
  const [formError, setFormError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!amountText.trim()) {
      setFormError('Enter the amount received.');
      return;
    }
    if (!paidDate) {
      setFormError('Choose a payment date.');
      return;
    }
    onSubmit({ amountText, method, reference, paidDate });
  }

  return (
    <Modal open onClose={onClose} title="Record payment">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="rounded-md bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)">
            Outstanding
          </p>
          <p className="mt-1 text-lg font-semibold text-(--color-ink)">
            {formatNaira(outstanding)}
          </p>
          <p className="mt-0.5 text-xs text-(--color-ink-muted)">
            {invoice.title || invoice.period} · {invoiceResidentLabel(invoice)}
          </p>
          {invoice.paidKobo > 0 && (
            <p className="mt-1 text-xs text-(--color-ink-muted)">
              {formatNaira(invoice.paidKobo)} already paid of {formatNaira(invoice.amountKobo)}.
            </p>
          )}
        </div>

        <Field label="Amount received (₦)" hint="Enter a smaller amount to record a part payment.">
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            className={inputClass}
            disabled={submitting}
          />
        </Field>

        <Field label="Payment method">
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as OperatorPaymentMethod)}
            className={inputClass}
            disabled={submitting}
          >
            {OPERATOR_PAYMENT_METHODS.map((option) => (
              <option key={option} value={option}>
                {PAYMENT_METHOD_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reference" hint="Optional bank teller, transfer or receipt reference.">
          <input
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={120}
            className={inputClass}
            disabled={submitting}
          />
        </Field>

        <Field label="Payment date">
          <input
            type="date"
            value={paidDate}
            onChange={(event) => setPaidDate(event.target.value)}
            className={inputClass}
            disabled={submitting}
          />
        </Field>

        {(formError || actionError) && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {formError ?? actionError}
          </p>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? 'Recording…' : 'Record payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function billableResidents(
  residents: ReadonlyArray<{
    status: string;
    userId: string | null;
    propertyId: string;
    firstName: string;
    email: string | null;
    archivedAt?: string | null;
    property: { identifier: string; name: string | null; estate: { name: string; slug: string } };
  }>,
): Array<{
  userId: string;
  propertyId: string;
  firstName: string;
  email: string | null;
  property: { identifier: string; name: string | null; estate: { name: string; slug: string } };
}> {
  return residents
    .filter(
      (resident) =>
        resident.status === 'COMPLETED' && resident.userId !== null && !resident.archivedAt,
    )
    .map((resident) => ({
      userId: resident.userId as string,
      propertyId: resident.propertyId,
      firstName: resident.firstName,
      email: resident.email,
      property: resident.property,
    }))
    .sort((left, right) => left.firstName.localeCompare(right.firstName));
}

function defaultPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function defaultDueDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString().slice(0, 10);
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}
