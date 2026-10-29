import { useMemo, useState, type ChangeEvent } from 'react';
import { Download, FileSpreadsheet, FileUp, LoaderCircle, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ORG_IMPORT_SHEETS,
  type OrgImportBatchDto,
  type OrgImportRowDto,
  type OrgImportSheet,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useApiQuery } from '../../api/query';
import { queryKeys } from '../../api/query-keys';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { useConfirm } from '../../components/dialog';
import { DataTable, OperatorPageHeader, StatusBadge } from '../../components/operator';
import { Button, EmptyState, InfoBanner } from '../../components/ui';

/**
 * Organization-level data import.
 *
 * One multi-sheet workbook onboards estates, properties, facilities, resident
 * onboarding drafts, and opening invoices. Uploads are previewed first and
 * committed in one transaction. Resident rows never create accounts; billing
 * rows target residents who already have an active account.
 */
export function OrgImportsPage() {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const canImport = can['import.manage'];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: listData,
    loading,
    error: listError,
    refresh: refreshList,
  } = useApiQuery(
    queryKeys.orgImports.all,
    () => api.listOrgImportBatches(),
    'Could not load import batches.',
  );
  const batches = listData?.batches ?? [];

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    setUploading(true);
    setActionError(null);
    try {
      const preview = await api.uploadOrgImport(file);
      toast.success(
        `Workbook previewed — ${preview.batch.counts.valid} valid, ${preview.batch.counts.error + preview.batch.counts.collision + preview.batch.counts.duplicateInFile} problem rows.`,
      );
      setSelectedId(preview.batch.id);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orgImports.all,
        refetchType: 'none',
      });
      await refreshList();
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not preview the workbook.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const blob = await api.downloadOrgImportTemplate();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'silverstone-organization-import-template.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('Organization import template downloaded.');
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError ? err.message : 'Could not download the template.',
      );
    }
  }

  async function handleCommit(batch: OrgImportBatchDto) {
    const ok = await confirm({
      title: `Commit ${batch.filename}?`,
      body: `Creates ${batch.counts.valid} valid row(s) across estates, properties, facilities, resident onboarding drafts, and invoices in one transaction. Existing records are not overwritten. This cannot be undone from the UI.`,
      danger: true,
    });
    if (!ok) return;

    try {
      const result = await api.commitOrgImport(batch.id);
      toast.success(
        `Committed — ${result.created.estates} estates, ${result.created.properties} properties, ${result.created.facilities} facilities, ${result.created.residents} resident drafts, ${result.created.invoices} invoices.`,
      );
      for (const key of [
        queryKeys.orgImports.all,
        ['estates'],
        ['properties'],
        ['residents'],
        ['facilities'],
        ['invoices'],
        ['dashboard'],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key, refetchType: 'none' });
      }
      await refreshList();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not commit the batch.');
    }
  }

  return (
    <div className="space-y-5 px-5 py-5">
      <OperatorPageHeader
        icon={<FileSpreadsheet aria-hidden size={20} />}
        title="Data import"
        description="Onboard an organization from one preview-first Excel workbook."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void handleDownloadTemplate()}>
              <Download aria-hidden size={13} />
              Template
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refreshList()}>
              <RefreshCw aria-hidden size={13} />
              Refresh
            </Button>
            {canImport && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-(--radius-control) bg-(--color-primary) px-3 py-2 text-xs font-medium text-white hover:opacity-90">
                {uploading ? (
                  <>
                    <LoaderCircle aria-hidden size={13} className="animate-spin" />
                    Previewing…
                  </>
                ) : (
                  <>
                    <FileUp aria-hidden size={13} />
                    Upload workbook
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={uploading}
                  onChange={(event) => void handleUpload(event)}
                  className="sr-only"
                  aria-label="Upload organization import workbook"
                />
              </label>
            )}
          </>
        }
      />

      <InfoBanner tone="info">
        Uploads are previewed before anything is written. Commit order is Estates → Properties →
        Facilities → Residents → Billing. Residents become onboarding drafts; billing rows create
        unpaid invoices for residents who already have an active account.
      </InfoBanner>

      {actionError && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h2 className="text-sm font-semibold text-(--color-ink)">Recent workbooks</h2>
            <p className="text-xs text-(--color-ink-muted)">
              {batches.length} batch{batches.length === 1 ? '' : 'es'} in this organization.
            </p>
          </div>
          <BatchTable
            batches={batches}
            loading={loading}
            error={listError}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRetry={() => void refreshList()}
          />
        </section>

        <section>
          {selectedId ? (
            <BatchDetailPanel
              batchId={selectedId}
              onCommit={handleCommit}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="rounded-(--radius-card) border border-slate-200/80 bg-white p-4 shadow-(--shadow-card)">
              <EmptyState
                title="Select a workbook"
                body="Choose a batch to review per-sheet counts and row-level errors before committing."
              />
            </div>
          )}
        </section>
      </div>

      {dialog}
    </div>
  );
}

