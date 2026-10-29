import { useState } from 'react';
import { FileText, Wallet, ArrowLeftRight, Receipt, CircleX, CreditCard } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  ResidentInvoiceDto,
  ResidentPaymentDto,
  ResidentTransactionDto,
} from '@silverstone/shared';
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
import { PaymentDetailsPanel } from '../../components/PaymentDetails';

/**
 * Resident finance page (S3).
 *
 * Four sections: outstanding bills (with a "Pay" action), paid bills,
 * payment history, and the transaction ledger. All data is self-scoped on
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
  const [payMethod, setPayMethod] = useState('');
  const [payReference, setPayReference] = useState('');
  const [paying, setPaying] = useState(false);

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
    setPayMethod('');
    setPayReference('');
  }

  function closePay() {
    setPayingInvoice(null);
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
  const paid = view?.paid ?? [];
  const payments = view?.payments ?? [];
  const transactions = view?.transactions ?? [];

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
                    <p className="text-sm font-medium">{invoice.period}</p>
                    <p className="text-xs text-(--color-ink-muted)">
                      Due {formatDate(invoice.dueAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {formatMoney(invoice.amountKobo, invoice.currency)}
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

      {/* Paid bills */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CircleX aria-hidden size={15} className="text-emerald-500" />
              Paid bills
            </span>
          }
          subtitle="Settled invoices."
        />
        <CardBody>
          {paid.length === 0 ? (
            <EmptyState title="No paid bills yet" body="Settled invoices will appear here." />
          ) : (
            <ul className="space-y-2">
              {paid.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm">{invoice.period}</span>
                  <div className="flex items-center gap-3">
                    <Badge tone="success">PAID</Badge>
                    <span className="text-sm">
                      {formatMoney(invoice.amountKobo, invoice.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Wallet aria-hidden size={15} className="text-(--color-primary)" />
              Payment history
            </span>
          }
          subtitle="Your recorded payments."
        />
        <CardBody>
          {payments.length === 0 ? (
            <EmptyState title="No payments yet" body="Your payments will appear here." />
          ) : (
            <ul className="space-y-2">
              {payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Transaction ledger */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ArrowLeftRight aria-hidden size={15} className="text-(--color-primary)" />
              Transaction history
            </span>
          }
          subtitle="Invoices, payments and fees on your ledger."
        />
        <CardBody>
          {transactions.length === 0 ? (
            <EmptyState title="No transactions yet" body="Ledger entries will appear here." />
          ) : (
            <ul className="space-y-2">
              {transactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Pay dialog (inline) */}
      {payingInvoice && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Receipt aria-hidden size={15} className="text-(--color-primary)" />
                Pay {payingInvoice.period}
              </span>
            }
            subtitle={formatMoney(payingInvoice.amountKobo, payingInvoice.currency)}
          />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Button size="sm" onClick={() => void submitPayment()} disabled={paying}>
                {paying ? 'Recording…' : 'Record payment'}
              </Button>
            </div>
          </CardBody>
        </Card>
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

function PaymentRow({ payment }: { payment: ResidentPaymentDto }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-md border border-slate-200/80 px-3 py-2">
      <div>
        <p className="text-sm font-medium">{payment.method}</p>
        <p className="text-xs text-(--color-ink-muted)">
          {payment.reference ? `Ref: ${payment.reference}` : 'No reference'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm">{formatDate(payment.paidAt)}</span>
        <span className="text-sm font-semibold">{formatMoney(payment.amountKobo, 'NGN')}</span>
      </div>
    </li>
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
          {formatDate(transaction.occurredAt)}
        </p>
      </div>
      <span
        className={`text-sm font-semibold ${isCredit ? 'text-(--color-ink)' : 'text-emerald-600'}`}
      >
        {isCredit ? '+' : '−'}
        {formatMoney(Math.abs(transaction.signed), 'NGN')}
      </span>
    </li>
  );
}

function formatMoney(kobo: number, currency: string): string {
  const major = kobo / 100;
  const formatted = major.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency === 'NGN' ? '₦' : currency} ${formatted}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
