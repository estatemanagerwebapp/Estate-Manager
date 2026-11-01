import { useMemo, useState, type FormEvent } from 'react';
import { Ban, CheckCircle2, FileText, KeyRound, ScanLine, Search, XCircle } from 'lucide-react';
import type {
  AccessCodeAuthenticationType,
  AccessCodeKind,
  AccessCodeStatus,
  AccessVerificationDto,
  AccessVerificationGate,
  AccessVerificationOutcome,
  AccessVerificationReason,
  OperatorAccessCodeDto,
  OperatorVerifyAccessCodePreview,
} from '@silverstone/shared';
import {
  api,
  ApiRequestError,
  type AccessVerificationFilter,
  type OperatorAccessCodeFilter,
} from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { useCan } from '../auth/useCan';
import { Modal, useConfirm } from '../components/dialog';
import { Button, Field, InfoBanner, inputClass, selectClass } from '../components/ui';
import { Countdown } from '../components/Countdown';
import { useToast } from '../toast/Toast';
import { DataTable, FilterBar, OperatorPageHeader, StatusBadge } from '../components/operator';
import type { BadgeTone } from '../components/ui';
import { formatDate, formatDateTime } from '../lib/format';

export type GateTab = 'log' | 'codes';
export type CodeView = 'ALL' | AccessCodeStatus;
export type VerificationView = 'ALL' | AccessVerificationOutcome;

const CODE_VIEWS: ReadonlyArray<{ value: CodeView; label: string }> = [
  { value: 'ALL', label: 'All codes' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'REVOKED', label: 'Revoked' },
];

const VERIFICATION_VIEWS: ReadonlyArray<{ value: VerificationView; label: string }> = [
  { value: 'ALL', label: 'All results' },
  { value: 'GRANTED', label: 'Granted' },
  { value: 'DENIED', label: 'Denied' },
];

const GATE_LABELS: Record<AccessVerificationGate, string> = {
  ENTRY: 'Entry',
  EXIT: 'Exit',
};

const CODE_KIND_LABELS: Record<AccessCodeKind, string> = {
  ENTRY: 'Entry only',
  EXIT: 'Exit only',
  BOTH: 'Entry & exit',
};

const AUTHENTICATION_TYPE_LABELS: Record<AccessCodeAuthenticationType, string> = {
  ID_IMAGE: 'ID image',
  CAR_PLATE: 'Car plate',
  VISITOR_IMAGE: 'Visitor image',
};

const REASON_LABELS: Record<AccessVerificationReason, string> = {
  NOT_FOUND: 'Code not found',
  REVOKED: 'Code revoked',
  EXPIRED: 'Code expired',
  WRONG_DIRECTION: 'Wrong gate direction',
};

export function accessCodeFilterForView(view: CodeView): OperatorAccessCodeFilter {
  return view === 'ALL' ? {} : { status: view };
}

export function verificationFilterForView(
  outcome: VerificationView,
  gate: 'ALL' | AccessVerificationGate,
  estateId = '',
): AccessVerificationFilter {
  return {
    ...(outcome === 'ALL' ? {} : { outcome }),
    ...(gate === 'ALL' ? {} : { gate }),
    ...(estateId ? { estateId } : {}),
  };
}

/** Stored ACTIVE codes past their validity window are shown as expired. */
export function accessCodeDisplayStatus(
  code: OperatorAccessCodeDto,
  now: Date = new Date(),
): AccessCodeStatus {
  if (code.status === 'ACTIVE' && code.validUntil) {
    return new Date(code.validUntil) < now ? 'EXPIRED' : 'ACTIVE';
  }
  return code.status;
}

export function accessCodeStatusLabel(status: AccessCodeStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'EXPIRED':
      return 'Expired';
    case 'REVOKED':
      return 'Revoked';
  }
}

export function accessCodeTone(status: AccessCodeStatus): BadgeTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'EXPIRED':
      return 'warning';
    case 'REVOKED':
      return 'danger';
  }
}

export function verificationOutcomeLabel(outcome: AccessVerificationOutcome): string {
  return outcome === 'GRANTED' ? 'Granted' : 'Denied';
}

