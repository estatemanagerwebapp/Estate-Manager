import { useState } from 'react';
import { FileText, ArrowLeftRight, CreditCard } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatNaira, parseNaira } from '@silverstone/shared';
import type { ResidentInvoiceDto, ResidentTransactionDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useApiQuery } from '../../api/query';
import { useToast } from '../../toast/Toast';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Skeleton,
  Field,
  inputClass,
  EmptyState,
  ErrorBanner,
} from '../../components/ui';
import { Modal } from '../../components/dialog';
import { PaymentDetailsPanel } from '../../components/PaymentDetails';
import { formatShortDate } from '../../lib/format';

/**
 * Resident finance page (S3).
 *
 * Outstanding bills plus one filterable transaction history. All data is self-scoped on
 * the API — the acting resident can only see their own invoices and payments.
 *
 * Payment provider is NONE: "Pay" records a reference and the invoice flips
 * to PAID server-side.
 */
export function ResidentInvoicesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [payingInvoice, setPayingInvoice] = useState<ResidentInvoiceDto | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payReference, setPayReference] = useState('');
  const [paying, setPaying] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<
    'ALL' | ResidentTransactionDto['kind']
  >('ALL');
  const { data: propertyResponse } = useApiQuery(
    ['resident', 'properties'],
    () => api.getResidentProperties(),
    'Could not load your properties.',
  );
  const propertyById = new Map(
    (propertyResponse?.properties ?? []).map((property) => [property.id, property]),
  );

  const {
    data: view,
    loading,
    error: queryError,
    refresh,
  } = useApiQuery(
    ['resident', 'finance'],
    () => api.getResidentFinance(),
    'Could not load your finance.',
  );
  const error = queryError ?? paymentError;

  function openPay(invoice: ResidentInvoiceDto) {
    setPayingInvoice(invoice);
    setPayAmount(String(Math.max(invoice.outstandingKobo, 0) / 100));
    setPayMethod('');
    setPayReference('');
  }

  function closePay() {
    setPayingInvoice(null);
    setPayAmount('');
    setPayMethod('');
    setPayReference('');
  }

  async function submitPayment() {
    if (!payingInvoice) return;
    setPaying(true);
    setPaymentError(null);
    try {
      await api.createResidentPayment({
        invoiceId: payingInvoice.id,
        amountKobo: parseNaira(payAmount),
        method: payMethod.trim() || undefined,
        reference: payReference.trim() || undefined,
      });
      toast.success('Payment recorded.');
      closePay();
      void queryClient.invalidateQueries({ queryKey: ['resident', 'dashboard'] });
      await refresh();
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : 'Could not record the payment.';
      setPaymentError(message);
      toast.error('Could not record the payment.');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (error && !view) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      </div>
    );
  }

  const outstanding = view?.outstanding ?? [];
  const transactions = view?.transactions ?? [];
  const visibleTransactions =
    transactionFilter === 'ALL'
      ? transactions
      : transactions.filter((transaction) => transaction.kind === transactionFilter);

  return (
    <div className="space-y-4">
      <PageHeading />

      {error && <ErrorBanner message={error} />}

      {outstanding.length > 0 && view?.paymentDetails && (
        <PaymentDetailsPanel details={view.paymentDetails} heading="How to pay" />
      )}

      {/* Outstanding bills */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <FileText aria-hidden size={15} className="text-(--color-primary)" />
              Outstanding bills
            </span>
          }
          subtitle="Unpaid invoices with a due date."
        />
        <CardBody>
          {outstanding.length === 0 ? (
            <EmptyState title="No outstanding bills" body="You're all caught up." />
          ) : (
            <ul className="space-y-3">
              {outstanding.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-slate-200/80 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{invoice.title || invoice.period}</p>
                    <p className="text-xs text-(--color-ink-muted)">
                      {invoice.period} · Due {formatShortDate(invoice.dueAt)}
                    </p>
                    {invoice.propertyId && propertyById.get(invoice.propertyId) && (
                      <p className="text-xs text-(--color-ink-muted)">
                        {propertyById.get(invoice.propertyId)?.estate.name} ·{' '}
                        {propertyById.get(invoice.propertyId)?.identifier}
                      </p>
                    )}
                    {invoice.paidKobo > 0 && (
                      <p className="text-xs text-(--color-ink-muted)">
                        {formatNaira(invoice.paidKobo, { decimals: 2 })} paid ·{' '}
                        {formatNaira(invoice.outstandingKobo, { decimals: 2 })} remaining
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {formatNaira(invoice.outstandingKobo, { decimals: 2 })}
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => openPay(invoice)}>
                      <CreditCard aria-hidden size={13} className="mr-1" />
                      Pay
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* One filterable ledger for invoice, payment and fee activity */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ArrowLeftRight aria-hidden size={15} className="text-(--color-primary)" />
              Transaction history
            </span>
          }
          subtitle="Invoices, payments, refunds and fees in one place."
        />
        <CardBody>
          <Field label="Transaction type">
            <select
              className={inputClass}
              value={transactionFilter}
              onChange={(event) =>
                setTransactionFilter(event.target.value as typeof transactionFilter)
              }
              aria-label="Filter transaction history by type"
            >
              <option value="ALL">All transactions</option>
              <option value="INVOICE">Bills</option>
              <option value="PAYMENT">Payments</option>
              <option value="REFUND">Refunds</option>
              <option value="FEE">Fees</option>
            </select>
          </Field>
          {visibleTransactions.length === 0 ? (
            <EmptyState title="No transactions yet" body="Ledger entries will appear here." />
          ) : (
            <ul className="space-y-2">
              {visibleTransactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Keep payment action visible in a dialog even when the invoice list is long. */}
      {payingInvoice && (
        <Modal open onClose={closePay} title={`Pay ${payingInvoice.title || payingInvoice.period}`}>
          <div className="space-y-4">
            <p className="text-sm text-(--color-ink-muted)">
              {formatNaira(payingInvoice.outstandingKobo, { decimals: 2 })} outstanding. This
              records a payment against the bill.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Amount (₦)" hint="Pay the full balance or a part of it.">
                <input
                  className={inputClass}
                  value={payAmount}
                  onChange={(event) => setPayAmount(event.target.value)}
                  inputMode="decimal"
                  type="number"
                  min="0.01"
                  max={(payingInvoice.outstandingKobo / 100).toFixed(2)}
                  step="0.01"
                />
              </Field>
              <Field label="Method">
                <input
                  className={inputClass}
                  value={payMethod}
                  onChange={(event) => setPayMethod(event.target.value)}
                  maxLength={32}
                  placeholder="e.g. CASH, BANK"
                />
              </Field>
              <Field label="Reference (optional)">
                <input
                  className={inputClass}
                  value={payReference}
                  onChange={(event) => setPayReference(event.target.value)}
                  maxLength={120}
                  placeholder="e.g. receipt or transfer ref"
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={closePay} disabled={paying}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void submitPayment()}
                disabled={
                  paying ||
                  !payAmount ||
                  !Number.isFinite(Number(payAmount)) ||
                  Number(payAmount) <= 0 ||
                  Number(payAmount) * 100 > payingInvoice.outstandingKobo
                }
              >
                {paying ? 'Recording…' : 'Confirm payment'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <FileText aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Invoices &amp; Payments</h1>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: ResidentTransactionDto }) {
  const isCredit = transaction.signed >= 0;
  return (
    <li className="flex items-center justify-between gap-4 rounded-md border border-slate-200/80 px-3 py-2">
      <div>
        <div className="flex items-center gap-2">
          <Badge tone={isCredit ? 'neutral' : 'success'}>{transaction.kind}</Badge>
          {transaction.memo && (
            <span className="text-xs text-(--color-ink-muted)">{transaction.memo}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-(--color-ink-muted)">
          {formatShortDate(transaction.occurredAt)}
        </p>
      </div>
      <span
        className={`text-sm font-semibold ${isCredit ? 'text-(--color-ink)' : 'text-emerald-600'}`}
      >
        {isCredit ? '+' : '−'}
        {formatNaira(Math.abs(transaction.signed), { decimals: 2 })}
      </span>
    </li>
  );
}
