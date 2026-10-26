import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Copy, Check, Plus, TimerReset, Ban } from 'lucide-react';
import type {
  ResidentAccessCodeDto,
  AccessCodeKind,
} from '@silverstone/shared';
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

const KIND_OPTIONS: Array<{ value: AccessCodeKind; label: string }> = [
  { value: 'ENTRY', label: 'Entry' },
  { value: 'EXIT', label: 'Exit' },
  { value: 'BOTH', label: 'Entry & exit' },
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
  const [codes, setCodes] = useState<ResidentAccessCodeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<AccessCodeKind>('ENTRY');
  const [durationDays, setDurationDays] = useState('30');
  const [generating, setGenerating] = useState(false);

  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [busyCodeId, setBusyCodeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.getResidentCodes();
      setCodes(data.codes);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Could not load your access codes.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const days = Number.parseInt(durationDays, 10);
      const response = await api.generateResidentAccessCode({
        kind,
        durationDays: Number.isFinite(days) && days > 0 ? days : undefined,
      });
      // The full code is returned exactly once — show it now.
      setIssuedCode(response.code);
      setCopied(false);
      toast.success('Access code generated.');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Could not generate an access code.',
      );
      toast.error('Could not generate an access code.');
    } finally {
      setGenerating(false);
    }
  }

  async function extend(code: ResidentAccessCodeDto) {
    setBusyCodeId(code.id);
    setError(null);
    try {
      await api.extendResidentAccessCode(code.id);
      toast.success('Code validity extended.');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Could not extend the code.',
      );
      toast.error('Could not extend the code.');
    } finally {
      setBusyCodeId(null);
    }
  }

  async function deactivate(code: ResidentAccessCodeDto) {
    setBusyCodeId(code.id);
    setError(null);
    try {
      await api.deactivateResidentAccessCode(code.id);
      toast.success('Code deactivated.');
      await load();
    } catch (err) {
      setError(
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

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

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
          subtitle="Codes are valid for 30 days by default and can be extended or deactivated at any time."
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Field label="Valid for (days)">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={365}
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
              />
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
  busy,
  onExtend,
  onDeactivate,
}: {
  code: ResidentAccessCodeDto;
  busy: boolean;
  onExtend: () => void;
  onDeactivate: () => void;
}) {
  const isActive = code.status === 'ACTIVE';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200/80 px-3 py-2">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{code.codePrefix}••••</span>
          <Badge tone={statusTone(code.status)}>{code.status}</Badge>
          <span className="text-xs text-(--color-ink-muted)">{kindLabel(code.kind)}</span>
        </div>
        <p className="mt-0.5 text-xs text-(--color-ink-muted)">
          {code.validUntil
            ? `Valid until ${formatDate(code.validUntil)}`
            : 'No expiry'}
          {code.revokedAt ? ` · deactivated ${formatDate(code.revokedAt)}` : ''}
        </p>
      </div>
      {isActive && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onExtend}
          >
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
