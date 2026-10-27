import { useCallback, useEffect, useState } from 'react';
import { Siren, PhoneCall, ShieldCheck } from 'lucide-react';
import type { SosEventDto } from '@silverstone/shared';
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
 * Resident emergency / SOS page (S9).
 *
 * The trigger is deliberately immediate — one press raises the alert, no
 * confirmation dialog in between — with an optional note for the estate
 * office. The resident's own alert history sits underneath.
 */
export function ResidentSosPage() {
  const toast = useToast();
  const [events, setEvents] = useState<SosEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [raising, setRaising] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getResidentSosEvents();
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your SOS history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function raise() {
    setRaising(true);
    setError(null);
    try {
      await api.createResidentSos({ note: note.trim() || undefined });
      toast.success('SOS alert raised. The estate office has been notified.');
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not raise the SOS alert.');
      toast.error('Could not raise the SOS alert.');
    } finally {
      setRaising(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Siren aria-hidden size={15} className="text-red-600" />
              Emergency assistance
            </span>
          }
          subtitle="Raises an immediate alert with the estate office."
        />
        <CardBody>
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-(--color-ink)">
              Use this only for a genuine emergency. If you are in immediate danger, call the
              emergency services first.
            </p>
          </div>

          <div className="mt-4">
            <Field label="Note (optional)">
              <textarea
                className={`${inputClass} min-h-20`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                placeholder="What is happening?"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Button
              onClick={() => void raise()}
              disabled={raising}
              className="w-full justify-center bg-red-600 hover:bg-red-700 focus-visible:outline-red-600"
            >
              <PhoneCall aria-hidden size={15} className="mr-1" />
              {raising ? 'Raising alert…' : 'Raise SOS alert'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your alerts" subtitle="Every SOS you have raised." />
        <CardBody>
          {events.length === 0 ? (
            <EmptyState
              title="No alerts raised"
              body="Your emergency alerts will be listed here."
            />
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="rounded-md border border-slate-200/80 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck aria-hidden size={14} className="text-(--color-ink-muted)" />
                      <span className="text-sm font-semibold text-(--color-ink)">
                        {formatDate(event.raisedAt)}
                      </span>
                    </div>
                    <Badge tone={statusTone(event.status)}>{event.status}</Badge>
                  </div>
                  {event.note && (
                    <p className="mt-1 whitespace-pre-line text-xs text-(--color-ink-muted)">
                      {event.note}
                    </p>
                  )}
                  {event.acknowledgedAt && (
                    <p className="mt-1 text-xs text-(--color-ink-muted)">
                      Acknowledged {formatDate(event.acknowledgedAt)}
                      {event.resolvedAt ? ` · resolved ${formatDate(event.resolvedAt)}` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <Siren aria-hidden size={20} className="text-red-600" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Emergency / SOS</h1>
    </div>
  );
}

function statusTone(status: SosEventDto['status']) {
  if (status === 'RESOLVED') return 'success' as const;
  if (status === 'ACKNOWLEDGED') return 'warning' as const;
  return 'danger' as const;
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
