import { useCallback, useEffect, useState } from 'react';
import { Mail, Plus, Send, User, Building2 } from 'lucide-react';
import type { ResidentMessageThreadDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
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

/**
 * Resident messages page (S6).
 *
 * Two panes: the resident's conversation threads on the left, the selected
 * thread (with its full message history and a reply box) on the right. A
 * new thread can be started with a subject and a first message.
 */
export function ResidentMessagesPage() {
  const toast = useToast();
  const [threads, setThreads] = useState<ResidentMessageThreadDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getResidentMessages();
      setThreads(data.threads);
      setSelectedId((current) => {
        if (current && data.threads.some((thread) => thread.id === current)) {
          return current;
        }
        return data.threads[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = threads.find((thread) => thread.id === selectedId) ?? null;

  async function sendNewThread() {
    setSending(true);
    setError(null);
    try {
      const response = await api.sendResidentMessage({ subject, body: reply });
      toast.success('Conversation started.');
      setSubject('');
      setReply('');
      setComposing(false);
      setSelectedId(response.thread.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not send your message.');
      toast.error('Could not send your message.');
    } finally {
      setSending(false);
    }
  }

  async function sendReply() {
    if (!selected) return;
    setSending(true);
    setError(null);
    try {
      await api.sendResidentMessage({ threadId: selected.id, body: reply });
      toast.success('Reply sent.');
      setReply('');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not send your reply.');
      toast.error('Could not send your reply.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            setComposing((open) => !open);
            setReply('');
          }}
        >
          <Plus aria-hidden size={13} className="mr-1" />
          New conversation
        </Button>
      </div>

      {composing && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Send aria-hidden size={15} className="text-(--color-primary)" />
                Start a conversation
              </span>
            }
            subtitle="The estate office will reply in this thread."
          />
          <CardBody>
            <Field label="Subject">
              <input
                className={inputClass}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={160}
                placeholder="What is this about?"
              />
            </Field>
            <div className="mt-4">
              <Field label="Message">
                <textarea
                  className={`${inputClass} min-h-24`}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={4000}
                  placeholder="Write your message…"
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setComposing(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void sendNewThread()}
                disabled={sending || !subject.trim() || !reply.trim()}
              >
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {threads.length === 0 ? (
        <Card>
          <CardHeader
            title="Your conversations"
            subtitle="Messages exchanged with the estate office."
          />
          <CardBody>
            <EmptyState
              title="No conversations yet"
              body="Start a conversation above to reach the estate office."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          {/* Thread list */}
          <Card>
            <CardHeader title="Conversations" />
            <CardBody>
              <ul className="space-y-1">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(thread.id)}
                      aria-current={thread.id === selectedId ? 'true' : undefined}
                      className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                        thread.id === selectedId ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-(--color-ink)">
                          {thread.subject}
                        </span>
                        {thread.status === 'CLOSED' && <Badge tone="neutral">CLOSED</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-(--color-ink-muted)">
                        {thread.messages.length} message
                        {thread.messages.length === 1 ? '' : 's'} · {formatDate(thread.updatedAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {/* Read pane */}
          {selected ? (
            <Card>
              <CardHeader
                title={selected.subject}
                subtitle={`Started ${formatDate(selected.createdAt)}`}
              />
              <CardBody>
                <ul className="space-y-3">
                  {selected.messages.map((message) => (
                    <li
                      key={message.id}
                      className={
                        message.senderRole === 'RESIDENT'
                          ? 'ml-auto max-w-[85%] rounded-md bg-slate-100 px-3 py-2'
                          : 'mr-auto max-w-[85%] rounded-md border border-slate-200/80 px-3 py-2'
                      }
                    >
                      <div className="flex items-center gap-1.5 text-xs text-(--color-ink-muted)">
                        {message.senderRole === 'RESIDENT' ? (
                          <User aria-hidden size={11} />
                        ) : (
                          <Building2 aria-hidden size={11} />
                        )}
                        <span>{message.senderRole === 'RESIDENT' ? 'You' : 'Estate office'}</span>
                        <span>· {formatDate(message.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-(--color-ink)">
                        {message.body}
                      </p>
                    </li>
                  ))}
                </ul>

                {selected.status === 'CLOSED' ? (
                  <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-(--color-ink-muted)">
                    This conversation is closed.
                  </p>
                ) : (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <Field label="Reply">
                      <textarea
                        className={`${inputClass} min-h-20`}
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        maxLength={4000}
                        placeholder="Write a reply…"
                      />
                    </Field>
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => void sendReply()}
                        disabled={sending || !reply.trim()}
                      >
                        <Send aria-hidden size={13} className="mr-1" />
                        {sending ? 'Sending…' : 'Send reply'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  title="Select a conversation"
                  body="Pick a thread on the left to read it."
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <Mail aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Messages</h1>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
