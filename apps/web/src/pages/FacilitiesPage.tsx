import { useMemo, useState, type FormEvent } from 'react';
import { Archive, Building, Pencil, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatNaira,
  parseNaira,
  type OperatorFacilityDto,
  type OperatorFacilityStatus,
} from '@silverstone/shared';
import { api, ApiRequestError, type OperatorFacilityFilter } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { useCan } from '../auth/useCan';
import { useToast } from '../toast/Toast';
import { Modal, useConfirm } from '../components/dialog';
import { Badge, Button, Field, inputClass, selectClass, type BadgeTone } from '../components/ui';
import { DataTable, FilterBar, OperatorPageHeader } from '../components/operator';

type FacilityView = 'ALL' | OperatorFacilityStatus;

const FACILITY_VIEWS: ReadonlyArray<{ value: FacilityView; label: string }> = [
  { value: 'ALL', label: 'All facilities' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function facilityFilterForView(
  view: FacilityView,
  estateId: string,
): OperatorFacilityFilter {
  return {
    ...(view === 'ALL' ? {} : { status: view }),
    ...(estateId ? { estateId } : {}),
  };
}

export function facilityStatusLabel(facility: OperatorFacilityDto): string {
  if (facility.archivedAt) return 'Archived';
  return facility.bookable ? 'Active' : 'Suspended';
}

export function facilityStatusTone(facility: OperatorFacilityDto): BadgeTone {
  if (facility.archivedAt) return 'neutral';
  return facility.bookable ? 'success' : 'warning';
}

export function facilityMatchesSearch(facility: OperatorFacilityDto, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return [
    facility.name,
    facility.description,
    facility.estate.name,
    formatNaira(facility.usageFeeKobo),
    facility.usageFeeKobo === 0 ? 'free' : '',
    facilityStatusLabel(facility),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

/**
 * Operator facility register (Phase 7).
 *
 * Facilities belong to one estate and carry a flat per-booking fee. Staff can
 * create, edit, suspend and archive; archived rows stay visible for history.
 */
export function FacilitiesPage() {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canManage = can['facility.manage'] === true;
  const canReadEstates = can['estate.read'] === true;

  const [search, setSearch] = useState('');
  const [view, setView] = useState<FacilityView>('ALL');
  const [estateId, setEstateId] = useState('');
  const [formFacility, setFormFacility] = useState<OperatorFacilityDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filter = useMemo(() => facilityFilterForView(view, estateId), [view, estateId]);
  const facilitiesQuery = useApiQuery(
    queryKeys.facilities.list(filter),
    () => api.listOperatorFacilities(filter),
    'Could not load facilities.',
  );
  const estatesQuery = useApiQuery(
    queryKeys.estates.all,
    () => api.listEstates({ status: 'ACTIVE' }),
    'Could not load estates.',
    canReadEstates,
  );

  const facilities = facilitiesQuery.data?.facilities ?? [];
  const estates = estatesQuery.data?.estates ?? [];
  const visibleFacilities = search.trim()
    ? facilities.filter((facility) => facilityMatchesSearch(facility, search))
    : facilities;

  const activeCount = facilities.filter(
    (facility) => !facility.archivedAt && facility.bookable,
  ).length;
  const suspendedCount = facilities.filter(
    (facility) => !facility.archivedAt && !facility.bookable,
  ).length;
  const waitingCount = facilities.reduce(
    (total, facility) => total + facility.waitingWatchCount,
    0,
  );
  const archivedCount = facilities.filter((facility) => facility.archivedAt).length;

  const queryError =
    facilitiesQuery.errorObject instanceof ApiRequestError &&
    facilitiesQuery.errorObject.code === 'FORBIDDEN'
      ? 'You no longer have permission to view facilities.'
      : facilitiesQuery.error;

  async function refreshAll() {
    await facilitiesQuery.refresh();
    if (canReadEstates) await estatesQuery.refresh();
  }

  function openCreate() {
    setFormFacility(null);
    setActionError(null);
    setFormOpen(true);
  }

  function openEdit(facility: OperatorFacilityDto) {
    setFormFacility(facility);
    setActionError(null);
    setFormOpen(true);
  }

  async function createFacility(input: {
    name: string;
    description: string;
    estateId: string;
    usageFeeKobo: number;
    bookable: boolean;
  }) {
    setActing(true);
    setActionError(null);
    try {
      await api.createOperatorFacility(input);
      toast.success('Facility created.');
      setFormOpen(false);
      await invalidateFacilityViews();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not create the facility.',
      );
    } finally {
      setActing(false);
    }
  }

  async function updateFacility(
    facility: OperatorFacilityDto,
    input: {
      name: string;
      description: string;
      estateId: string;
      usageFeeKobo: number;
      bookable: boolean;
    },
  ) {
    setActing(true);
    setActionError(null);
    try {
      await api.updateOperatorFacility(facility.id, input);
      toast.success('Facility updated.');
      setFormOpen(false);
      setFormFacility(null);
      await invalidateFacilityViews();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not update the facility.',
      );
    } finally {
      setActing(false);
    }
  }

  async function archiveFacility(facility: OperatorFacilityDto) {
    const approved = await confirm({
      title: `Archive ${facility.name}?`,
      body: 'The facility will disappear from the resident list and cannot accept new bookings. Its waiting alerts are cancelled. This cannot be undone from the console.',
      danger: true,
    });
    if (!approved) return;

    setActing(true);
    setActionError(null);
    try {
      await api.archiveOperatorFacility(facility.id);
      toast.success('Facility archived.');
      await invalidateFacilityViews();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not archive the facility.',
      );
      toast.error('Could not archive the facility.');
    } finally {
      setActing(false);
    }
  }

  async function invalidateFacilityViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.facilities.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all }),
    ]);
  }

  return (
    <div>
      <OperatorPageHeader
        icon={<Building aria-hidden size={20} className="text-(--color-primary)" />}
        title="Facilities"
        description="Estate amenities, their per-booking fee and current availability."
        actions={
          <>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden size={14} />
                New facility
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refreshAll()}
              disabled={facilitiesQuery.fetching}
            >
              <RefreshCw
                aria-hidden
                size={14}
                className={facilitiesQuery.fetching ? 'animate-spin' : undefined}
              />
              Refresh
            </Button>
          </>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Active" value={String(activeCount)} hint="Bookable facilities" />
        <SummaryCard
          label="Suspended"
          value={String(suspendedCount)}
          hint="Visible but not accepting requests"
        />
        <SummaryCard
          label="Waiting alerts"
          value={String(waitingCount)}
          hint="Residents waiting on occupied slots"
        />
        <SummaryCard
          label="Archived"
          value={String(archivedCount)}
          hint="Retained for booking history"
        />
      </div>

      {actionError && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {actionError}
        </p>
      )}

      <FilterBar
        summary={
          <span role="status" aria-live="polite">
            {visibleFacilities.length} facilit{visibleFacilities.length === 1 ? 'y' : 'ies'}
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
            placeholder="Search name, estate or fee"
            aria-label="Search facilities"
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={view}
          onChange={(event) => setView(event.target.value as FacilityView)}
          aria-label="Filter facilities by status"
          className={selectClass}
        >
          {FACILITY_VIEWS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {canReadEstates && (
          <select
            value={estateId}
            onChange={(event) => setEstateId(event.target.value)}
            aria-label="Filter facilities by estate"
            className={selectClass}
          >
            <option value="">All estates</option>
            {estates.map((estate) => (
              <option key={estate.id} value={estate.id}>
                {estate.name}
              </option>
            ))}
          </select>
        )}
      </FilterBar>

      <DataTable
        columns={[
          {
            key: 'facility',
            header: 'Facility',
            cell: (facility) => (
              <div className="min-w-0 max-w-72">
                <p className="truncate text-xs font-medium text-(--color-ink)">{facility.name}</p>
                <p className="truncate text-[11px] text-(--color-ink-muted)">
                  {facility.description}
                </p>
              </div>
            ),
          },
          {
            key: 'estate',
            header: 'Estate',
            cell: (facility) => (
              <span className="text-xs text-(--color-ink-muted)">{facility.estate.name}</span>
            ),
          },
          {
            key: 'fee',
            header: 'Usage fee',
            cell: (facility) => (
              <span className="whitespace-nowrap text-xs text-(--color-ink)">
                {facility.usageFeeKobo === 0 ? 'Free' : formatNaira(facility.usageFeeKobo)}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (facility) => (
              <Badge tone={facilityStatusTone(facility)}>{facilityStatusLabel(facility)}</Badge>
            ),
          },
          {
            key: 'bookings',
            header: 'Live bookings',
            cell: (facility) => (
              <span className="text-xs text-(--color-ink-muted)">{facility.liveBookingCount}</span>
            ),
          },
          {
            key: 'watches',
            header: 'Waiting alerts',
            cell: (facility) => (
              <span className="text-xs text-(--color-ink-muted)">{facility.waitingWatchCount}</span>
            ),
          },
          {
            key: 'created',
            header: 'Created',
            cell: (facility) => (
              <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
                {formatDate(facility.createdAt)}
              </span>
            ),
          },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            cell: (facility) => {
              if (!canManage) return null;
              const archiveBlocked = Boolean(facility.archivedAt) || facility.liveBookingCount > 0;
              const archiveReason = facility.archivedAt
                ? 'This facility is already archived.'
                : 'Resolve live bookings before archiving this facility.';
              return (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={Boolean(facility.archivedAt) || acting}
                    onClick={() => openEdit(facility)}
                  >
                    <Pencil aria-hidden size={13} className="mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={archiveBlocked || acting}
                    title={archiveBlocked ? archiveReason : undefined}
                    onClick={() => void archiveFacility(facility)}
                  >
                    <Archive aria-hidden size={13} className="mr-1" />
                    Archive
                  </Button>
                </div>
              );
            },
          },
        ]}
        rows={visibleFacilities}
        getRowKey={(facility) => facility.id}
        caption="Facility register"
        loading={facilitiesQuery.loading}
        error={queryError}
        onRetry={() => void refreshAll()}
        emptyTitle={
          search.trim() ? 'No facilities match your search' : 'No facilities in this view'
        }
        emptyBody={
          search.trim()
            ? 'Clear the search or switch to another status filter.'
            : 'Create the first facility for an estate.'
        }
        emptyAction={
          canManage && !search.trim() ? (
            <Button size="sm" onClick={openCreate}>
              <Plus aria-hidden size={14} />
              New facility
            </Button>
          ) : undefined
        }
        footer={
          <span className="text-xs text-(--color-ink-muted)">{visibleFacilities.length} shown</span>
        }
      />

      {formOpen && (
        <FacilityModal
          facility={formFacility}
          estates={estates}
          estatesLoading={estatesQuery.loading}
          submitting={acting}
          actionError={actionError}
          onClose={() => {
            if (acting) return;
            setFormOpen(false);
            setFormFacility(null);
            setActionError(null);
          }}
          onSubmit={(input) => {
            if (formFacility) {
              void updateFacility(formFacility, input);
            } else {
              void createFacility(input);
            }
          }}
        />
      )}

      {confirmDialog}
    </div>
  );
}

