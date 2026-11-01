import { useEffect, useState } from 'react';
import { KeyRound, Copy, Check, Plus, TimerReset, Ban } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  ResidentAccessCodeDto,
  AccessCodeKind,
  AccessCodeAuthenticationType,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useApiQuery } from '../../api/query';
import { useToast } from '../../toast/Toast';
import { Countdown } from '../../components/Countdown';
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
import { formatShortDate } from '../../lib/format';

const KIND_OPTIONS: Array<{ value: AccessCodeKind; label: string }> = [
  { value: 'ENTRY', label: 'Entry' },
  { value: 'EXIT', label: 'Exit' },
  { value: 'BOTH', label: 'Entry & exit' },
];

const AUTHENTICATION_OPTIONS: Array<{
  value: AccessCodeAuthenticationType;
  label: string;
}> = [
  { value: 'ID_IMAGE', label: 'ID image' },
  { value: 'CAR_PLATE', label: 'Car plate' },
  { value: 'VISITOR_IMAGE', label: 'Visitor image' },
];

/**
 * Resident access codes page (S4).
 *
 * Lists the resident's codes (prefix + validity window — never the secret),
 * generates new ones, extends a window and deactivates a code. The full
 * code is shown once, right after generation, with a copy button.
 */
export function ResidentCodesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const [kind, setKind] = useState<AccessCodeKind>('ENTRY');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [authenticationType, setAuthenticationType] =
    useState<AccessCodeAuthenticationType>('ID_IMAGE');
  const [generating, setGenerating] = useState(false);

  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [busyCodeId, setBusyCodeId] = useState<string | null>(null);

  const { data: propertyResponse } = useApiQuery(
    ['resident', 'properties'],
    () => api.getResidentProperties(),
    'Could not load your properties.',
  );
  const properties = propertyResponse?.properties ?? [];
  useEffect(() => {
    if (!selectedPropertyId && properties.length > 0) setSelectedPropertyId(properties[0]!.id);
  }, [properties, selectedPropertyId]);

  const {
    data,
    loading,
    error: queryError,
    refresh,
  } = useApiQuery(
    ['resident', 'codes', selectedPropertyId],
    () => api.getResidentCodes(selectedPropertyId || undefined),
    'Could not load your access codes.',
  );
  const codes = data?.codes ?? [];
  const error = actionError ?? queryError;

  // Reflect the estate's configured default without overwriting an edit.
  useEffect(() => {
    if (!data) return;
    setDurationHours((current) => (current === '' ? String(data.defaultDurationHours) : current));
  }, [data]);

  async function generate() {
    const trimmedVisitor = visitorName.trim();
    if (!trimmedVisitor) {
      setActionError('Enter the visitor’s name.');
      return;
    }
    if (!selectedPropertyId) {
      setActionError('Choose the property this visitor is attending.');
      return;
    }
    const hours = durationHours.trim() === '' ? undefined : Number(durationHours);
    if (hours !== undefined && (!Number.isFinite(hours) || !Number.isInteger(hours))) {
      setActionError('Validity must be a whole number of hours.');
      return;
    }
    if (hours !== undefined && hours < 1) {
      setActionError('Validity must be at least 1 hour.');
      return;
    }
    if (data && hours !== undefined && hours > data.maxDurationHours) {
      setActionError(`The estate office allows at most ${data.maxDurationHours} hours.`);
      return;
    }

    setGenerating(true);
    setActionError(null);
    try {
      const response = await api.generateResidentAccessCode({
        propertyId: selectedPropertyId,
        kind,
        durationHours: hours,
        visitorName: trimmedVisitor,
        authenticationType,
      });
      // The full code is returned exactly once — show it now.
      setIssuedCode(response.code);
      setCopied(false);
      setVisitorName('');
      toast.success('Access code generated.');
      void queryClient.invalidateQueries({ queryKey: ['resident', 'dashboard'] });
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not generate an access code.',
      );
      toast.error('Could not generate an access code.');
    } finally {
      setGenerating(false);
    }
  }

  async function extend(code: ResidentAccessCodeDto) {
    setBusyCodeId(code.id);
    setActionError(null);
    try {
      await api.extendResidentAccessCode(code.id);
      toast.success('Code validity extended.');
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not extend the code.');
      toast.error('Could not extend the code.');
    } finally {
      setBusyCodeId(null);
    }
  }

  async function deactivate(code: ResidentAccessCodeDto) {
    setBusyCodeId(code.id);
    setActionError(null);
    try {
      await api.deactivateResidentAccessCode(code.id);
      toast.success('Code deactivated.');
      void queryClient.invalidateQueries({
        queryKey: ['resident', 'dashboard'],
        refetchType: 'none',
      });
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not deactivate the code.',
      );
      toast.error('Could not deactivate the code.');
    } finally {
      setBusyCodeId(null);
    }
  }

  async function copyCode() {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(issuedCode);
      setCopied(true);
    } catch {
      toast.error('Could not copy the code. Select it and copy manually.');
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

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

      {/* Issued code — shown once */}
      {issuedCode && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <KeyRound aria-hidden size={15} className="text-(--color-primary)" />
                Your new code
              </span>
            }
            subtitle="Copy it now — it is shown only once."
          />
          <CardBody>
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded-md bg-slate-100 px-3 py-2 font-mono text-lg tracking-widest">
                {issuedCode}
              </code>
              <Button size="sm" variant="secondary" onClick={() => void copyCode()}>
                {copied ? (
                  <>
                    <Check aria-hidden size={13} className="mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy aria-hidden size={13} className="mr-1" />
                    Copy code
                  </>
                )}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssuedCode(null)}>
                Done
              </Button>
            </div>
            <p className="mt-3 text-xs text-(--color-ink-muted)">
              This is the only time the full code is displayed. Store it somewhere safe.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Generate */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Plus aria-hidden size={15} className="text-(--color-primary)" />
              Generate a code
            </span>
          }
          subtitle="Add the visitor's details and ID image, then choose how long the estate office allows the code to work."
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Estate / property">
              <select
                className={inputClass}
                value={selectedPropertyId}
                onChange={(event) => setSelectedPropertyId(event.target.value)}
                required
              >
                <option value="">Select a property…</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.estate.name} · {property.identifier}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select
                className={inputClass}
                value={kind}
                onChange={(event) => setKind(event.target.value as AccessCodeKind)}
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Valid for (hours)"
              hint={
                data
                  ? `Default ${data.defaultDurationHours} hours; maximum ${data.maxDurationHours} hours.`
                  : undefined
              }
            >
              <input
                className={inputClass}
                type="number"
                min={1}
                max={data?.maxDurationHours ?? 365 * 24}
                value={durationHours}
                onChange={(event) => setDurationHours(event.target.value)}
              />
            </Field>
            <Field label="Visitor name" hint="Shown to the guard when the code is verified.">
              <input
                className={inputClass}
                value={visitorName}
                onChange={(event) => setVisitorName(event.target.value)}
                maxLength={120}
                placeholder="e.g. Chinedu Okafor"
                required
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field
              label="Visitor authentication"
              hint="The guard will ask the visitor to present this for verification. For car plate, the guard checks the plate shown on arrival."
            >
              <select
                className={inputClass}
                value={authenticationType}
                onChange={(event) =>
                  setAuthenticationType(event.target.value as AccessCodeAuthenticationType)
                }
              >
                {AUTHENTICATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={() => void generate()} disabled={generating}>
              {generating ? 'Generating…' : 'Generate code'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Codes list */}
      <Card>
        <CardHeader
          title="Your codes"
          subtitle="Only the first four characters are shown for reference."
        />
        <CardBody>
          {codes.length === 0 ? (
            <EmptyState
              title="No access codes yet"
              body="Generate a code above to give a visitor or contractor access."
            />
          ) : (
            <ul className="space-y-2">
              {codes.map((code) => (
                <CodeRow
                  key={code.id}
                  code={code}
                  propertyLabel={(() => {
                    const property = properties.find((item) => item.id === code.propertyId);
                    return property
                      ? `${property.estate.name} · ${property.identifier}`
                      : 'Property';
                  })()}
                  busy={busyCodeId === code.id}
                  onExtend={() => void extend(code)}
                  onDeactivate={() => void deactivate(code)}
                />
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
      <KeyRound aria-hidden size={20} className="text-(--color-primary)" />
      <h1 className="text-lg font-semibold text-(--color-ink)">Access Codes</h1>
    </div>
  );
}

function CodeRow({
  code,
  propertyLabel,
  busy,
  onExtend,
  onDeactivate,
}: {
  code: ResidentAccessCodeDto;
  propertyLabel: string;
  busy: boolean;
  onExtend: () => void;
  onDeactivate: () => void;
}) {
  const isActive = code.status === 'ACTIVE';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200/80 px-3 py-2">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{code.codePrefix}••••</span>
          <Badge tone={statusTone(code.status)}>{code.status}</Badge>
          <span className="text-xs text-(--color-ink-muted)">{kindLabel(code.kind)}</span>
          <Countdown validUntil={code.validUntil} status={code.status} />
        </div>
        <p className="mt-0.5 text-xs text-(--color-ink-muted)">
          {propertyLabel} · {code.propertyId ? code.propertyId.slice(0, 8) : 'Unassigned'}
        </p>
        <p className="mt-0.5 text-xs text-(--color-ink-muted)">
          {code.visitorName ? `Visitor: ${code.visitorName}` : 'Visitor details not recorded'}
          {code.carPlate ? ` · ${code.carPlate}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-(--color-ink-muted)">
          {code.validUntil ? `Valid until ${formatShortDate(code.validUntil)}` : 'No expiry'}
          {code.revokedAt ? ` · deactivated ${formatShortDate(code.revokedAt)}` : ''}
          {` · Guard verifies: ${authenticationTypeLabel(code.authenticationType)}`}
        </p>
      </div>
      {isActive && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={onExtend}>
            <TimerReset aria-hidden size={13} className="mr-1" />
            Extend
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDeactivate}>
            <Ban aria-hidden size={13} className="mr-1" />
            Deactivate
          </Button>
        </div>
      )}
    </li>
  );
}

function statusTone(status: ResidentAccessCodeDto['status']) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'REVOKED') return 'danger' as const;
  return 'neutral' as const;
}

function kindLabel(kind: AccessCodeKind): string {
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function authenticationTypeLabel(type: AccessCodeAuthenticationType): string {
  return AUTHENTICATION_OPTIONS.find((option) => option.value === type)?.label ?? type;
}
