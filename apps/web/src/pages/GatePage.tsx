import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, RefreshCw, ScanLine, Search, XCircle } from 'lucide-react';
import type {
  AccessCodeKind,
  AccessCodeStatus,
  AccessVerificationDto,
  AccessVerificationGate,
  AccessVerificationOutcome,
  AccessVerificationReason,
  OperatorAccessCodeDto,
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
import { Modal } from '../components/dialog';
import { Button, Field, InfoBanner, inputClass, selectClass } from '../components/ui';
import { DataTable, FilterBar, OperatorPageHeader, StatusBadge } from '../components/operator';
import type { BadgeTone } from '../components/ui';

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
): AccessVerificationFilter {
  return {
    ...(outcome === 'ALL' ? {} : { outcome }),
    ...(gate === 'ALL' ? {} : { gate }),
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

export function accessCodeResidentLabel(code: OperatorAccessCodeDto): string {
  return code.resident?.fullName ?? code.resident?.email ?? 'Resident account unavailable';
}

export function accessCodePropertyLabel(code: OperatorAccessCodeDto): string {
  if (!code.property) return 'No property assigned';
  return [code.property.identifier, code.property.name, code.property.estate.name]
    .filter(Boolean)
    .join(' · ');
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
 * Guards verify a resident's code at entry or exit and every attempt is kept
 * in the organization's verification history. Staff can inspect prefixes and
 * validity windows; the full code is never stored or shown here. Residents
 * continue to create and revoke their own codes from the resident portal.
 */
export function GatePage() {
  const can = useCan();
  const canReadCodes = can['gate.read'] === true;
  const canVerify = can['gate.manage'] === true;

  const [tab, setTab] = useState<GateTab>('log');
  const [search, setSearch] = useState('');
  const [outcomeView, setOutcomeView] = useState<VerificationView>('ALL');
  const [gateView, setGateView] = useState<'ALL' | AccessVerificationGate>('ALL');
  const [codeView, setCodeView] = useState<CodeView>('ALL');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyGate, setVerifyGate] = useState<AccessVerificationGate>('ENTRY');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<AccessVerificationDto | null>(null);

  const verificationFilter = useMemo(
    () => verificationFilterForView(outcomeView, gateView),
    [outcomeView, gateView],
  );
  const codeFilter = useMemo(() => accessCodeFilterForView(codeView), [codeView]);

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
    setVerifyOpen(true);
  }

  function closeVerify() {
    if (verifying) return;
    setVerifyOpen(false);
    setVerifyCode('');
    setVerifyResult(null);
    setVerifyError(null);
  }

  function resetVerify() {
    setVerifyCode('');
    setVerifyGate('ENTRY');
    setVerifyError(null);
    setVerifyResult(null);
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = verifyCode.trim();
    if (!code) {
      setVerifyError('Enter the access code shown in the resident portal.');
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const response = await api.verifyAccessCode({ code, gate: verifyGate });
      setVerifyResult(response.verification);
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refreshAll()}
              disabled={logQuery.fetching || codesQuery.fetching}
            >
              <RefreshCw
                aria-hidden
                size={14}
                className={logQuery.fetching ? 'animate-spin' : undefined}
              />
              Refresh
            </Button>
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
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        {tab === 'log' ? (
          <>
            <select
              value={outcomeView}
              onChange={(event) => setOutcomeView(event.target.value as VerificationView)}
              aria-label="Filter verification results"
              className={selectClass}
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
              className={selectClass}
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
            className={selectClass}
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
            Residents create, extend and revoke their own codes. Staff can inspect prefixes and
            validity windows here, but the full code is never available to the estate office.
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
              header: 'Valid until',
              cell: (code) => (
                <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
                  {code.validUntil ? formatDate(code.validUntil) : 'No expiry'}
                </span>
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
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={closeVerify} disabled={verifying}>
                Cancel
              </Button>
              <Button size="sm" type="submit" form="verify-code-form" disabled={verifying}>
                {verifying ? 'Verifying…' : 'Verify code'}
              </Button>
            </>
          )
        }
      >
        {verifyResult ? (
          <VerificationResult result={verifyResult} />
        ) : (
          <form id="verify-code-form" onSubmit={submitVerification} className="flex flex-col gap-4">
            <p className="text-xs text-(--color-ink-muted)">
              Enter the code shown in the resident portal. The attempt is recorded whether it is
              granted or denied; the full code is never stored in the log.
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { dateStyle: 'medium' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