export function verificationOutcomeTone(outcome: AccessVerificationOutcome): BadgeTone {
  return outcome === 'GRANTED' ? 'success' : 'danger';
}

export function verificationReasonLabel(reason: AccessVerificationReason | null): string {
  return reason ? REASON_LABELS[reason] : '—';
}

/** Headline for the pre-commit review screen. Nothing is recorded yet. */
export function previewOutcomeLabel(preview: OperatorVerifyAccessCodePreview): string {
  if (!preview.found) return 'No matching code';
  return preview.outcome === 'GRANTED' ? 'Access would be granted' : 'Access would be denied';
}

/**
 * The guard's confirmation action. A grant confirms the physical entry/exit; a
 * denial (or unknown code) still records the attempt so the log stays complete.
 */
export function confirmVerificationLabel(preview: OperatorVerifyAccessCodePreview): string {
  if (preview.outcome === 'GRANTED') {
    return preview.gate === 'ENTRY' ? 'Confirm entry' : 'Confirm exit';
  }
  return 'Record denied attempt';
}

export function accessCodeResidentLabel(code: OperatorAccessCodeDto): string {
  return code.resident?.fullName ?? code.resident?.email ?? 'Resident account unavailable';
}

export function accessCodePropertyLabel(code: OperatorAccessCodeDto): string {
  if (!code.property) return 'No property assigned';
  return [code.property.identifier, code.property.name, code.property.estate.name]
    .filter(Boolean)
    .join(' · ');
}

export function accessCodeVisitorLabel(code: OperatorAccessCodeDto): string {
  return code.visitorName?.trim() || 'Visitor not recorded';
}

export function accessCodeVisitorDetail(code: OperatorAccessCodeDto): string {
  return [code.visitorName?.trim(), code.carPlate?.trim()].filter(Boolean).join(' · ') || '—';
}

/** Media URL for inline viewing by gate staff. */
export function idDocumentHref(url: string | null): string | null {
  if (!url) return null;
  return url.includes('?') ? `${url}&inline=1` : `${url}?inline=1`;
}

export function verificationResidentLabel(verification: AccessVerificationDto): string {
  return (
    verification.resident?.fullName ??
    verification.resident?.email ??
    (verification.reason === 'NOT_FOUND' ? 'Unknown code' : 'Resident account unavailable')
  );
}

