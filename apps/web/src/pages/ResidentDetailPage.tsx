import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  UserRound,
  Home,
  ReceiptText,
  Building2,
  CalendarDays,
  ScanLine,
  History,
  Mail,
  Phone,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import type { ResidentOnboardingDto } from '@silverstone/shared';
import { api } from '../api/client';
import { useApiQuery } from '../api/query';
import { useCan } from '../auth/useCan';
import { Badge, EmptyState, ErrorBanner, LoadingPanel } from '../components/ui';
import { BillingPage } from './BillingPage';
import { FacilitiesPage } from './FacilitiesPage';
import { BookingsPage } from './BookingsPage';
import { GatePage } from './GatePage';
import { ActivityPage } from './activity/ActivityPage';
import { GENDERS, MARITAL_STATUSES, RESIDENT_ID_TYPES } from '@silverstone/shared';

type ResidentSection =
  'profile' | 'property' | 'billing' | 'facilities' | 'bookings' | 'gate' | 'activity';
interface ResidentSectionItem {
  id: ResidentSection;
  label: string;
  icon: LucideIcon;
}

export function ResidentDetailPage() {
  const { residentId = '' } = useParams();
  const can = useCan();
  const [section, setSection] = useState<ResidentSection>('profile');
  const { data, loading, error, refresh } = useApiQuery(
    ['residents', 'detail', residentId],
    () => api.listResidents(),
    'Could not load the resident.',
  );
  const resident = useMemo(
    () => data?.residents.find((item) => item.id === residentId) ?? null,
    [data, residentId],
  );
  const propertyQuery = useApiQuery(
    ['resident-property', resident?.propertyId],
    () => api.getProperty(resident?.propertyId ?? ''),
    'Could not load the resident property.',
    Boolean(resident?.propertyId),
  );
  const estateId = propertyQuery.data?.property.estateId;

  const sections: ResidentSectionItem[] = [
    { id: 'profile', label: 'Profile', icon: UserRound },
    ...(can['property.read'] ? [{ id: 'property' as const, label: 'Property', icon: Home }] : []),
    ...(can['billing.read']
      ? [{ id: 'billing' as const, label: 'Billing', icon: ReceiptText }]
      : []),
    ...(can['facility.read']
      ? [{ id: 'facilities' as const, label: 'Facilities', icon: Building2 }]
      : []),
    ...(can['booking.read']
      ? [{ id: 'bookings' as const, label: 'Bookings', icon: CalendarDays }]
      : []),
    ...(can['gate.read'] || can['verification.read']
      ? [{ id: 'gate' as const, label: 'Gate access', icon: ScanLine }]
      : []),
    ...(can['audit.read'] ? [{ id: 'activity' as const, label: 'Activity', icon: History }] : []),
  ];
  const active = sections.find((item) => item.id === section) ?? sections[0]!;

  function renderSection(current: ResidentOnboardingDto) {
    switch (section) {
      case 'profile':
        return <ResidentProfile resident={current} />;
      case 'property':
        return <ResidentProperty resident={current} estateId={estateId} />;
      case 'billing':
        return estateId ? (
          <BillingPage key={estateId} fixedEstateId={estateId} />
        ) : (
          <LoadingPanel label="Loading estate context…" />
        );
      case 'facilities':
        return estateId ? (
          <FacilitiesPage key={estateId} fixedEstateId={estateId} />
        ) : (
          <LoadingPanel label="Loading estate context…" />
        );
      case 'bookings':
        return estateId ? (
          <BookingsPage key={estateId} fixedEstateId={estateId} />
        ) : (
          <LoadingPanel label="Loading estate context…" />
        );
      case 'gate':
        return estateId ? (
          <GatePage key={estateId} fixedEstateId={estateId} />
        ) : (
          <LoadingPanel label="Loading estate context…" />
        );
      case 'activity':
        return estateId ? (
          <ActivityPage key={estateId} fixedEstateId={estateId} />
        ) : (
          <LoadingPanel label="Loading estate context…" />
        );
    }
  }

  return (
    <div className="min-w-0">
      <Link
        to="/app/residents"
        className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
      >
        <ArrowLeft aria-hidden size={16} /> Back to residents
      </Link>
      {loading && !data ? (
        <LoadingPanel label="Loading resident…" />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      ) : !resident ? (
        <EmptyState
          title="Resident not found"
          body="This resident may have been removed or may not be available to your account."
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-(--shadow-card)">
          <header className="flex flex-col gap-4 border-b border-slate-200/80 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-semibold text-orange-700">
                {resident.firstName.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight text-(--color-ink) sm:text-2xl">
                    {resident.firstName}
                  </h1>
                  <Badge
                    tone={
                      resident.archivedAt
                        ? 'neutral'
                        : resident.status === 'COMPLETED'
                          ? 'success'
                          : 'warning'
                    }
                  >
                    {resident.archivedAt
                      ? 'Archived'
                      : resident.status === 'COMPLETED'
                        ? 'Account created'
                        : 'Onboarding in progress'}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm text-(--color-ink-muted)">
                  {resident.property.name || resident.property.estate.name} ·{' '}
                  {resident.property.estate.name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-(--color-ink-muted)">
              {resident.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail aria-hidden size={14} />
                  {resident.email}
                </span>
              )}
              {resident.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone aria-hidden size={14} />
                  {resident.phone}
                </span>
              )}
            </div>
          </header>

          <nav
            role="tablist"
            aria-label="Resident sections"
            aria-orientation="horizontal"
            className="flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200/80 px-3 py-2 sm:px-5"
          >
            {sections.map((item) => {
              const Icon = item.icon;
              const selected = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSection(item.id)}
                  className={`relative flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${selected ? 'bg-(--color-primary-soft) font-semibold text-(--color-primary) after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-(--color-primary)' : 'text-slate-600 hover:bg-slate-50 hover:text-(--color-ink)'}`}
                >
                  <Icon aria-hidden size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <main role="tabpanel" aria-label={active.label} className="min-w-0 p-4 sm:p-5 lg:p-6">
            {renderSection(resident)}
          </main>
        </section>
      )}
    </div>
  );
}

function ResidentProfile({ resident }: { resident: ResidentOnboardingDto }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoSection title="Contact details">
          <InfoItem label="Email" value={resident.email || 'Not provided'} />
          <InfoItem label="Phone" value={resident.phone || 'Not provided'} />
          <InfoItem label="Registered" value={new Date(resident.createdAt).toLocaleDateString()} />
        </InfoSection>
        <InfoSection title="Resident details">
          <InfoItem label="Gender" value={contractLabel(resident.gender, GENDERS)} />
          <InfoItem
            label="Marital status"
            value={contractLabel(resident.maritalStatus, MARITAL_STATUSES)}
          />
          <InfoItem label="Property type" value={resident.propertyType || 'Not provided'} />
        </InfoSection>
      </div>
      <InfoSection title="Next of kin">
        <div className="grid gap-4 sm:grid-cols-3">
          <InfoItem label="Name" value={resident.nextOfKinName || 'Not provided'} />
          <InfoItem label="Phone" value={resident.nextOfKinPhone || 'Not provided'} />
          <InfoItem label="Email" value={resident.nextOfKinEmail || 'Not provided'} />
        </div>
      </InfoSection>
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoSection title="Identity">
          <InfoItem label="ID type" value={contractLabel(resident.idType, RESIDENT_ID_TYPES)} />
          <InfoItem
            label="ID document"
            value={
              resident.idDocumentUrl ? (
                <a
                  href={resident.idDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-(--color-primary) underline underline-offset-2"
                >
                  <ExternalLink aria-hidden size={14} />
                  View document
                </a>
              ) : (
                'Not uploaded'
              )
            }
          />
        </InfoSection>
        <InfoSection title="Account & payment">
          <InfoItem label="Payment" value={resident.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'} />
          <InfoItem
            label="Account"
            value={
              resident.userId
                ? 'Portal account linked'
                : resident.status === 'COMPLETED'
                  ? 'Account deleted'
                  : 'Not created yet'
            }
          />
          <InfoItem label="Portal access" value={resident.accountStatus ?? 'No portal account'} />
        </InfoSection>
      </div>
    </div>
  );
}

function ResidentProperty({
  resident,
  estateId,
}: {
  resident: ResidentOnboardingDto;
  estateId?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
      <InfoSection title="Assigned property">
        <InfoItem
          label="Property name"
          value={resident.property.name || resident.property.estate.name}
        />
        <InfoItem label="Address / identifier" value={resident.property.identifier} />
        <InfoItem label="Estate" value={resident.property.estate.name} />
      </InfoSection>
      <section className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
        <h2 className="text-sm font-semibold text-(--color-ink)">Manage property</h2>
        <p className="mt-1 text-sm leading-5 text-(--color-ink-muted)">
          Open the assigned property record to review its details and make permitted updates.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-(--color-ink) hover:bg-slate-50"
            to={`/app/properties/${resident.propertyId}`}
          >
            View property <ExternalLink aria-hidden size={14} />
          </Link>
          {estateId && (
            <Link
              className="inline-flex min-h-11 items-center rounded-md px-4 py-2.5 text-sm font-semibold text-(--color-primary) hover:bg-orange-50"
              to={`/app/estates/${estateId}`}
            >
              Open estate
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-(--color-ink)">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-(--color-ink-muted)">{label}</p>
      <div className="mt-1 break-words text-sm font-medium text-(--color-ink)">
        {value || 'Not provided'}
      </div>
    </div>
  );
}

function contractLabel(value: string | null, options: readonly string[]) {
  if (!value) return 'Not provided';
  return options.includes(value) ? value.replaceAll('_', ' ').toLowerCase() : value;
}
