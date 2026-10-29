import { useMemo, useState, type FormEvent } from 'react';
import {
  Building2,
  Inbox,
  Lock,
  Mail,
  RefreshCw,
  Search,
  Send,
  Unlock,
  UserRound,
} from 'lucide-react';
import type { MessageThreadStatus, OperatorMessageThreadDto } from '@silverstone/shared';
import { api, ApiRequestError, type OperatorMessageFilter } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { useCan } from '../auth/useCan';
import { useToast } from '../toast/Toast';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Skeleton,
  inputClass,
  selectClass,
} from '../components/ui';
import { FilterBar, OperatorPageHeader, StatusBadge } from '../components/operator';

export type MessageView = 'OPEN' | 'CLOSED' | 'ALL';

const VIEW_OPTIONS: ReadonlyArray<{ value: MessageView; label: string }> = [
  { value: 'OPEN', label: 'Open conversations' },
  { value: 'ALL', label: 'All conversations' },
  { value: 'CLOSED', label: 'Closed conversations' },
];

/** Build the API filter for a conversation view. */
export function messageFilterForView(view: MessageView): OperatorMessageFilter {
  if (view === 'ALL') return {};
  return { status: view };
}

export function messageStatusLabel(status: MessageThreadStatus): string {
  return status === 'OPEN' ? 'Open' : 'Closed';
}

export function threadResidentLabel(thread: OperatorMessageThreadDto): string {
  return thread.resident?.fullName ?? thread.resident?.email ?? 'Resident account unavailable';
}

export function threadPropertyLabel(thread: OperatorMessageThreadDto): string {
  if (!thread.property) return 'No property assigned';
  const property = [thread.property.identifier, thread.property.name].filter(Boolean).join(' · ');
  return `${property} · ${thread.property.estate.name}`;
}