export function verificationPropertyLabel(verification: AccessVerificationDto): string {
  if (!verification.property) return 'No property context';
  return [
    verification.property.identifier,
    verification.property.name,
    verification.property.estate.name,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function accessCodeMatchesSearch(code: OperatorAccessCodeDto, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return [
    accessCodeResidentLabel(code),
    code.resident?.email ?? '',
    code.resident?.phone ?? '',
    accessCodePropertyLabel(code),
    code.visitorName ?? '',
    code.carPlate ?? '',
    code.codePrefix,
    CODE_KIND_LABELS[code.kind],
    accessCodeStatusLabel(accessCodeDisplayStatus(code)),
    code.validUntil ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

export function verificationMatchesSearch(
  verification: AccessVerificationDto,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return [
    verificationResidentLabel(verification),
    verification.resident?.email ?? '',
    verification.resident?.phone ?? '',
    verificationPropertyLabel(verification),
    verification.visitorName ?? '',
    verification.carPlate ?? '',
    verification.codePrefix ?? '',
    GATE_LABELS[verification.gate],
    verificationOutcomeLabel(verification.outcome),
    verificationReasonLabel(verification.reason),
    verification.verifiedBy?.fullName ?? '',
    verification.verifiedBy?.email ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

/**
 * Operator gate access (Phase 6).
 *
 * A gate check is two steps: the guard enters a code, the API resolves it and
 * returns the visitor/property details plus the outcome it *would* have, and
 * only a confirmation writes the verification row. Nothing is recorded from a
 * lookup alone, so an abandoned check never pollutes the log. Staff can inspect
 * prefixes and validity windows; the full code is never stored or shown here.
 * Residents continue to create and revoke their own codes from the resident
 * portal.
 */
export function GatePage({ fixedEstateId }: { fixedEstateId?: string } = {}) {
  const can = useCan();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const canReadCodes = can['gate.read'] === true;
  const canReadEstates = can['estate.read'] === true;
  const canManageGate = can['gate.manage'] === true;
  const canVerify = canManageGate;

  const [tab, setTab] = useState<GateTab>('log');
  const [search, setSearch] = useState('');
  const [outcomeView, setOutcomeView] = useState<VerificationView>('ALL');
  const [gateView, setGateView] = useState<'ALL' | AccessVerificationGate>('ALL');
  const [codeView, setCodeView] = useState<CodeView>('ALL');
  const [estateId, setEstateId] = useState(fixedEstateId ?? '');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyGate, setVerifyGate] = useState<AccessVerificationGate>('ENTRY');
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<OperatorVerifyAccessCodePreview | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<AccessVerificationDto | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const verificationFilter = useMemo(
    () => verificationFilterForView(outcomeView, gateView, estateId),
    [outcomeView, gateView, estateId],
  );
  const codeFilter = useMemo(
    () => ({ ...accessCodeFilterForView(codeView), ...(estateId ? { estateId } : {}) }),
    [codeView, estateId],
  );

  const estatesQuery = useApiQuery(
    ['estates', { status: 'ACTIVE' }],
    () => api.listEstates({ status: 'ACTIVE' }),
    'Could not load estates.',
    canReadEstates && !fixedEstateId,
  );
  const estates = estatesQuery.data?.estates ?? [];

  const logQuery = useApiQuery(
    queryKeys.verifications.list(verificationFilter),
    () => api.listAccessVerifications(verificationFilter),
    'Could not load verification history.',
  );
  const codesQuery = useApiQuery(
    queryKeys.accessCodes.list(codeFilter),
    () => api.listOperatorAccessCodes(codeFilter),
    'Could not load access codes.',
    canReadCodes,
  );

  const verifications = logQuery.data?.verifications ?? [];
  const codes = codesQuery.data?.codes ?? [];
  const visibleVerifications = search.trim()
    ? verifications.filter((entry) => verificationMatchesSearch(entry, search))
    : verifications;
  const visibleCodes = search.trim()
    ? codes.filter((code) => accessCodeMatchesSearch(code, search))
    : codes;

  const today = new Date().toDateString();
  const grantedToday = verifications.filter(
    (entry) => entry.outcome === 'GRANTED' && new Date(entry.occurredAt).toDateString() === today,
  ).length;
  const deniedToday = verifications.filter(
    (entry) => entry.outcome === 'DENIED' && new Date(entry.occurredAt).toDateString() === today,
  ).length;
  const activeCodes = codes.filter((code) => accessCodeDisplayStatus(code) === 'ACTIVE').length;

  const queryError =
    logQuery.errorObject instanceof ApiRequestError && logQuery.errorObject.code === 'FORBIDDEN'
      ? 'You no longer have permission to view gate verification history.'
      : logQuery.error;

  async function refreshAll() {
    await Promise.all([
      logQuery.refresh(),
      canReadCodes ? codesQuery.refresh() : Promise.resolve(),
    ]);
  }

  function selectTab(next: GateTab) {
    setTab(next);
    setSearch('');
  }

  function openVerify() {
    setVerifyCode('');
    setVerifyGate('ENTRY');
    setVerifyError(null);
    setVerifyResult(null);
    setPreview(null);
    setVerifyOpen(true);
  }

  function closeVerify() {
    if (verifying || previewing) return;
    setVerifyOpen(false);
    setVerifyCode('');
    setVerifyResult(null);
    setPreview(null);
    setVerifyError(null);
  }

  function resetVerify() {
    setVerifyCode('');
    setVerifyGate('ENTRY');
    setVerifyError(null);
    setVerifyResult(null);
    setPreview(null);
  }

  /** Step 1: resolve the code. Nothing is recorded. */
  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = verifyCode.trim();
    if (!code) {
      setVerifyError('Enter the access code shown in the resident portal.');
      return;
    }
    setPreviewing(true);
    setVerifyError(null);
    setPreview(null);
    try {
      const response = await api.previewAccessCode({ code, gate: verifyGate });
      setPreview(response.preview);
    } catch (error) {
      setVerifyError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not look up this code.',
      );
    } finally {
      setPreviewing(false);
    }
  }

  /** Step 2: the guard has seen the details; record the attempt. */
  async function confirmVerification() {
    const code = verifyCode.trim();
    if (!code) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const response = await api.verifyAccessCode({ code, gate: verifyGate });
      setVerifyResult(response.verification);
      setPreview(null);
      await refreshAll();
    } catch (error) {
      setVerifyError(
        error instanceof ApiRequestError || error instanceof Error
          ? error.message
          : 'Could not verify this code.',
      );
    } finally {
      setVerifying(false);
    }
  }

  async function revokeCode(code: OperatorAccessCodeDto) {
    const confirmed = await confirm({
      title: 'Revoke access code?',
      body: `The code for ${accessCodeVisitorLabel(code)} will stop working immediately. The resident will see it as revoked.`,
      danger: true,
    });
    if (!confirmed) return;

    setRevokingId(code.id);
    try {
      await api.revokeOperatorAccessCode(code.id);
      toast.success('Access code revoked.');
      await refreshAll();
    } catch (error) {
      toast.error(
        error instanceof ApiRequestError ? error.message : 'Could not revoke the access code.',
      );
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      <OperatorPageHeader
        icon={<ScanLine aria-hidden size={20} className="text-(--color-primary)" />}
        title="Gate access"
        description="Verify resident codes and review gate verification history."
        actions={
          <>
            {canVerify && (
              <Button size="sm" onClick={openVerify}>
                <KeyRound aria-hidden size={14} />
                Verify code
              </Button>
            )}
          </>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Granted today"
          value={String(grantedToday)}
          hint="From the latest 200 attempts"
        />
        <SummaryCard
          label="Denied today"
          value={String(deniedToday)}
          hint="Review denied attempts below"
        />
        <SummaryCard
          label="Active codes"
          value={canReadCodes ? String(activeCodes) : '—'}
          hint={canReadCodes ? 'From the latest 100 codes' : 'Requires gate.read'}
        />
      </div>

      <div
        role="tablist"
        aria-label="Gate access views"
        className="mt-6 inline-flex rounded-md border border-slate-300 bg-white p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'log'}
          onClick={() => selectTab('log')}
          className={tabClass(tab === 'log')}
        >
          <ScanLine aria-hidden size={14} />
          Verification log
        </button>
        {canReadCodes && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'codes'}
            onClick={() => selectTab('codes')}
            className={tabClass(tab === 'codes')}
          >
            <KeyRound aria-hidden size={14} />
            Access codes
          </button>
        )}
      </div>

      <FilterBar
        summary={
          <span role="status" aria-live="polite">
            {tab === 'log'
              ? `${visibleVerifications.length} attempt${visibleVerifications.length === 1 ? '' : 's'}`
              : `${visibleCodes.length} code${visibleCodes.length === 1 ? '' : 's'}`}
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
            placeholder="Search resident, property or prefix"
            aria-label={tab === 'log' ? 'Search verification log' : 'Search access codes'}
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-base outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
            style={{ fontSize: '16px' }}
          />
        </div>
        {canReadEstates && !fixedEstateId && (
          <select
            value={estateId}
            onChange={(event) => setEstateId(event.target.value)}
            aria-label="Filter access records by estate"
            className={`${selectClass} text-base`}
            style={{ fontSize: '16px' }}
          >
            <option value="">All estates</option>
            {estates.map((estate) => (
              <option key={estate.id} value={estate.id}>
                {estate.name}
              </option>
            ))}
          </select>
        )}
        {tab === 'log' ? (
          <>
            <select
              value={outcomeView}
              onChange={(event) => setOutcomeView(event.target.value as VerificationView)}
              aria-label="Filter verification results"
              className={`${selectClass} text-base`}
              style={{ fontSize: '16px' }}
            >
              {VERIFICATION_VIEWS.map((view) => (
                <option key={view.value} value={view.value}>
                  {view.label}
                </option>
              ))}
            </select>
            <select
              value={gateView}
              onChange={(event) =>
                setGateView(event.target.value as 'ALL' | AccessVerificationGate)
              }
              aria-label="Filter by gate"
              className={`${selectClass} text-base`}
              style={{ fontSize: '16px' }}
            >
              <option value="ALL">All gates</option>
              <option value="ENTRY">Entry</option>
              <option value="EXIT">Exit</option>
            </select>
          </>
        ) : (
          <select
            value={codeView}
            onChange={(event) => setCodeView(event.target.value as CodeView)}
            aria-label="Filter access codes"
            className={`${selectClass} text-base`}
            style={{ fontSize: '16px' }}
          >
            {CODE_VIEWS.map((view) => (
              <option key={view.value} value={view.value}>
                {view.label}
              </option>
            ))}
          </select>
        )}
      </FilterBar>

      {tab === 'codes' && (
        <div className="mt-4">
          <InfoBanner>
            Residents attach the visitor name, car plate and ID image when they create a code. Staff
            with gate management can inspect those details and revoke a code at any time. The full
            code is never available to the estate office.
          </InfoBanner>
        </div>
      )}

      {tab === 'log' ? (
        <DataTable
          columns={[
            {
              key: 'when',
              header: 'When',
              cell: (entry) => (
                <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
                  {formatDateTime(entry.occurredAt)}
                </span>
              ),
            },
            {
              key: 'resident',
              header: 'Resident',
              cell: (entry) => (
                <div className="min-w-0">
                  <p className="truncate text-xs text-(--color-ink)">
                    {verificationResidentLabel(entry)}
                  </p>
                  <p className="truncate text-[11px] text-(--color-ink-muted)">
                    {entry.resident?.email ?? 'No resident context'}
                  </p>
                </div>
              ),
            },
            {
              key: 'visitor',
              header: 'Visitor',
              cell: (entry) => (
                <div className="min-w-0">
                  <p className="truncate text-xs text-(--color-ink)">
                    {entry.visitorName?.trim() || 'Not recorded'}
                  </p>
                  <p className="truncate text-[11px] text-(--color-ink-muted)">
                    {entry.carPlate?.trim() || 'No vehicle'}
                  </p>
                </div>
              ),
            },
            {
              key: 'property',
              header: 'Property',
              cell: (entry) => (
                <span className="text-xs text-(--color-ink-muted)">
                  {verificationPropertyLabel(entry)}
                </span>
              ),
            },
            {
              key: 'gate',
              header: 'Gate',
              cell: (entry) => (
                <span className="text-xs text-(--color-ink)">{GATE_LABELS[entry.gate]}</span>
              ),
            },
            {
              key: 'result',
              header: 'Result',
              cell: (entry) => (
                <div>
                  <StatusBadge
                    status={entry.outcome}
                    label={verificationOutcomeLabel(entry.outcome)}
                    tone={verificationOutcomeTone(entry.outcome)}
                  />
                  {entry.reason && (
                    <p className="mt-1 text-[11px] text-(--color-ink-muted)">
                      {verificationReasonLabel(entry.reason)}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: 'prefix',
              header: 'Prefix',
              cell: (entry) => (
                <span className="font-mono text-xs text-(--color-ink-muted)">
                  {entry.codePrefix ?? '—'}
                </span>
              ),
            },
            {
              key: 'guard',
              header: 'Verified by',
              cell: (entry) => (
                <span className="text-xs text-(--color-ink-muted)">
                  {entry.verifiedBy?.fullName ?? entry.verifiedBy?.email ?? 'Staff account removed'}
                </span>
              ),
            },
          ]}
          rows={visibleVerifications}
          getRowKey={(entry) => entry.id}
          caption="Gate verification history"
          loading={logQuery.loading}
          error={queryError}
          onRetry={() => void refreshAll()}
          emptyTitle={search.trim() ? 'No attempts match your search' : 'No attempts in this view'}
          emptyBody={
            search.trim()
              ? 'Clear the search or switch to another result filter.'
              : 'Verify a code at the gate to start the history.'
          }
          emptyAction={
            canVerify && !search.trim() ? (
              <Button size="sm" onClick={openVerify}>
                <KeyRound aria-hidden size={14} />
                Verify code
              </Button>
            ) : undefined
          }
          footer={
            <span className="text-xs text-(--color-ink-muted)">
              {visibleVerifications.length} shown
            </span>
          }
        />
      ) : (
        <DataTable
          columns={[
            {
              key: 'resident',
              header: 'Resident',
              cell: (code) => (
                <div className="min-w-0">
                  <p className="truncate text-xs text-(--color-ink)">
                    {accessCodeResidentLabel(code)}
                  </p>
                  <p className="truncate text-[11px] text-(--color-ink-muted)">
                    {code.resident?.email ?? 'No account'}
                  </p>
                </div>
              ),
            },
            {
              key: 'property',
              header: 'Property',
              cell: (code) => (
                <span className="text-xs text-(--color-ink-muted)">
                  {accessCodePropertyLabel(code)}
                </span>
              ),
            },
            {
              key: 'visitor',
              header: 'Visitor',
              cell: (code) => (
                <div className="min-w-0">
                  <p className="truncate text-xs text-(--color-ink)">
                    {accessCodeVisitorLabel(code)}
                  </p>
                  <p className="truncate text-[11px] text-(--color-ink-muted)">
                    {code.carPlate?.trim() || 'No vehicle'}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-(--color-primary)">
                    Request: {AUTHENTICATION_TYPE_LABELS[code.authenticationType]}
                  </p>
                  {idDocumentHref(code.idDocumentUrl) && (
                    <a
                      href={idDocumentHref(code.idDocumentUrl)!}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-(--color-primary) hover:underline"
                    >
                      <FileText aria-hidden size={11} />
                      View ID image
                    </a>
                  )}
                </div>
              ),
            },
            {
              key: 'kind',
              header: 'Direction',
              cell: (code) => (
                <span className="text-xs text-(--color-ink)">{CODE_KIND_LABELS[code.kind]}</span>
              ),
            },
            {
              key: 'prefix',
              header: 'Prefix',
              cell: (code) => (
                <span className="font-mono text-xs text-(--color-ink-muted)">
                  {code.codePrefix}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (code) => {
                const status = accessCodeDisplayStatus(code);
                return (
                  <StatusBadge
                    status={status}
                    label={accessCodeStatusLabel(status)}
                    tone={accessCodeTone(status)}
                  />
                );
              },
            },
            {
              key: 'validUntil',
              header: 'Time left',
              cell: (code) => (
                <div className="whitespace-nowrap">
                  <Countdown validUntil={code.validUntil} status={accessCodeDisplayStatus(code)} />
                  <p className="mt-0.5 text-[11px] text-(--color-ink-muted)">
                    {code.validUntil ? formatDate(code.validUntil) : 'No expiry'}
                  </p>
                </div>
              ),
            },
            {
              key: 'issued',
              header: 'Issued',
              cell: (code) => (
                <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
                  {formatDate(code.issuedAt)}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (code) =>
                canManageGate && accessCodeDisplayStatus(code) !== 'REVOKED' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={revokingId === code.id}
                    onClick={() => void revokeCode(code)}
                  >
                    <Ban aria-hidden size={12} />
                    {revokingId === code.id ? 'Revoking…' : 'Revoke'}
                  </Button>
                ) : null,
            },
          ]}
          rows={visibleCodes}
          getRowKey={(code) => code.id}
          caption="Access codes"
          loading={codesQuery.loading}
          error={codesQuery.error}
          onRetry={() => void refreshAll()}
          emptyTitle={search.trim() ? 'No codes match your search' : 'No codes in this view'}
          emptyBody={
            search.trim()
              ? 'Clear the search or switch to another status filter.'
              : 'Residents generate codes from their portal after onboarding.'
          }
          footer={
            <span className="text-xs text-(--color-ink-muted)">{visibleCodes.length} shown</span>
          }
        />
      )}

      <Modal
        open={verifyOpen}
        onClose={closeVerify}
        title="Verify access code"
        footer={
          verifyResult ? (
            <>
              <Button variant="secondary" size="sm" onClick={closeVerify}>
                Done
              </Button>
              <Button size="sm" onClick={resetVerify}>
                Verify another
              </Button>
            </>
          ) : preview ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPreview(null)}
                disabled={verifying}
              >
                Back
              </Button>
              <Button
                size="sm"
                variant={preview.outcome === 'GRANTED' ? 'primary' : 'danger'}
                onClick={() => void confirmVerification()}
                disabled={verifying}
              >
                {verifying ? 'Recording…' : confirmVerificationLabel(preview)}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={closeVerify} disabled={previewing}>
                Cancel
              </Button>
              <Button size="sm" type="submit" form="verify-code-form" disabled={previewing}>
                {previewing ? 'Looking up…' : 'Look up code'}
              </Button>
            </>
          )
        }
      >
        {verifyResult ? (
          <VerificationResult result={verifyResult} />
        ) : preview ? (
          <div className="flex flex-col gap-4">
            <VerificationPreview preview={preview} />
            {verifyError && (
              <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {verifyError}
              </p>
            )}
          </div>
        ) : (
          <form id="verify-code-form" onSubmit={submitPreview} className="flex flex-col gap-4">
            <p className="text-xs text-(--color-ink-muted)">
              Enter the code shown in the resident portal. The visitor&apos;s details appear first
              so you can check them before the entry or exit is recorded. Nothing is written until
              you confirm.
            </p>
            <Field label="Gate direction">
              <select
                value={verifyGate}
                onChange={(event) => setVerifyGate(event.target.value as AccessVerificationGate)}
                className={inputClass}
              >
                <option value="ENTRY">Entry</option>
                <option value="EXIT">Exit</option>
              </select>
            </Field>
            <Field label="Access code" hint="Codes are 8 characters and not case-sensitive.">
              <input
                value={verifyCode}
                onChange={(event) => setVerifyCode(event.target.value.toUpperCase())}
                className={`${inputClass} font-mono uppercase tracking-[0.2em]`}
                placeholder="ABCD2345"
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </Field>
            {verifyError && (
              <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {verifyError}
              </p>
            )}
          </form>
        )}
      </Modal>
      {dialog}
    </div>
  );
}

/**
 * The pre-commit review screen.
 *
 * Shows who the code belongs to and what the outcome will be before anything is
 * written. The guard confirms here; only then does the API append a
 * verification row.
 */
function VerificationPreview({ preview }: { preview: OperatorVerifyAccessCodePreview }) {
  const granted = preview.outcome === 'GRANTED';
  const bannerClass = !preview.found
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : granted
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-rose-200 bg-rose-50 text-rose-800';

  return (
    <div>
      <div
        role="status"
        className={`flex items-start gap-3 rounded-md border px-4 py-3 ${bannerClass}`}
      >
        {!preview.found ? (
          <Search aria-hidden size={20} className="mt-0.5 shrink-0" />
        ) : granted ? (
          <CheckCircle2 aria-hidden size={20} className="mt-0.5 shrink-0" />
        ) : (
          <XCircle aria-hidden size={20} className="mt-0.5 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold">{previewOutcomeLabel(preview)}</p>
          <p className="mt-0.5 text-xs">
            {preview.reason
              ? verificationReasonLabel(preview.reason)
              : `The code is valid for ${GATE_LABELS[preview.gate].toLowerCase()} at the gate.`}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-xs">
        <dt className="text-(--color-ink-muted)">Visitor</dt>
        <dd className="text-(--color-ink)">{preview.visitorName?.trim() || 'Not recorded'}</dd>
        <dt className="text-(--color-ink-muted)">Required check</dt>
        <dd className="font-semibold text-(--color-primary)">
          {preview.authenticationType
            ? AUTHENTICATION_TYPE_LABELS[preview.authenticationType]
            : 'Not specified'}
        </dd>
        <dt className="text-(--color-ink-muted)">Car plate</dt>
        <dd className="text-(--color-ink)">{preview.carPlate?.trim() || 'No vehicle'}</dd>
        <dt className="text-(--color-ink-muted)">ID image</dt>
        <dd className="text-(--color-ink)">
          {idDocumentHref(preview.idDocumentUrl) ? (
            <a
              href={idDocumentHref(preview.idDocumentUrl)!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-(--color-primary) hover:underline"
            >
              <FileText aria-hidden size={12} />
              View visitor ID
            </a>
          ) : (
            'Not attached'
          )}
        </dd>
        <dt className="text-(--color-ink-muted)">Resident</dt>
        <dd className="text-(--color-ink)">
          {preview.resident?.fullName ?? preview.resident?.email ?? 'No resident record'}
        </dd>
        <dt className="text-(--color-ink-muted)">Property</dt>
        <dd className="text-(--color-ink)">
          {preview.property
            ? [preview.property.identifier, preview.property.name, preview.property.estate.name]
                .filter(Boolean)
                .join(' · ')
            : 'No property context'}
        </dd>
        <dt className="text-(--color-ink-muted)">Direction</dt>
        <dd className="text-(--color-ink)">
          {GATE_LABELS[preview.gate]}
          {preview.kind ? ` · code allows ${CODE_KIND_LABELS[preview.kind].toLowerCase()}` : ''}
        </dd>
        <dt className="text-(--color-ink-muted)">Code status</dt>
        <dd className="text-(--color-ink)">
          {preview.status ? accessCodeStatusLabel(preview.status) : 'Unknown'}
        </dd>
        <dt className="text-(--color-ink-muted)">Valid until</dt>
        <dd className="text-(--color-ink)">
          {preview.validUntil ? formatDateTime(preview.validUntil) : 'No expiry'}
        </dd>
        <dt className="text-(--color-ink-muted)">Code prefix</dt>
        <dd className="font-mono text-(--color-ink)">{preview.codePrefix ?? '—'}</dd>
      </dl>

      <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-(--color-ink-muted)">
        Nothing has been recorded yet. Confirming below writes this attempt to the verification log.
      </p>
    </div>
  );
}

function VerificationResult({ result }: { result: AccessVerificationDto }) {
  const granted = result.outcome === 'GRANTED';
  return (
    <div>
      <div
        role="status"
        className={`flex items-start gap-3 rounded-md border px-4 py-3 ${
          granted
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}
      >
        {granted ? (
          <CheckCircle2 aria-hidden size={20} className="mt-0.5 shrink-0" />
        ) : (
          <XCircle aria-hidden size={20} className="mt-0.5 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold">{granted ? 'Access granted' : 'Access denied'}</p>
          <p className="mt-0.5 text-xs">
            {granted
              ? `Verified for ${GATE_LABELS[result.gate].toLowerCase()} at the gate.`
              : verificationReasonLabel(result.reason)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-xs">
        <dt className="text-(--color-ink-muted)">Visitor</dt>
        <dd className="text-(--color-ink)">{result.visitorName?.trim() || 'Not recorded'}</dd>
        <dt className="text-(--color-ink-muted)">Required check</dt>
        <dd className="font-semibold text-(--color-primary)">
          {result.authenticationType
            ? AUTHENTICATION_TYPE_LABELS[result.authenticationType]
            : 'Not specified'}
        </dd>
        <dt className="text-(--color-ink-muted)">Car plate</dt>
        <dd className="text-(--color-ink)">{result.carPlate?.trim() || 'No vehicle'}</dd>
        <dt className="text-(--color-ink-muted)">ID image</dt>
        <dd className="text-(--color-ink)">
          {idDocumentHref(result.idDocumentUrl) ? (
            <a
              href={idDocumentHref(result.idDocumentUrl)!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-(--color-primary) hover:underline"
            >
              <FileText aria-hidden size={12} />
              View visitor ID
            </a>
          ) : (
            'Not attached'
          )}
        </dd>
        <dt className="text-(--color-ink-muted)">Resident</dt>
        <dd className="text-(--color-ink)">{verificationResidentLabel(result)}</dd>
        <dt className="text-(--color-ink-muted)">Property</dt>
        <dd className="text-(--color-ink)">{verificationPropertyLabel(result)}</dd>
        <dt className="text-(--color-ink-muted)">Direction</dt>
        <dd className="text-(--color-ink)">{GATE_LABELS[result.gate]}</dd>
        <dt className="text-(--color-ink-muted)">Code prefix</dt>
        <dd className="font-mono text-(--color-ink)">{result.codePrefix ?? '—'}</dd>
        <dt className="text-(--color-ink-muted)">Recorded</dt>
        <dd className="text-(--color-ink)">{formatDateTime(result.occurredAt)}</dd>
      </dl>
    </div>
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

function tabClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'bg-(--color-primary) text-white'
      : 'text-(--color-ink-muted) hover:bg-(--color-surface)'
  }`;
}
