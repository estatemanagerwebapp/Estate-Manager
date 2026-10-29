import { useMemo, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  OPERATOR_PAYMENT_METHODS,
  formatNaira,
  type BookingPaymentStatus,
  type BookingStatus,
  type OperatorBookingDto,
  type OperatorPaymentMethod,
} from '@silverstone/shared';
import { api, ApiRequestError, type OperatorBookingFilter } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { useCan } from '../auth/useCan';
import { useToast } from '../toast/Toast';
import { Modal, useConfirm } from '../components/dialog';
import { Badge, Button, Field, inputClass, selectClass, type BadgeTone } from '../components/ui';
import {
  DataTable,
  DetailDrawer,
  FilterBar,
  OperatorPageHeader,
  StatusBadge,
} from '../components/operator';

export type BookingView = 'ALL' | BookingStatus;
export type PaymentView = 'ALL' | BookingPaymentStatus;

const BOOKING_VIEWS: ReadonlyArray<{ value: BookingView; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PAYMENT_VIEWS: ReadonlyArray<{ value: PaymentView; label: string }> = [
  { value: 'ALL', label: 'All payments' },
  { value: 'UNPAID', label: 'Payment pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'NOT_REQUIRED', label: 'No payment required' },
];

const PAYMENT_METHOD_LABELS: Record<OperatorPaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  POS: 'POS',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

export function bookingFilterForView(
  view: BookingView,
  paymentView: PaymentView,
  facilityId: string,
  from: string,
  to: string,
): OperatorBookingFilter {
  return {
    ...(view === 'ALL' ? {} : { status: view }),
    ...(paymentView === 'ALL' ? {} : { paymentStatus: paymentView }),
    ...(facilityId ? { facilityId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

export function bookingStatusTone(status: BookingStatus): BadgeTone {
  switch (status) {
    case 'CONFIRMED':
      return 'success';
    case 'REQUESTED':
      return 'warning';
    case 'CANCELLED':
      return 'danger';
    case 'COMPLETED':
      return 'neutral';
  }
}

export function paymentStatusLabel(status: BookingPaymentStatus): string {
  switch (status) {
    case 'UNPAID':
      return 'Payment pending';
    case 'PAID':
      return 'Paid';
    case 'NOT_REQUIRED':
      return 'No payment required';
  }
}

export function paymentStatusTone(status: BookingPaymentStatus): BadgeTone {
  switch (status) {
    case 'UNPAID':
      return 'warning';
    case 'PAID':
      return 'success';
    case 'NOT_REQUIRED':
      return 'neutral';
  }
}

export function bookingResidentLabel(booking: OperatorBookingDto): string {
  return booking.resident?.fullName ?? booking.resident?.email ?? 'Resident account unavailable';
}

export function bookingPropertyLabel(booking: OperatorBookingDto): string {
  if (!booking.property) return 'No property assigned';
  return [booking.property.identifier, booking.property.name, booking.property.estate.name]
    .filter(Boolean)
    .join(' · ');
}

export function bookingMatchesSearch(booking: OperatorBookingDto, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return [
    bookingResidentLabel(booking),
    booking.resident?.email ?? '',
    booking.resident?.phone ?? '',
    booking.facilityName,
    booking.estate.name,
    bookingPropertyLabel(booking),
    formatWindow(booking.startsAt, booking.endsAt),
    booking.status,
    paymentStatusLabel(booking.paymentStatus),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

export function bookingCanConfirm(booking: OperatorBookingDto): boolean {
  return (
    booking.status === 'REQUESTED' &&
    (booking.paymentStatus === 'PAID' || booking.paymentStatus === 'NOT_REQUIRED')
  );
}

/**
 * Operator booking queue and lifecycle (Phase 7).
 *
 * Payment is received out of band and verified from this queue. Verification
 * creates the paid invoice but leaves the booking REQUESTED; confirmation is
 * a separate action and stays blocked while a paid-fee booking is UNPAID.
 */
export function BookingsPage() {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canManage = can['booking.manage'] === true;
  const canVerifyPayments = can['payment.verify'] === true;
  const canReadFacilities = can['facility.read'] === true;

  const [view, setView] = useState<BookingView>('ALL');
  const [paymentView, setPaymentView] = useState<PaymentView>('ALL');
  const [facilityId, setFacilityId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<OperatorBookingDto | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filter = useMemo(
    () =>
      bookingFilterForView(
        view,
        paymentView,
        facilityId,
        fromDate ? startOfLocalDay(fromDate) : '',
        toDate ? endOfLocalDay(toDate) : '',
      ),
    [view, paymentView, facilityId, fromDate, toDate],
  );

  const bookingsQuery = useApiQuery(
    queryKeys.bookings.list(filter),
    () => api.listOperatorBookings(filter),
    'Could not load bookings.',
  );
  const facilitiesQuery = useApiQuery(
    queryKeys.facilities.list({ limit: 200 }),
    () => api.listOperatorFacilities({ limit: 200 }),
    'Could not load facilities.',
    canReadFacilities,
  );

  const bookings = bookingsQuery.data?.bookings ?? [];
  const facilities = facilitiesQuery.data?.facilities ?? [];
  const visibleBookings = search.trim()
    ? bookings.filter((booking) => bookingMatchesSearch(booking, search))
    : bookings;
  const selected = bookings.find((booking) => booking.id === selectedId) ?? null;

  const now = Date.now();
  const pendingCount = bookings.filter((booking) => booking.status === 'REQUESTED').length;
  const confirmedUpcoming = bookings.filter(
    (booking) => booking.status === 'CONFIRMED' && new Date(booking.startsAt).getTime() > now,
  ).length;
  const awaitingPayment = bookings.filter(
    (booking) => booking.status === 'REQUESTED' && booking.paymentStatus === 'UNPAID',
  ).length;
  const completedCount = bookings.filter((booking) => booking.status === 'COMPLETED').length;

  const queryError =
    bookingsQuery.errorObject instanceof ApiRequestError &&
    bookingsQuery.errorObject.code === 'FORBIDDEN'
      ? 'You no longer have permission to view bookings.'
      : bookingsQuery.error;

  async function refreshAll() {
    await bookingsQuery.refresh();
    if (canReadFacilities) await facilitiesQuery.refresh();
  }

  async function invalidateBookingViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.facilities.all }),
    ]);
  }

  async function runAction(booking: OperatorBookingDto, action: 'confirm' | 'cancel' | 'complete') {
    const approved = await confirm({
      title:
        action === 'confirm'
          ? `Confirm ${booking.facilityName}?`
          : action === 'cancel'
            ? `Cancel ${booking.facilityName}?`
            : `Complete ${booking.facilityName}?`,
      body:
        action === 'confirm'
          ? 'The resident will see the booking as confirmed.'
          : action === 'cancel'
            ? 'The booking will move to CANCELLED. Any paid invoice stays in place; refunds are handled outside the console.'
            : 'This closes the booking after its window. It cannot be reopened.',
      danger: action === 'cancel',
    });
    if (!approved) return;

    setActing(true);
    setActionError(null);
    try {
      if (action === 'confirm') await api.confirmOperatorBooking(booking.id);
      if (action === 'cancel') await api.cancelOperatorBooking(booking.id);
      if (action === 'complete') await api.completeOperatorBooking(booking.id);
      toast.success(
        action === 'confirm'
          ? 'Booking confirmed.'
          : action === 'cancel'
            ? 'Booking cancelled.'
            : 'Booking completed.',
      );
      await invalidateBookingViews();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not update the booking.',
      );
      toast.error('Could not update the booking.');
    } finally {
      setActing(false);
    }
  }

  async function verifyPayment(
    booking: OperatorBookingDto,
    input: {
      method: OperatorPaymentMethod;
      reference: string;
      paidDate: string;
    },
  ) {
    setActing(true);
    setActionError(null);
    try {
      const response = await api.confirmOperatorBookingPayment(booking.id, {
        method: input.method,
        ...(input.reference.trim() ? { reference: input.reference.trim() } : {}),
        ...(input.paidDate ? { paidAt: new Date(`${input.paidDate}T12:00:00`).toISOString() } : {}),
      });
      toast.success(`Payment verified. Invoice ${response.invoice.period} is now paid.`);
      setPaymentTarget(null);
      await invalidateBookingViews();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not verify the payment.',
      );
      toast.error('Could not verify the payment.');
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <OperatorPageHeader
        icon={<CalendarDays aria-hidden size={20} className="text-(--color-primary)" />}
        title="Bookings"
        description="Review facility requests, verify payments and confirm bookings."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refreshAll()}
            disabled={bookingsQuery.fetching}
          >
            <RefreshCw
              aria-hidden
              size={14}
              className={bookingsQuery.fetching ? 'animate-spin' : undefined}
            />
            Refresh
          </Button>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Pending requests"
          value={String(pendingCount)}
          hint="Awaiting a decision"
        />
        <SummaryCard
          label="Confirmed upcoming"
          value={String(confirmedUpcoming)}
          hint="Future confirmed bookings"
        />
        <SummaryCard
          label="Awaiting payment"
          value={String(awaitingPayment)}
          hint="Paid-fee requests still UNPAID"
        />
        <SummaryCard label="Completed" value={String(completedCount)} hint="Closed bookings" />
      </div>

      {actionError && !selected && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {actionError}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Booking status views"
        className="mt-6 inline-flex flex-wrap rounded-md border border-slate-300 bg-white p-0.5"
      >
        {BOOKING_VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={view === option.value}
            onClick={() => {
              setView(option.value);
              setSearch('');
            }}
            className={tabClass(view === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <FilterBar
        summary={
          <span role="status" aria-live="polite">
            {visibleBookings.length} booking{visibleBookings.length === 1 ? '' : 's'}
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
            placeholder="Search resident, facility or estate"
            aria-label="Search bookings"
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={paymentView}
          onChange={(event) => setPaymentView(event.target.value as PaymentView)}
          aria-label="Filter by payment status"
          className={selectClass}
        >
          {PAYMENT_VIEWS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {canReadFacilities && (
          <select
            value={facilityId}
            onChange={(event) => setFacilityId(event.target.value)}
            aria-label="Filter by facility"
            className={selectClass}
          >
            <option value="">All facilities</option>
            {facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.name} · {facility.estate.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          aria-label="Filter bookings from date"
          className={selectClass}
        />
        <input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          aria-label="Filter bookings to date"
          className={selectClass}
        />
      </FilterBar>

      <DataTable
        columns={[
          {
            key: 'resident',
            header: 'Resident',
            cell: (booking) => (
              <div className="min-w-0 max-w-56">
                <p className="truncate text-xs font-medium text-(--color-ink)">
                  {bookingResidentLabel(booking)}
                </p>
                <p className="truncate text-[11px] text-(--color-ink-muted)">
                  {booking.resident?.email ?? 'No account'}
                </p>
              </div>
            ),
          },
          {
            key: 'facility',
            header: 'Facility',
            cell: (booking) => (
              <div className="min-w-0 max-w-56">
                <p className="truncate text-xs text-(--color-ink)">{booking.facilityName}</p>
                <p className="truncate text-[11px] text-(--color-ink-muted)">
                  {booking.estate.name}
                </p>
              </div>
            ),
          },
          {
            key: 'window',
            header: 'Date & time',
            cell: (booking) => (
              <span className="whitespace-nowrap text-xs text-(--color-ink)">
                {formatWindow(booking.startsAt, booking.endsAt)}
              </span>
            ),
          },
          {
            key: 'attendees',
            header: 'Attendees',
            cell: (booking) => (
              <span className="text-xs text-(--color-ink-muted)">{booking.attendees ?? '—'}</span>
            ),
          },
          {
            key: 'fee',
            header: 'Fee',
            cell: (booking) => (
              <span className="whitespace-nowrap text-xs text-(--color-ink)">
                {booking.feeKobo === 0 ? 'Free' : formatNaira(booking.feeKobo)}
              </span>
            ),
          },
          {
            key: 'payment',
            header: 'Payment',
            cell: (booking) => (
              <Badge tone={paymentStatusTone(booking.paymentStatus)}>
                {paymentStatusLabel(booking.paymentStatus)}
              </Badge>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (booking) => (
              <StatusBadge status={booking.status} tone={bookingStatusTone(booking.status)} />
            ),
          },
          {
            key: 'requested',
            header: 'Requested',
            cell: (booking) => (
              <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
                {formatDate(booking.createdAt)}
              </span>
            ),
          },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            cell: (booking) => (
              <Button size="sm" variant="ghost" onClick={() => setSelectedId(booking.id)}>
                View
              </Button>
            ),
          },
        ]}
        rows={visibleBookings}
        getRowKey={(booking) => booking.id}
        caption="Booking queue"
        loading={bookingsQuery.loading}
        error={queryError}
        onRetry={() => void refreshAll()}
        emptyTitle={search.trim() ? 'No bookings match your search' : 'No bookings in this view'}
        emptyBody={
          search.trim()
            ? 'Clear the search or switch to another status or payment filter.'
            : 'Resident booking requests appear here.'
        }
        footer={
          <span className="text-xs text-(--color-ink-muted)">{visibleBookings.length} shown</span>
        }
      />

      <DetailDrawer
        open={selected !== null}
        onClose={() => {
          setSelectedId(null);
          setActionError(null);
        }}
        title={selected?.facilityName ?? 'Booking'}
        subtitle={selected ? bookingResidentLabel(selected) : undefined}
        footer={
          selected ? (
            <BookingActions
              booking={selected}
              acting={acting}
              canManage={canManage}
              canVerifyPayments={canVerifyPayments}
              onConfirm={() => void runAction(selected, 'confirm')}
              onCancel={() => void runAction(selected, 'cancel')}
              onComplete={() => void runAction(selected, 'complete')}
              onVerifyPayment={() => {
                setActionError(null);
                setPaymentTarget(selected);
              }}
            />
          ) : undefined
        }
      >
        {selected && (
          <BookingDetail booking={selected} actionError={actionError} canManage={canManage} />
        )}
      </DetailDrawer>

      {paymentTarget && (
        <PaymentModal
          booking={paymentTarget}
          submitting={acting}
          actionError={actionError}
          onClose={() => {
            if (acting) return;
            setPaymentTarget(null);
            setActionError(null);
          }}
          onSubmit={(input) => void verifyPayment(paymentTarget, input)}
        />
      )}

      {confirmDialog}
    </div>
  );
}

function BookingDetail({
  booking,
  actionError,
  canManage,
}: {
  booking: OperatorBookingDto;
  actionError: string | null;
  canManage: boolean;
}) {
  return (
    <div>
      {actionError && (
        <p role="alert" className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {actionError}
        </p>
      )}

      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-xs">
        <dt className="text-(--color-ink-muted)">Resident</dt>
        <dd className="text-(--color-ink)">{bookingResidentLabel(booking)}</dd>
        <dt className="text-(--color-ink-muted)">Contact</dt>
        <dd className="text-(--color-ink)">
          {booking.resident?.email ?? '—'}
          {booking.resident?.phone ? ` · ${booking.resident.phone}` : ''}
        </dd>
        <dt className="text-(--color-ink-muted)">Property</dt>
        <dd className="text-(--color-ink)">{bookingPropertyLabel(booking)}</dd>
        <dt className="text-(--color-ink-muted)">Facility</dt>
        <dd className="text-(--color-ink)">
          {booking.facilityName} · {booking.estate.name}
        </dd>
        <dt className="text-(--color-ink-muted)">Date & time</dt>
        <dd className="text-(--color-ink)">{formatWindow(booking.startsAt, booking.endsAt)}</dd>
        <dt className="text-(--color-ink-muted)">Attendees</dt>
        <dd className="text-(--color-ink)">{booking.attendees ?? 'Not stated'}</dd>
        <dt className="text-(--color-ink-muted)">Fee snapshot</dt>
        <dd className="text-(--color-ink)">
          {booking.feeKobo === 0 ? 'Free' : formatNaira(booking.feeKobo)}
        </dd>
        <dt className="text-(--color-ink-muted)">Payment</dt>
        <dd>
          <Badge tone={paymentStatusTone(booking.paymentStatus)}>
            {paymentStatusLabel(booking.paymentStatus)}
          </Badge>
        </dd>
        <dt className="text-(--color-ink-muted)">Status</dt>
        <dd>
          <StatusBadge status={booking.status} tone={bookingStatusTone(booking.status)} />
        </dd>
        <dt className="text-(--color-ink-muted)">Requested</dt>
        <dd className="text-(--color-ink)">{formatDateTime(booking.createdAt)}</dd>
        <dt className="text-(--color-ink-muted)">Updated</dt>
        <dd className="text-(--color-ink)">{formatDateTime(booking.updatedAt)}</dd>
      </dl>

      <div className="mt-4 rounded-md border border-slate-200/80 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)">
          Invoice
        </p>
        {booking.invoiceId ? (
          <Link
            to={`/app/billing?invoice=${encodeURIComponent(booking.invoiceId)}`}
            className="mt-1 inline-block text-xs font-medium text-(--color-primary) underline-offset-2 hover:underline"
          >
            Open the paid invoice
          </Link>
        ) : (
          <p className="mt-1 text-xs text-(--color-ink-muted)">
            No invoice exists until payment is verified.
          </p>
        )}
      </div>

      {booking.status === 'REQUESTED' && booking.paymentStatus === 'UNPAID' && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Verify payment before confirming this booking.
        </p>
      )}
      {booking.status === 'REQUESTED' && booking.feeKobo === 0 && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          This is a free booking, so it can be confirmed without a payment step.
        </p>
      )}
      {!canManage && (
        <p className="mt-4 text-xs text-(--color-ink-muted)">
          Viewing only. Booking decisions require booking management permission.
        </p>
      )}
    </div>
  );
}

function BookingActions({
  booking,
  acting,
  canManage,
  canVerifyPayments,
  onConfirm,
  onCancel,
  onComplete,
  onVerifyPayment,
}: {
  booking: OperatorBookingDto;
  acting: boolean;
  canManage: boolean;
  canVerifyPayments: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onComplete: () => void;
  onVerifyPayment: () => void;
}) {
  const live = booking.status === 'REQUESTED' || booking.status === 'CONFIRMED';
  const confirmable = bookingCanConfirm(booking);
  const unpaidPaidFee =
    booking.status === 'REQUESTED' && booking.feeKobo > 0 && booking.paymentStatus === 'UNPAID';
  const completable =
    booking.status === 'CONFIRMED' && new Date(booking.endsAt).getTime() <= Date.now();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canVerifyPayments && unpaidPaidFee && (
        <Button size="sm" disabled={acting} onClick={onVerifyPayment}>
          <CircleDollarSign aria-hidden size={13} className="mr-1" />
          Confirm payment
        </Button>
      )}
      {canManage && booking.status === 'REQUESTED' && (
        <Button
          size="sm"
          disabled={acting || !confirmable}
          title={!confirmable ? 'Verify payment before confirming this booking.' : undefined}
          onClick={onConfirm}
        >
          <CheckCircle2 aria-hidden size={13} className="mr-1" />
          Confirm
        </Button>
      )}
      {canManage && live && (
        <Button variant="secondary" size="sm" disabled={acting} onClick={onCancel}>
          <XCircle aria-hidden size={13} className="mr-1" />
          Cancel
        </Button>
      )}
      {canManage && booking.status === 'CONFIRMED' && (
        <Button
          variant="secondary"
          size="sm"
          disabled={acting || !completable}
          title={!completable ? 'A booking can be completed after its end time.' : undefined}
          onClick={onComplete}
        >
          Complete
        </Button>
      )}
    </div>
  );
}

function PaymentModal({
  booking,
  submitting,
  actionError,
  onClose,
  onSubmit,
}: {
  booking: OperatorBookingDto;
  submitting: boolean;
  actionError: string | null;
  onClose: () => void;
  onSubmit: (input: { method: OperatorPaymentMethod; reference: string; paidDate: string }) => void;
}) {
  const [method, setMethod] = useState<OperatorPaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidDate, setPaidDate] = useState(todayInputValue());

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ method, reference, paidDate });
  }

  return (
    <Modal open onClose={onClose} title="Confirm booking payment">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-(--color-ink-muted)">
          Verify that {formatNaira(booking.feeKobo)} has been received for {booking.facilityName}.
          This creates a paid invoice and a payment record; the booking stays requested until you
          confirm it separately.
        </div>
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
        <Field label="Reference (optional)" hint="Bank reference, receipt number or note.">
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={120}
            className={inputClass}
            disabled={submitting}
          />
        </Field>
        <Field label="Paid date">
          <input
            type="date"
            value={paidDate}
            onChange={(event) => setPaidDate(event.target.value)}
            className={inputClass}
            disabled={submitting}
          />
        </Field>
        {actionError && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {actionError}
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
            {submitting ? 'Verifying…' : 'Verify payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-(--radius-card) border border-slate-200/80 bg-white px-4 py-4 shadow-(--shadow-card)">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-(--color-ink)">{value}</p>
      <p className="mt-0.5 text-xs text-(--color-ink-muted)">{hint}</p>
    </div>
  );
}

function tabClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'bg-(--color-primary) text-white'
      : 'text-(--color-ink-muted) hover:bg-(--color-surface)'
  }`;
}

function startOfLocalDay(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

function endOfLocalDay(value: string): string {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function todayInputValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function formatWindow(startsAt: string, endsAt: string): string {
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  const day = starts.toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${day} · ${formatTime(starts)}–${formatTime(ends)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { dateStyle: 'medium' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