function FacilityModal({
  facility,
  estates,
  estatesLoading,
  submitting,
  actionError,
  onClose,
  onSubmit,
}: {
  facility: OperatorFacilityDto | null;
  estates: ReadonlyArray<{ id: string; name: string }>;
  estatesLoading: boolean;
  submitting: boolean;
  actionError: string | null;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    estateId: string;
    usageFeeKobo: number;
    bookable: boolean;
  }) => void;
}) {
  const [name, setName] = useState(facility?.name ?? '');
  const [description, setDescription] = useState(facility?.description ?? '');
  const [estateId, setEstateId] = useState(facility?.estate.id ?? '');
  const [feeText, setFeeText] = useState(facility ? String(facility.usageFeeKobo / 100) : '');
  const [bookable, setBookable] = useState(facility?.bookable ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Enter a facility name.');
      return;
    }
    if (!description.trim()) {
      setFormError('Enter a short description.');
      return;
    }
    if (!estateId) {
      setFormError('Choose the estate that owns this facility.');
      return;
    }
    let usageFeeKobo = 0;
    if (feeText.trim()) {
      try {
        usageFeeKobo = parseNaira(feeText);
      } catch {
        setFormError('Enter a valid naira amount, or 0 for a free facility.');
        return;
      }
    }
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      estateId,
      usageFeeKobo,
      bookable,
    });
  }

  return (
    <Modal open onClose={onClose} title={facility ? 'Edit facility' : 'New facility'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            className={inputClass}
            disabled={submitting}
            autoFocus
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={3}
            className={inputClass}
            disabled={submitting}
          />
        </Field>
        <Field label="Estate" hint="A facility belongs to exactly one estate.">
          <select
            value={estateId}
            onChange={(event) => setEstateId(event.target.value)}
            className={inputClass}
            disabled={estatesLoading || submitting}
          >
            <option value="">{estatesLoading ? 'Loading estates…' : 'Choose an estate'}</option>
            {estates.map((estate) => (
              <option key={estate.id} value={estate.id}>
                {estate.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Usage fee (₦)" hint="Flat per booking. Leave blank or 0 for free.">
            <input
              value={feeText}
              onChange={(event) => setFeeText(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={inputClass}
              disabled={submitting}
            />
          </Field>
          <Field label="Availability">
            <span className="flex h-10 items-center gap-2 text-sm text-(--color-ink)">
              <input
                type="checkbox"
                checked={bookable}
                onChange={(event) => setBookable(event.target.checked)}
                disabled={submitting}
                className="h-4 w-4 rounded border-slate-300"
              />
              Bookable now
            </span>
          </Field>
        </div>
        {!bookable && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert aria-hidden size={14} className="mt-0.5 shrink-0" />
            Suspended facilities stay visible to residents but cannot accept new requests.
          </p>
        )}

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
            {submitting ? 'Saving…' : facility ? 'Save changes' : 'Create facility'}
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { dateStyle: 'medium' });
}
