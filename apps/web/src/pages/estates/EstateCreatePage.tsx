import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError } from '../../api/client';
import { useToast } from '../../toast/Toast';
import { Button, Card, CardHeader, CardBody, Field, inputClass } from '../../components/ui';

/**
 * Create-estate form. Fields mirror `CreateEstateInput`: `name` (required,
 * ≤160), optional `slug` (server derives one from the name when blank),
 * optional `address` (≤500). Slug format rules (lowercase/digits/underscore,
 * leading letter, ≤64) are enforced by the API; the client only mirrors the
 * length cap for fast feedback.
 */
export function EstateCreatePage() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createEstate({
        name: name.trim(),
        slug: slug.trim() || undefined,
        address: address.trim() || undefined,
      });
      toast.success('Estate created.');
      // The list and picker are cached; mark them stale so the screen we are
      // about to open re-reads once and shows the new estate.
      void queryClient.invalidateQueries({ queryKey: ['estates'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
      navigate('/app/estates');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'CONFLICT') {
          setError(`An estate with that slug already exists. ${err.message}`);
        } else if (err.details && err.details.length > 0) {
          setError(err.details.map((detail) => detail.message).join(' '));
        } else {
          setError(err.message);
        }
      } else {
        setError('Could not create the estate.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Link
        to="/app/estates"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
      >
        <ArrowLeft aria-hidden size={14} />
        Back to estates
      </Link>

      <Card aria-label="Create estate" className="max-w-xl">
        <CardHeader
          title="New estate"
          subtitle="Slugs are the source of the property identifier; leave blank to auto-derive from the name."
        />
        <CardBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {error && (
              <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}
            <Field label="Name" hint="Required, up to 160 characters.">
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                required
                autoFocus
              />
            </Field>
            <Field label="Slug" hint="Optional. Lowercase letters, digits and underscores.">
              <input
                className={inputClass}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                maxLength={64}
                pattern="^[a-z][a-z0-9_]{0,63}$"
                placeholder="auto-derived from name"
              />
            </Field>
            <Field label="Address" hint="Optional free-text location, up to 500 characters.">
              <textarea
                className={inputClass}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={500}
                rows={2}
              />
            </Field>
            <div className="flex items-center justify-end gap-2">
              <Link to="/app/estates">
                <Button variant="secondary">Cancel</Button>
              </Link>
              <Button type="submit" disabled={submitting || name.trim().length === 0}>
                {submitting ? 'Creating…' : 'Create estate'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
