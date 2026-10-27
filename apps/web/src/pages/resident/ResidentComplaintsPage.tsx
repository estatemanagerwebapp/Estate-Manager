import { useCallback, useEffect, useState } from 'react';
import { MessageSquareWarning, Plus, Send, User } from 'lucide-react';
import type { ResidentComplaintDto, ComplaintStatus } from '@silverstone/shared';
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

const CATEGORY_OPTIONS = [
  'Facilities',
  'Security',
  'Noise',
  'Maintenance',
  'Billing',
  'Neighbourhood',
  'Other',
] as const;

const DEFAULT_CATEGORY: string = CATEGORY_OPTIONS[0];

const STATUS_FILTERS: Array<{ value: ComplaintStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

/**
 * Resident complaints page (S5).
 *
 * Lists the resident's complaints with the estate-office reply thread and
 * lets them file a new complaint. Everything is self-scoped on the API.
 */
export function ResidentComplaintsPage() {
  const toast = useToast();
  const [complaints, setComplaints] = useState<ResidentComplaintDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ComplaintStatus | 'ALL'>('ALL');

  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.getResidentComplaints(filter === 'ALL' ? undefined : filter);
      setComplaints(data.complaints);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your complaints.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.createResidentComplaint({ category, subject, description });
      toast.success('Complaint filed.');
      setCategory(DEFAULT_CATEGORY);
      setSubject('');
      setDescription('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not file the complaint.');
      toast.error('Could not file the complaint.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === option.value
                ? 'border-(--color-primary) bg-(--color-primary) text-white'
                : 'border-slate-200 text-(--color-ink-muted) hover:border-slate-300'
            }`}
          >
            {option.label}
          </button>
        ))}
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowForm((open) => !open)}>
            <Plus aria-hidden size={13} className="mr-1" />
            New complaint
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Send aria-hidden size={15} className="text-(--color-primary)" />
                File a complaint
              </span>
            }
            subtitle="The estate office will respond in the thread below."
          />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Category">
                <select
                  className={inputClass}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subject">
                <input
                  className={inputClass}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={160}
                  placeholder="Short summary"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Description">
                <textarea
                  className={`${inputClass} min-h-28`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={4000}
                  placeholder="What happened? Include dates, locations and anything that helps us act on it."
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowForm(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void submit()}
                disabled={submitting || !subject.trim() || !description.trim()}
              >
                {submitting ? 'Filing…' : 'File complaint'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Your complaints"
          subtitle="Open complaints first, with estate office responses."
        />
        <CardBody>
          {complaints.length === 0 ? (
            <EmptyState
              title="No complaints"
              body={
                filter === 'ALL'
                  ? 'You have not filed any complaints.'
                  : `You have no ${filter.toLowerCase().replace('_', ' ')} complaints.`
              }
            />
          ) : (
            <ul className="space-y-3">
              {complaints.map((complaint) => (
                <ComplaintCard key={complaint.id} complaint={complaint} />
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
      <MessageSquareWarning aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Complaints</h1>
    </div>
  );
}

function ComplaintCard({ complaint }: { complaint: ResidentComplaintDto }) {
  return (
    <li className="rounded-md border border-slate-200/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-(--color-ink)">{complaint.subject}</p>
          <p className="mt-0.5 text-xs text-(--color-ink-muted)">
            {complaint.category} · filed {formatDate(complaint.createdAt)}
          </p>
        </div>
        <Badge tone={statusTone(complaint.status)}>{complaint.status}</Badge>
      </div>

      <p className="mt-3 whitespace-pre-line text-sm text-(--color-ink)">{complaint.description}</p>

      {complaint.replies.length > 0 && (
        <ul className="mt-4 space-y-2 border-l-2 border-slate-100 pl-3">
          {complaint.replies.map((reply) => (
            <li key={reply.id}>
              <div className="flex items-center gap-2">
                <User aria-hidden size={12} className="text-(--color-ink-muted)" />
                <span className="text-xs font-medium text-(--color-ink-muted)">
                  Estate office · {formatDate(reply.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{reply.body}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function statusTone(status: ComplaintStatus) {
  if (status === 'OPEN') return 'warning' as const;
  if (status === 'IN_PROGRESS') return 'neutral' as const;
  if (status === 'RESOLVED') return 'success' as const;
  return 'neutral' as const;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
