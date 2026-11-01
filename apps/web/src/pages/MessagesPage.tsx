import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  Phone,
  Search,
  Send,
  Unlock,
  UserRound,
} from 'lucide-react';
import type {
  MessageThreadStatus,
  OperatorComposeMessageInput,
  OperatorComposeMessageResponse,
  OperatorMessageThreadDto,
} from '@silverstone/shared';
import { api, ApiRequestError, type OperatorMessageFilter } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { invalidateNavigationCounts } from '../api/navigation';
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
import { FilterBar, StatusBadge } from '../components/operator';
import { formatDateTime } from '../lib/format';
import { Modal } from '../components/dialog';

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
  const queryClient = useQueryClient();
  const [view, setView] = useState<MessageView>('OPEN');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const filter = useMemo(() => messageFilterForView(view), [view]);
  const messagesKey = queryKeys.messages.list(filter);
  const {
    data,
    loading,
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
      await Promise.all([refresh(), invalidateNavigationCounts(queryClient)]);
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
      await Promise.all([refresh(), invalidateNavigationCounts(queryClient)]);
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : 'Could not update the conversation.',
      );
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="min-w-0">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-sm text-slate-500">
        <span>Front Desk</span>
        <ChevronRight aria-hidden size={14} />
        <span className="font-medium text-slate-800" aria-current="page">
          Messages
        </span>
      </nav>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Inbox aria-hidden size={25} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Messages</h1>
            <p className="mt-1 text-base leading-6 text-slate-600">
              Resident conversations with the estate office.
            </p>
          </div>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setComposeOpen(true)} className="min-h-11 self-start">
            <Plus aria-hidden size={16} />
            New message
          </Button>
        )}
      </header>

      <FilterBar
        summary={
          <span role="status" aria-live="polite">
            {visibleThreads.length} conversation{visibleThreads.length === 1 ? '' : 's'}
          </span>
        }
      >
        <div className="relative w-full sm:w-[420px] sm:flex-none">
          <Search
            aria-hidden
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-ink-muted)"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search resident, property or message…"
            aria-label="Search conversations"
            className="h-11 w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-base outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
            style={{ fontSize: '16px' }}
          />
        </div>
        <select
          value={view}
          onChange={(event) => setView(event.target.value as MessageView)}
          aria-label="Filter conversations"
          className={`${selectClass} min-h-11 w-full rounded-lg bg-white text-base sm:w-auto`}
          style={{ fontSize: '16px' }}
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
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(290px,0.38fr)_minmax(0,0.62fr)]"
          aria-busy="true"
        >
          <Skeleton className="h-[min(680px,70vh)] min-h-[420px] w-full rounded-xl" />
          <Skeleton className="hidden h-[min(680px,70vh)] min-h-[420px] w-full rounded-xl lg:block" />
        </div>
      ) : visibleThreads.length === 0 ? (
        <section className="mt-4 flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-white px-5 py-8 text-center shadow-[0_2px_10px_rgba(15,23,42,0.035)] sm:min-h-[260px]">
          <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 text-orange-600">
            <MessageCircle aria-hidden size={38} strokeWidth={1.7} />
          </span>
          <h2 className="text-base font-semibold text-slate-900">
            {search.trim() ? 'No conversations match your search' : 'No conversations yet'}
          </h2>
          <p className="mt-1 max-w-xl text-base leading-6 text-slate-600">
            {search.trim()
              ? 'Clear the search or switch to another conversation view.'
              : 'Messages from residents will appear here when they contact the estate office.'}
          </p>
        </section>
      ) : (
        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(290px,0.38fr)_minmax(0,0.62fr)]">
          <section
            aria-label="Conversations"
            className={`h-[min(680px,70vh)] min-h-[420px] min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.035)] ${selected ? 'hidden lg:block' : 'block'}`}
          >
            <ul className="h-full divide-y divide-slate-100 overflow-y-auto">
              {visibleThreads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => void selectThread(thread)}
                    aria-pressed={thread.id === selected?.id}
                    className={`w-full px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary) ${
                      thread.id === selected?.id ? 'bg-orange-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {thread.subject}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-600">
                          <UserRound aria-hidden size={14} className="shrink-0" />
                          {threadResidentLabel(thread)}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
                          <Building2 aria-hidden size={13} className="shrink-0" />
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
                    <p className="mt-2 text-xs text-slate-500">
                      Updated {formatDateTime(thread.updatedAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-label="Conversation"
            className={`h-[min(720px,75vh)] min-h-[430px] min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.035)] ${selected ? 'flex' : 'hidden lg:flex'}`}
          >
            {!selected ? (
              <EmptyState
                title="Select a conversation"
                body="Choose a conversation on the left to read it and reply."
              />
            ) : (
              <>
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">{selected.subject}</h2>
                      <StatusBadge
                        status={selected.status}
                        label={messageStatusLabel(selected.status)}
                        tone={selected.status === 'OPEN' ? 'success' : 'neutral'}
                      />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {threadResidentLabel(selected)} · {threadPropertyLabel(selected)}
                    </p>
                    {selected.resident && (
                      <div className="mt-2 flex flex-col items-start gap-1.5 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                        <a
                          href={`mailto:${selected.resident.email}`}
                          className="inline-flex items-center gap-1 hover:text-(--color-primary)"
                        >
                          <Mail aria-hidden size={15} />
                          {selected.resident.email}
                        </a>
                        {selected.resident.phone && (
                          <a
                            href={`tel:${selected.resident.phone}`}
                            className="inline-flex items-center gap-1 hover:text-(--color-primary)"
                          >
                            <Phone aria-hidden size={15} />
                            {selected.resident.phone}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedId(null)}
                      className="min-h-10 rounded-lg px-2 text-sm lg:hidden"
                    >
                      <ChevronLeft aria-hidden size={16} />
                      Conversations
                    </Button>
                    {!canManage && (
                      <span className="text-[11px] text-(--color-ink-muted)">Read-only</span>
                    )}
                    {canManage && selected.status === 'OPEN' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void changeStatus('CLOSED')}
                        disabled={updating}
                        className="min-h-10 rounded-lg text-sm"
                      >
                        <Lock aria-hidden size={15} />
                        {updating ? 'Closing…' : 'Close conversation'}
                      </Button>
                    )}
                    {canManage && selected.status === 'CLOSED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void changeStatus('OPEN')}
                        disabled={updating}
                        className="min-h-10 rounded-lg text-sm"
                      >
                        <Unlock aria-hidden size={15} />
                        {updating ? 'Reopening…' : 'Reopen conversation'}
                      </Button>
                    )}
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  <ul className="space-y-3" aria-label="Message history">
                    {selected.messages.map((message) => {
                      const fromOffice = message.senderRole === 'ESTATE_OFFICE';
                      return (
                        <li
                          key={message.id}
                          className={`flex ${fromOffice ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[92%] rounded-xl px-3 py-2.5 sm:max-w-[85%] ${
                              fromOffice
                                ? 'bg-sky-50 text-(--color-ink)'
                                : 'bg-slate-100 text-(--color-ink)'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2 text-xs text-(--color-ink-muted)">
                              <span className="font-medium">
                                {messageAuthorLabel(message.author, message.senderRole)}
                              </span>
                              <time dateTime={message.createdAt}>
                                {formatDateTime(message.createdAt)}
                              </time>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-5">
                              {message.body}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {selected.status === 'OPEN' && canManage ? (
                  <form
                    onSubmit={(event) => void sendReply(event)}
                    className="shrink-0 border-t border-slate-200/80 px-4 py-4 sm:px-5"
                  >
                    <Field label="Reply as estate office">
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        maxLength={4000}
                        rows={3}
                        placeholder="Write a reply to the resident…"
                        className={`${inputClass} min-h-20 resize-y text-base`}
                        style={{ fontSize: '16px' }}
                      />
                    </Field>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-(--color-ink-muted)">
                        {reply.length}/4000
                      </span>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={sending || !reply.trim()}
                        className="min-h-11 rounded-lg px-4 text-sm"
                      >
                        <Send aria-hidden size={16} />
                        {sending ? 'Sending…' : 'Send reply'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="shrink-0 border-t border-slate-200/80 px-4 py-4 text-sm text-(--color-ink-muted) sm:px-5">
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
      {composeOpen && (
        <ComposeMessageDialog
          onClose={() => setComposeOpen(false)}
          onSent={(result) => {
            setComposeOpen(false);
            setView('OPEN');
            setSelectedId(result.threadId ?? null);
            toast.success(
              result.recipientCount === 1
                ? 'Message sent to the resident.'
                : `Broadcast sent to ${result.recipientCount} residents.`,
            );
            void queryClient.invalidateQueries({ queryKey: ['messages'] });
            void invalidateNavigationCounts(queryClient);
          }}
        />
      )}
    </div>
  );
}

function ComposeMessageDialog({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (result: OperatorComposeMessageResponse) => void;
}) {
  const [mode, setMode] = useState<OperatorComposeMessageInput['mode']>('DIRECT');
  const [recipientUserId, setRecipientUserId] = useState('');
  const [estateId, setEstateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    data,
    loading,
    error: recipientError,
  } = useApiQuery(
    ['messages', 'recipients'],
    () => api.listOperatorMessageRecipients(),
    'Could not load message recipients.',
  );
  const recipients = data?.recipients ?? [];
  const estates = Array.from(
    new Map(recipients.map((recipient) => [recipient.estate.id, recipient.estate])).values(),
  );
  const targetCount =
    mode === 'DIRECT'
      ? Number(recipients.some((recipient) => recipient.id === recipientUserId))
      : recipients.filter((recipient) => recipient.estate.id === estateId).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const result = await api.composeOperatorMessage({
        mode,
        ...(mode === 'DIRECT' ? { recipientUserId } : { estateId }),
        subject: subject.trim(),
        body: body.trim(),
      });
      onSent(result);
    } catch (reason) {
      setError(reason instanceof ApiRequestError ? reason.message : 'Could not send the message.');
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Compose message"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="compose-message-form"
            disabled={
              sending ||
              loading ||
              Boolean(recipientError) ||
              !targetCount ||
              !subject.trim() ||
              !body.trim()
            }
          >
            <Send aria-hidden size={15} />
            {sending ? 'Sending…' : mode === 'DIRECT' ? 'Send message' : 'Send broadcast'}
          </Button>
        </>
      }
    >
      <form id="compose-message-form" onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {recipientError && <ErrorBanner message={recipientError} />}
        <Field label="Message type">
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as OperatorComposeMessageInput['mode']);
              setRecipientUserId('');
              setEstateId('');
            }}
            className={`${selectClass} min-h-11 w-full !text-base`}
            style={{ fontSize: '16px' }}
          >
            <option value="DIRECT">Direct message</option>
            <option value="BROADCAST">Broadcast to an estate</option>
          </select>
        </Field>
        <Field label="To">
          {mode === 'DIRECT' ? (
            <select
              value={recipientUserId}
              onChange={(event) => setRecipientUserId(event.target.value)}
              className={`${selectClass} min-h-11 w-full !text-base`}
              style={{ fontSize: '16px' }}
              disabled={loading}
              required
            >
              <option value="">{loading ? 'Loading residents…' : 'Select a resident…'}</option>
              {recipients.map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {recipient.fullName || recipient.email} · {recipient.propertyIdentifier} ·{' '}
                  {recipient.estate.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={estateId}
              onChange={(event) => setEstateId(event.target.value)}
              className={`${selectClass} min-h-11 w-full !text-base`}
              style={{ fontSize: '16px' }}
              disabled={loading}
              required
            >
              <option value="">{loading ? 'Loading estates…' : 'Select an estate…'}</option>
              {estates.map((estate) => (
                <option key={estate.id} value={estate.id}>
                  {estate.name} (
                  {recipients.filter((recipient) => recipient.estate.id === estate.id).length}{' '}
                  residents)
                </option>
              ))}
            </select>
          )}
          {mode === 'BROADCAST' && estateId && (
            <p className="mt-1 text-xs text-slate-500">
              This will create a message conversation for {targetCount} residents.
            </p>
          )}
        </Field>
        <Field label="Subject">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className={`${inputClass} !text-base`}
            style={{ fontSize: '16px' }}
            maxLength={160}
            required
          />
        </Field>
        <Field label="Body">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className={`${inputClass} min-h-32 resize-y !text-base`}
            style={{ fontSize: '16px' }}
            maxLength={4000}
            required
          />
          <p className="mt-1 text-right text-xs text-slate-500">{body.length}/4000</p>
        </Field>
      </form>
    </Modal>
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
