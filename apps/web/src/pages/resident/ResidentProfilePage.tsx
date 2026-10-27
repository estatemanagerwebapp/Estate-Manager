import { useEffect, useState } from 'react';
import { User, Building2, BadgeCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ResidentProfileUpdateInput, ResidentProfileView } from '@silverstone/shared';
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

/**
 * Resident profile page (S1).
 *
 * Self-scoped: the API resolves the acting user from the session. Read-only
 * fields (email, full name, assigned property, ID document) are shown;
 * editable fields (phone, next-of-kin block, ID type, property type) are
 * submitted via `PATCH /resident/profile` and audited on the server.
 */
export function ResidentProfilePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed synchronously on a cache hit so the form never paints empty.
  const cachedProfile = queryClient.getQueryData<ResidentProfileView>([
    'resident',
    'profile',
  ])?.profile;

  // Editable fields (initialized from the profile once it loads).
  const [phone, setPhone] = useState(cachedProfile?.phone ?? '');
  const [nextOfKinName, setNextOfKinName] = useState(cachedProfile?.nextOfKinName ?? '');
  const [nextOfKinPhone, setNextOfKinPhone] = useState(cachedProfile?.nextOfKinPhone ?? '');
  const [nextOfKinEmail, setNextOfKinEmail] = useState(cachedProfile?.nextOfKinEmail ?? '');
  const [idType, setIdType] = useState(cachedProfile?.idType ?? '');
  const [dirty, setDirty] = useState(false);

  const {
    data,
    loading,
    error: queryError,
    refresh,
  } = useApiQuery(
    ['resident', 'profile'],
    () => api.getResidentProfile(),
    'Could not load your profile.',
  );
  const profile = data?.profile ?? null;
  const error = actionError ?? queryError;

  // Seed the form from the cached profile. This also runs after a manual
  // refresh, which is the one case where overwriting unsaved edits is
  // expected.
  useEffect(() => {
    if (!profile) return;
    setPhone(profile.phone ?? '');
    setNextOfKinName(profile.nextOfKinName ?? '');
    setNextOfKinPhone(profile.nextOfKinPhone ?? '');
    setNextOfKinEmail(profile.nextOfKinEmail ?? '');
    setIdType(profile.idType ?? '');
    setDirty(false);
  }, [profile]);

  function resetForm() {
    if (!profile) return;
    setPhone(profile.phone ?? '');
    setNextOfKinName(profile.nextOfKinName ?? '');
    setNextOfKinPhone(profile.nextOfKinPhone ?? '');
    setNextOfKinEmail(profile.nextOfKinEmail ?? '');
    setIdType(profile.idType ?? '');
    setDirty(false);
  }

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setActionError(null);
    try {
      const input: ResidentProfileUpdateInput = {
        phone: phone.trim() || null,
        nextOfKinName: nextOfKinName.trim() || null,
        nextOfKinPhone: nextOfKinPhone.trim() || null,
        nextOfKinEmail: nextOfKinEmail.trim() || null,
        idType: idType.trim() || null,
      };
      const response = await api.updateResidentProfile(input);
      queryClient.setQueryData(['resident', 'profile'], { profile: response.profile });
      setDirty(false);
      toast.success('Profile updated.');
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not save your profile.');
      toast.error('Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-4">
      <PageHeading />

      {error && <ErrorBanner message={error} />}

      {/* Account + property (read-only) */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <BadgeCheck aria-hidden size={15} className="text-(--color-primary)" />
              Account &amp; property
            </span>
          }
          subtitle="These details are set by your estate manager and can't be edited here."
        />
        <CardBody>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Fact label="Full name">{profile.fullName ?? '—'}</Fact>
            <Fact label="Email">{profile.email}</Fact>
            <Fact label="Property">
              {profile.property ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Building2 aria-hidden size={13} className="text-(--color-ink-muted)" />
                  <span className="font-medium">{profile.property.identifier}</span>
                  <Badge tone="neutral">{profile.property.estate.name}</Badge>
                </span>
              ) : (
                <span className="text-(--color-ink-muted)">Not assigned</span>
              )}
            </Fact>
          </dl>
        </CardBody>
      </Card>

      {/* Editable contact + onboarding block */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <User aria-hidden size={15} className="text-(--color-primary)" />
              Contact &amp; next of kin
            </span>
          }
          subtitle="Editable; changes are saved to your profile and recorded for audit."
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <input
                className={inputClass}
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  markDirty();
                }}
                maxLength={40}
                placeholder="e.g. 080 1234 5678"
              />
            </Field>
            <Field label="ID type">
              <input
                className={inputClass}
                value={idType}
                onChange={(event) => {
                  setIdType(event.target.value);
                  markDirty();
                }}
                maxLength={32}
                placeholder="e.g. NATIONAL_ID"
              />
            </Field>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
              Next of kin
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={nextOfKinName}
                  onChange={(event) => {
                    setNextOfKinName(event.target.value);
                    markDirty();
                  }}
                  maxLength={160}
                  placeholder="Full name"
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inputClass}
                  value={nextOfKinPhone}
                  onChange={(event) => {
                    setNextOfKinPhone(event.target.value);
                    markDirty();
                  }}
                  maxLength={40}
                  placeholder="Contact number"
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  value={nextOfKinEmail}
                  onChange={(event) => {
                    setNextOfKinEmail(event.target.value);
                    markDirty();
                  }}
                  maxLength={255}
                  placeholder="email@address"
                />
              </Field>
            </div>
          </div>

          {profile.idDocumentUrl && (
            <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs">
              <span className="font-medium text-(--color-ink-muted)">ID document:</span>{' '}
              <a
                href={profile.idDocumentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-(--color-primary) hover:underline"
              >
                view
              </a>
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                resetForm();
                void refresh();
              }}
              disabled={saving}
            >
              Reset
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {!profile.property && (
        <Card>
          <CardBody>
            <EmptyState
              title="No property assigned"
              body="Your estate manager will assign a property shortly."
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <User aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Profile</h1>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-(--color-ink-muted)">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