function BatchTable({
  batches,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
}: {
  batches: OrgImportBatchDto[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (batchId: string) => void;
  onRetry: () => void;
}) {
  return (
    <DataTable
      columns={[
        {
          key: 'file',
          header: 'Workbook',
          cell: (batch) => (
            <div>
              <p className="text-sm font-medium text-(--color-ink)">{batch.filename}</p>
              <p className="text-[11px] text-(--color-ink-muted)">
                {new Date(batch.uploadedAt).toLocaleString()}
              </p>
            </div>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (batch) => <StatusBadge status={batch.status} />,
        },
        {
          key: 'counts',
          header: 'Rows',
          cell: (batch) => (
            <div className="text-xs text-(--color-ink-muted)">
              <p>
                {batch.counts.total} total · {batch.counts.valid} valid · {batch.counts.created}{' '}
                created
              </p>
              <p>
                {batch.counts.error} errors · {batch.counts.collision} collisions ·{' '}
                {batch.counts.duplicateInFile} duplicates
              </p>
            </div>
          ),
        },
        {
          key: 'action',
          header: '',
          align: 'right',
          cell: (batch) => (
            <Button
              variant={selectedId === batch.id ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onSelect(batch.id)}
            >
              Review
            </Button>
          ),
        },
      ]}
      rows={batches}
      getRowKey={(batch) => batch.id}
      caption="Organization import batches"
      loading={loading}
      error={error}
      onRetry={onRetry}
      emptyTitle="No workbooks uploaded"
      emptyBody="Download the template, fill the sheets, and upload the workbook to preview it."
    />
  );
}

function BatchDetailPanel({
  batchId,
  onCommit,
  onClose,
}: {
  batchId: string;
  onCommit: (batch: OrgImportBatchDto) => Promise<void>;
  onClose: () => void;
}) {
  const [sheetFilter, setSheetFilter] = useState<OrgImportSheet | 'ALL'>('ALL');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const { data, loading, error, refresh } = useApiQuery(
    queryKeys.orgImports.detail(batchId),
    () => api.getOrgImportBatch(batchId),
    'Could not load the batch.',
  );

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.filter((row) => {
      if (sheetFilter !== 'ALL' && row.sheet !== sheetFilter) return false;
      if (onlyProblems && (row.status === 'VALID' || row.status === 'CREATED')) return false;
      return true;
    });
  }, [data, sheetFilter, onlyProblems]);
  const visible = filtered.slice(0, 500);

  const batch = data?.batch ?? null;
  const isPreviewed = batch?.status === 'PREVIEWED';

  async function commit() {
    if (!batch) return;
    setCommitting(true);
    setCommitError(null);
    try {
      await onCommit(batch);
      await refresh();
    } catch (err) {
      setCommitError(err instanceof ApiRequestError ? err.message : 'Could not commit the batch.');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-(--color-ink)">
            {batch?.filename ?? 'Loading batch…'}
          </h2>
          <p className="text-xs text-(--color-ink-muted)">
            {batch
              ? `${batch.counts.total} rows · ${batch.counts.valid} valid · ${batch.counts.created} created`
              : 'Loading row results…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCw aria-hidden size={13} />
            Refresh
          </Button>
          {isPreviewed && (
            <Button size="sm" onClick={() => void commit()} disabled={committing}>
              {committing ? 'Committing…' : 'Commit batch'}
            </Button>
          )}
        </div>
      </div>

      {commitError && (
        <p role="alert" className="mx-4 mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {commitError}
        </p>
      )}

      {batch && (
        <div className="grid grid-cols-2 gap-2 border-b border-slate-200/80 p-4 sm:grid-cols-5">
          {ORG_IMPORT_SHEETS.map((sheet) => {
            const counts = batch.counts.sheets[sheet];
            return (
              <div key={sheet} className="rounded-md border border-slate-200/80 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)">
                  {sheet}
                </p>
                <p className="mt-1 text-sm font-medium text-(--color-ink)">{counts.total} rows</p>
                <p className="text-[11px] text-(--color-ink-muted)">
                  {counts.created} created ·{' '}
                  {counts.error + counts.collision + counts.duplicateInFile} problems
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 px-4 py-3">
        <label className="text-xs text-(--color-ink-muted)">
          Sheet{' '}
          <select
            className="ml-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-(--color-ink)"
            value={sheetFilter}
            onChange={(event) => setSheetFilter(event.target.value as OrgImportSheet | 'ALL')}
          >
            <option value="ALL">All sheets</option>
            {ORG_IMPORT_SHEETS.map((sheet) => (
              <option key={sheet} value={sheet}>
                {sheet}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-(--color-ink-muted)">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(event) => setOnlyProblems(event.target.checked)}
          />
          Only problem rows
        </label>
        <span className="text-xs text-(--color-ink-muted)">
          Showing {visible.length} of {filtered.length} row{filtered.length === 1 ? '' : 's'}
          {filtered.length > visible.length ? ' (first 500)' : ''}
        </span>
      </div>

      <div className="max-h-[32rem] overflow-auto">
        {loading ? (
          <p className="flex items-center gap-2 p-4 text-xs text-(--color-ink-muted)" role="status">
            <LoaderCircle aria-hidden size={13} className="animate-spin" /> Loading row results…
          </p>
        ) : error ? (
          <p role="alert" className="p-4 text-xs text-rose-700">
            {error}
          </p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-xs text-(--color-ink-muted)">No rows match this filter.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-(--color-ink-muted)">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Sheet
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Row
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Reference
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Errors
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row: OrgImportRowDto) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-2 text-(--color-ink-muted)">{row.sheet}</td>
                  <td className="px-3 py-2 text-(--color-ink-muted)">{row.rowNumber}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-(--color-ink)">{row.reference}</td>
                  <td className="px-3 py-2 text-(--color-ink-muted)">
                    {row.errors.length > 0 ? row.errors.join('; ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