export function threadMatchesSearch(thread: OperatorMessageThreadDto, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const messageText = thread.messages
    .map(
      (message) =>
        `${message.body} ${message.author?.fullName ?? ''} ${message.author?.email ?? ''}`,
    )
    .join(' ');
  return [
    thread.subject,
    threadResidentLabel(thread),
    thread.resident?.email ?? '',
    thread.resident?.phone ?? '',
    threadPropertyLabel(thread),
    messageText,
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

/**
 * Operator message inbox.
 *
 * Staff see every organization-scoped resident conversation. Selecting a
 * conversation marks the shared estate-office read position; replies are
 * posted as the estate office with the acting staff account as author.
 * Closing and reopening are explicit staff actions. `message.read` lets
 * auditors read the inbox, while only `message.manage` renders actions.
 */
export function MessagesPage() {
  const can = useCan();
  const toast = useToast();
  const [view, setView] = useState<MessageView>('OPEN');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filter = useMemo(() => messageFilterForView(view), [view]);
  const messagesKey = queryKeys.messages.list(filter);
  const {
    data,
    loading,
    fetching,
    error: queryError,
    errorObject,
    refresh,
  } = useApiQuery(
    messagesKey,
    () => api.listOperatorMessages(filter),
    'Could not load conversations.',
  );

  const threads = data?.threads ?? [];
  const visibleThreads = search.trim()
    ? threads.filter((thread) => threadMatchesSearch(thread, search))
    : threads;
  const selected = visibleThreads.find((thread) => thread.id === selectedId) ?? null;
  const canManage = can['message.manage'];
  const queryErrorText =
    errorObject instanceof ApiRequestError && errorObject.code === 'FORBIDDEN'
      ? 'You no longer have permission to view conversations.'
      : queryError;

  async function selectThread(thread: OperatorMessageThreadDto) {
    setSelectedId(thread.id);
    setReply('');
    setActionError(null);

    if (!canManage || thread.unreadCount === 0) return;
    try {
      await api.markOperatorMessageRead(thread.id);
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : 'Could not mark the conversation read.',
      );
    }
  }

  async function sendReply(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!selected) return;
    const body = reply.trim();
    if (!body) return;

    setSending(true);
    setActionError(null);
    try {
      await api.replyOperatorMessage(selected.id, { body });
      setReply('');
      toast.success(`Replied to ${threadResidentLabel(selected)}.`);
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : 'Could not send the reply.',
      );
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(next: MessageThreadStatus) {
    if (!selected) return;
    setUpdating(true);
    setActionError(null);
    try {
      if (next === 'CLOSED') {
        await api.closeOperatorMessage(selected.id);
        toast.success('Conversation closed.');
      } else {
        await api.reopenOperatorMessage(selected.id);
        toast.success('Conversation reopened.');
      }
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : 'Could not update the conversation.',
      );
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div>
      <OperatorPageHeader
        icon={<Inbox aria-hidden size={20} className="text-(--color-primary)" />}
        title="Messages"
        description="Resident conversations with the estate office."
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
            {visibleThreads.length} conversation{visibleThreads.length === 1 ? '' : 's'}
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
            placeholder="Search resident, property or message"
            aria-label="Search conversations"
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={view}
          onChange={(event) => setView(event.target.value as MessageView)}
          aria-label="Filter conversations"
          className={selectClass}
        >
          {VIEW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterBar>

      {actionError && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {actionError}
        </p>
      )}

      {queryErrorText ? (
        <div className="mt-4">
          <ErrorBanner message={queryErrorText} onRetry={() => void refresh()} />
        </div>
      ) : loading ? (
        <div
          className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]"
          aria-busy="true"
        >
          <Skeleton className="h-96 w-full rounded-(--radius-card)" />
          <Skeleton className="h-96 w-full rounded-(--radius-card)" />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <section
            aria-label="Conversations"
            className="overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)"
          >
            {visibleThreads.length === 0 ? (
              <EmptyState
                title={
                  search.trim()
                    ? 'No conversations match your search'
                    : 'No conversations in this view'
                }
                body={
                  search.trim()
                    ? 'Clear the search or switch to another conversation view.'
                    : 'New resident messages appear here when they are sent.'
                }
              />
            ) : (
              <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                {visibleThreads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => void selectThread(thread)}
                      aria-pressed={thread.id === selected?.id}
                      className={`w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary) ${
                        thread.id === selected?.id
                          ? 'bg-(--color-primary-soft)/60'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-(--color-ink)">
                            {thread.subject}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-(--color-ink-muted)">
                            <UserRound aria-hidden size={12} className="shrink-0" />
                            {threadResidentLabel(thread)}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-(--color-ink-muted)">
                            <Building2 aria-hidden size={11} className="shrink-0" />
                            {threadPropertyLabel(thread)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge
                            status={thread.status}
                            label={messageStatusLabel(thread.status)}
                            tone={thread.status === 'OPEN' ? 'success' : 'neutral'}
                          />
                          {thread.unreadCount > 0 && (
                            <Badge tone="info">{thread.unreadCount} new</Badge>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-(--color-ink-muted)">
                        Updated {formatDateTime(thread.updatedAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-label="Conversation"
            className="flex min-h-[420px] flex-col rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)"
          >
            {!selected ? (
              <EmptyState
                title="Select a conversation"
                body="Choose a conversation on the left to read it and reply."
              />
            ) : (
              <>
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-(--color-ink)">
                        {selected.subject}
                      </h2>
                      <StatusBadge
                        status={selected.status}
                        label={messageStatusLabel(selected.status)}
                        tone={selected.status === 'OPEN' ? 'success' : 'neutral'}
                      />
                    </div>
                    <p className="mt-1 text-xs text-(--color-ink-muted)">
                      {threadResidentLabel(selected)} · {threadPropertyLabel(selected)}
                    </p>
                    {selected.resident && (
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-(--color-ink-muted)">
                        <a
                          href={`mailto:${selected.resident.email}`}
                          className="inline-flex items-center gap-1 hover:text-(--color-primary)"
                        >
                          <Mail aria-hidden size={12} />
                          {selected.resident.email}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!canManage && (
                      <span className="text-[11px] text-(--color-ink-muted)">Read-only</span>
                    )}
                    {canManage && selected.status === 'OPEN' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void changeStatus('CLOSED')}
                        disabled={updating}
                      >
                        <Lock aria-hidden size={14} />
                        {updating ? 'Closing…' : 'Close'}
                      </Button>
                    )}
                    {canManage && selected.status === 'CLOSED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void changeStatus('OPEN')}
                        disabled={updating}
                      >
                        <Unlock aria-hidden size={14} />
                        {updating ? 'Reopening…' : 'Reopen'}
                      </Button>
                    )}
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <ul className="space-y-3" aria-label="Message history">
                    {selected.messages.map((message) => {
                      const fromOffice = message.senderRole === 'ESTATE_OFFICE';
                      return (
                        <li
                          key={message.id}
                          className={`flex ${fromOffice ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 ${
                              fromOffice
                                ? 'bg-sky-50 text-(--color-ink)'
                                : 'bg-slate-100 text-(--color-ink)'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-(--color-ink-muted)">
                              <span className="font-medium">
                                {messageAuthorLabel(message.author, message.senderRole)}
                              </span>
                              <time dateTime={message.createdAt}>
                                {formatDateTime(message.createdAt)}
                              </time>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {selected.status === 'OPEN' && canManage ? (
                  <form
                    onSubmit={(event) => void sendReply(event)}
                    className="shrink-0 border-t border-slate-200/80 px-5 py-4"
                  >
                    <Field label="Reply as estate office">
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
                ) : (
                  <p className="shrink-0 border-t border-slate-200/80 px-5 py-4 text-xs text-(--color-ink-muted)">
                    {selected.status === 'CLOSED'
                      ? 'This conversation is closed. Reopen it to reply.'
                      : 'You can read this conversation but cannot reply.'}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function messageAuthorLabel(
  author: OperatorMessageThreadDto['messages'][number]['author'],
  senderRole: 'RESIDENT' | 'ESTATE_OFFICE',
): string {
  if (author?.fullName) return author.fullName;
  if (author?.email) return author.email;
  return senderRole === 'ESTATE_OFFICE' ? 'Estate office' : 'Resident';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
