import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MessageSquareWarning, RefreshCw, Search, Send } from 'lucide-react';
import type { ComplaintStatus, OperatorComplaintDto } from '@silverstone/shared';
import { api, ApiRequestError, type OperatorComplaintFilter } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { useCan } from '../auth/useCan';
import { useToast } from '../toast/Toast';
import { Button, Field, inputClass, selectClass } from '../components/ui';
import {
  DataTable,
  DetailDrawer,
  FilterBar,
  OperatorPageHeader,
  StatusBadge,
} from '../components/operator';
import type { BadgeTone } from '../components/ui';

export type ComplaintView = 'ALL' | ComplaintStatus;

const VIEW_OPTIONS: ReadonlyArray<{ value: ComplaintView; label: string }> = [
  { value: 'ALL', label: 'All complaints' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: ComplaintStatus; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

/** Build the API filter for a complaint view. */
export function complaintFilterForView(view: ComplaintView): OperatorComplaintFilter {
  if (view === 'ALL') return {};
  return { status: view };
}

export function complaintStatusLabel(status: ComplaintStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'RESOLVED':
      return 'Resolved';
    case 'CLOSED':
      return 'Closed';
  }
}

export function complaintTone(status: ComplaintStatus): BadgeTone {
  switch (status) {
    case 'OPEN':
      return 'warning';
    case 'IN_PROGRESS':
      return 'info';
    case 'RESOLVED':
      return 'success';
    case 'CLOSED':
      return 'neutral';
  }
}

export function complaintResidentLabel(complaint: OperatorComplaintDto): string {
  return (
    complaint.resident?.fullName ?? complaint.resident?.email ?? 'Resident account unavailable'
  );
}

export function complaintPropertyLabel(complaint: OperatorComplaintDto): string {
  if (!complaint.property) return 'No property assigned';
  const property = [complaint.property.identifier, complaint.property.name]
    .filter(Boolean)
    .join(' · ');
  return `${property} · ${complaint.property.estate.name}`;
}

export function complaintMatchesSearch(complaint: OperatorComplaintDto, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const replyText = complaint.replies
    .map((reply) => `${reply.body} ${reply.author?.fullName ?? ''} ${reply.author?.email ?? ''}`)
    .join(' ');
  return [
    complaint.subject,
    complaint.category,
    complaint.description,
    complaintResidentLabel(complaint),
    complaint.resident?.email ?? '',
    complaint.resident?.phone ?? '',
    complaintPropertyLabel(complaint),
    replyText,
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

/**
 * Operator complaint queue.
 *
 * Staff see every organization-scoped resident complaint, reply into the
 * thread and move the status through the shared complaint vocabulary.
 * `complaint.read` lets auditors read the queue, while only
 * `complaint.manage` renders the reply and status controls.
 */
export function ComplaintsPage() {
  const can = useCan();
  const toast = useToast();
  const [view, setView] = useState<ComplaintView>('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [statusDraft, setStatusDraft] = useState<ComplaintStatus>('OPEN');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filter = useMemo(() => complaintFilterForView(view), [view]);
  const complaintsKey = queryKeys.complaints.list(filter);
  const {
    data,
    loading,
    fetching,
    error: queryError,
    errorObject,
    refresh,
  } = useApiQuery(
    complaintsKey,
    () => api.listOperatorComplaints(filter),
    'Could not load complaints.',
  );

  const complaints = data?.complaints ?? [];
  const visibleComplaints = search.trim()
    ? complaints.filter((complaint) => complaintMatchesSearch(complaint, search))
    : complaints;
  const selected = visibleComplaints.find((complaint) => complaint.id === selectedId) ?? null;
  const canManage = can['complaint.manage'];
  const queryErrorText =
    errorObject instanceof ApiRequestError && errorObject.code === 'FORBIDDEN'
      ? 'You no longer have permission to view complaints.'
      : queryError;

  const selectedIdForEffect = selected?.id;
  const selectedStatus = selected?.status;
  useEffect(() => {
    if (!selectedIdForEffect) return;
    setStatusDraft(selectedStatus ?? 'OPEN');
    setReply('');
    setActionError(null);
  }, [selectedIdForEffect, selectedStatus]);

  function openComplaint(complaint: OperatorComplaintDto) {
    setSelectedId(complaint.id);
  }

  async function sendReply(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!selected) return;
    const body = reply.trim();
    if (!body) return;

    setSending(true);
    setActionError(null);
    try {
      await api.replyOperatorComplaint(selected.id, { body });
      setReply('');
      toast.success(`Replied to ${complaintResidentLabel(selected)}.`);
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : 'Could not send the reply.',
      );
    } finally {
      setSending(false);
    }
  }

  async function updateStatus() {
    if (!selected || statusDraft === selected.status) return;
    setUpdating(true);
    setActionError(null);
    try {
      await api.setOperatorComplaintStatus(selected.id, { status: statusDraft });
      toast.success(`Complaint marked ${complaintStatusLabel(statusDraft).toLowerCase()}.`);
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : 'Could not update the complaint.',
      );
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div>
      <OperatorPageHeader
        icon={<MessageSquareWarning aria-hidden size={20} className="text-(--color-primary)" />}
        title="Complaints"
        description="Resident complaints, replies and resolution status."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={fetching}>
            <RefreshCw aria-hidden size={14} className={fetching ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        }
      />

      <FilterBar
        summary={
          <span role="status" aria-live="polite">
            {visibleComplaints.length} complaint{visibleComplaints.length === 1 ? '' : 's'}
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
            placeholder="Search resident, subject or reply"
            aria-label="Search complaints"
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={view}
          onChange={(event) => setView(event.target.value as ComplaintView)}
          aria-label="Filter complaints"
          className={selectClass}
        >
          {VIEW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={[
          {
            key: 'complaint',
            header: 'Complaint',
            cell: (complaint) => (
              <div className="min-w-0">
                <p className="font-medium text-(--color-ink)">{complaint.subject}</p>
                <p className="mt-0.5 text-xs text-(--color-ink-muted)">
                  {complaint.category.replaceAll('_', ' ')}
                </p>
              </div>
            ),
          },
          {
            key: 'resident',
            header: 'Resident',
            cell: (complaint) => (
              <div className="min-w-0">
                <p className="truncate text-xs text-(--color-ink)">
                  {complaintResidentLabel(complaint)}
                </p>
                <p className="truncate text-[11px] text-(--color-ink-muted)">
                  {complaint.resident?.email ?? 'No account'}
                </p>
              </div>
            ),
          },
          {
            key: 'property',
            header: 'Property',
            cell: (complaint) => (
              <span className="text-xs text-(--color-ink-muted)">
                {complaintPropertyLabel(complaint)}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (complaint) => (
              <StatusBadge
                status={complaint.status}
                label={complaintStatusLabel(complaint.status)}
                tone={complaintTone(complaint.status)}
              />
            ),
          },
          {
            key: 'updated',
            header: 'Updated',
            cell: (complaint) => (
              <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
                {formatDateTime(complaint.updatedAt)}
              </span>
            ),
          },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            cell: (complaint) => (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openComplaint(complaint)}
                aria-label={`Open complaint: ${complaint.subject}`}
              >
                Open
              </Button>
            ),
          },
        ]}
        rows={visibleComplaints}
        getRowKey={(complaint) => complaint.id}
        caption="Resident complaints"
        loading={loading}
        error={queryErrorText}
        onRetry={() => void refresh()}
        emptyTitle={
          search.trim() ? 'No complaints match your search' : 'No complaints in this view'
        }
        emptyBody={
          search.trim()
            ? 'Clear the search or switch to another complaint view.'
            : 'New resident complaints appear here when they are filed.'
        }
        footer={
          <span className="text-xs text-(--color-ink-muted)">{visibleComplaints.length} shown</span>
        }
      />

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected?.subject ?? 'Complaint'}
        subtitle={
          selected ? (
            <>
              {complaintResidentLabel(selected)} · {complaintPropertyLabel(selected)}
            </>
          ) : null
        }
      >
        {selected && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={selected.status}
                label={complaintStatusLabel(selected.status)}
                tone={complaintTone(selected.status)}
              />
              <span className="text-[11px] text-(--color-ink-muted)">
                Filed {formatDateTime(selected.createdAt)}
              </span>
            </div>

            <dl className="mt-3 grid gap-2 text-xs text-(--color-ink-muted)">
              <div>
                <dt className="font-medium uppercase tracking-wide">Category</dt>
                <dd className="text-(--color-ink)">{selected.category.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Resident</dt>
                <dd className="text-(--color-ink)">
                  {complaintResidentLabel(selected)}
                  {selected.resident?.email ? ` · ${selected.resident.email}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Property</dt>
                <dd className="text-(--color-ink)">{complaintPropertyLabel(selected)}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Resolved</dt>
                <dd className="text-(--color-ink)">
                  {selected.resolvedAt ? formatDateTime(selected.resolvedAt) : 'Not resolved'}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-md bg-slate-50 px-3 py-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)">
                Description
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-(--color-ink)">
                {selected.description}
              </p>
            </div>

            <section className="mt-4" aria-label="Complaint replies">
              <h3 className="text-sm font-semibold text-(--color-ink)">Replies</h3>
              {selected.replies.length === 0 ? (
                <p className="mt-1 text-xs text-(--color-ink-muted)">No replies yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selected.replies.map((item) => (
                    <li key={item.id} className="rounded-md border border-slate-200 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-(--color-ink-muted)">
                        <span className="font-medium">{replyAuthorLabel(item.author)}</span>
                        <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-(--color-ink)">
                        {item.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {actionError && (
              <p
                role="alert"
                className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"
              >
                {actionError}
              </p>
            )}

            {canManage ? (
              <>
                <div className="mt-5 rounded-md border border-slate-200 p-3">
                  <Field label="Update status">
                    <div className="flex items-center gap-2">
                      <select
                        value={statusDraft}
                        onChange={(event) => setStatusDraft(event.target.value as ComplaintStatus)}
                        className={selectClass}
                        disabled={updating}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => void updateStatus()}
                        disabled={updating || statusDraft === selected.status}
                      >
                        {updating ? 'Updating…' : 'Apply'}
                      </Button>
                    </div>
                  </Field>
                </div>

                {selected.status === 'CLOSED' ? (
                  <p className="mt-4 text-xs text-(--color-ink-muted)">
                    This complaint is closed. Change its status to reopen it.
                  </p>
                ) : (
                  <form onSubmit={(event) => void sendReply(event)} className="mt-4">
                    <Field label="Reply to the resident">
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        maxLength={4000}
                        rows={3}
                        placeholder="Write a reply to the resident…"
                        className={`${inputClass} min-h-20 resize-y`}
                      />
                    </Field>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-(--color-ink-muted)">
                        {reply.length}/4000
                      </span>
                      <Button type="submit" size="sm" disabled={sending || !reply.trim()}>
                        <Send aria-hidden size={14} />
                        {sending ? 'Sending…' : 'Send reply'}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <p className="mt-4 text-xs text-(--color-ink-muted)">
                You can read this complaint but cannot reply or change its status.
              </p>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

function replyAuthorLabel(author: OperatorComplaintDto['replies'][number]['author']): string {
  if (author?.fullName) return author.fullName;
  if (author?.email) return author.email;
  return 'Estate office';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
