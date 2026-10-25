import { useCallback, useEffect, useState } from 'react';
import { FileUp, Download, LoaderCircle, RefreshCw, Plus } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { EstateDto, ImportBatchDto, ImportRowDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { useConfirm } from '../../components/dialog';
import { Button, Badge, statusTone, EmptyState, InfoBanner } from '../../components/ui';
import { PropertyRegisterModal } from '../properties/PropertyRegisterModal';

/**
 * Imports surface for an estate: bulk-upload an .xlsx workbook through the
 * preview → commit flow, download the server-generated template, and review
 * past import batches with their row-level results.
 *
 * Permissions: reading batches and the template is `estate.read`;
 * uploading and committing is `property.manage` (the API is authoritative —
 * the UI only hides the buttons). Archived estates cannot receive new
 * properties, so the upload control is disabled when the estate is archived.
 */
export function ImportsTab({
  estate,
  onPropertiesChanged,
}: {
  estate: EstateDto;
  onPropertiesChanged?: () => void;
}) {
  const can = useCan();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const canUpload = can['property.manage'] && estate.status === 'ACTIVE';
  const canCommit = can['property.manage'];

  const [batches, setBatches] = useState<ImportBatchDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ImportBatchDto | null>(null);

  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const body = await api.listImportBatches(estate.id);
      setBatches(body.batches);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load import batches.');
    } finally {
      setLoading(false);
    }
  }, [estate.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    // Clear the input up front so the operator can re-select the same
    // file after an error; the `File` reference is already held locally.
    input.value = '';
    setUploading(true);
    setError(null);
    try {
      const preview = await api.uploadImport(estate.id, file, file.name);
      toast.success(
        `Upload previewed — ${preview.batch.counts.valid} valid, ${preview.batch.counts.error} errors.`,
      );
      if (preview.configDrift) {
        toast.info(
          preview.guidance ?? 'Configuration has changed since upload; review before committing.',
        );
      }
      setSelected(preview.batch);
      void load();
      onPropertiesChanged?.();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'CONFLICT') {
        setError(`Configuration conflict: ${err.message}`);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Upload failed.');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const blob = await api.downloadImportTemplate(estate.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `properties-${estate.slug}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded.');
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError ? err.message : 'Could not download the template.',
      );
    }
  }

  async function handleCommit(batch: ImportBatchDto) {
    const ok = await confirm({
      title: `Commit ${batch.filename}?`,
      body: `Creates ${batch.counts.valid} properties in one transaction. This action cannot be undone from the UI.`,
      danger: true,
    });
    if (!ok) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await api.commitImport(batch.id);
      toast.success(`Committed ${result.createdPropertyIds.length} properties.`);
      setSelected(null);
      void load();
      onPropertiesChanged?.();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'CONFLICT') {
        setError(`Cannot commit — ${err.message}`);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Commit failed.');
      }
    } finally {
      setCommitting(false);
    }
  }

  const archived = estate.status === 'ARCHIVED';

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-(--color-ink-muted)">
          <FileUp aria-hidden size={14} />
          {uploading ? (
            <span className="inline-flex items-center gap-1.5">
              <LoaderCircle aria-hidden size={13} className="animate-spin" /> Uploading…
            </span>
          ) : (
            'Upload .xlsx'
          )}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!canUpload || uploading}
            onChange={(event) => void handleUpload(event)}
            className="block"
            aria-label="Upload import workbook"
          />
        </label>
        <Button variant="ghost" size="sm" onClick={() => void handleDownloadTemplate()}>
          <Download aria-hidden size={13} />
          Template
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          <RefreshCw aria-hidden size={13} />
          Refresh
        </Button>
        {canUpload && (
          <Button size="sm" onClick={() => setRegisterOpen(true)}>
            <Plus aria-hidden size={13} />
            Register property
          </Button>
        )}
      </div>

      {archived && (
        <div className="mt-3">
          <InfoBanner tone="warning">
            This estate is archived — new imports are not accepted. Existing batches remain
            readable.
          </InfoBanner>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4">
        {loading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-(--color-ink-muted)" role="status">
            <LoaderCircle aria-hidden size={14} className="animate-spin" />
            Loading import batches…
          </p>
        ) : !batches || batches.length === 0 ? (
          <EmptyState
            title="No import batches yet"
            body={
              canCommit
                ? 'Upload an .xlsx workbook to preview rows, then commit to register properties in bulk.'
                : 'Import batches will appear here once an upload is processed.'
            }
          />
        ) : (
          <BatchList
            batches={batches}
            selected={selected}
            onSelect={setSelected}
            onCommit={(batch) => void handleCommit(batch)}
            committing={committing}
            canCommit={canCommit}
          />
        )}
      </div>

      {dialog}

      {registerOpen && (
        <PropertyRegisterModal
          estate={estate}
          onClose={() => setRegisterOpen(false)}
          onCreated={(property) => {
            setRegisterOpen(false);
            toast.success(`Property ${property.identifier} registered.`);
            void load();
            onPropertiesChanged?.();
          }}
        />
      )}
    </div>
  );
}

// --- Batch list + detail ------------------------------------------------------

function BatchList({
  batches,
  selected,
  onSelect,
  onCommit,
  committing,
  canCommit,
}: {
  batches: ImportBatchDto[];
  selected: ImportBatchDto | null;
  onSelect: (batch: ImportBatchDto | null) => void;
  onCommit: (batch: ImportBatchDto) => void;
  committing: boolean;
  canCommit: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200/80 bg-(--color-surface) text-xs text-(--color-ink-muted)">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                File
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Counts
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Uploaded
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((batch) => (
              <tr
                key={batch.id}
                className={`cursor-pointer hover:bg-(--color-surface) ${
                  selected?.id === batch.id ? 'bg-(--color-surface)' : ''
                }`}
                onClick={() => onSelect(batch)}
              >
                <td className="px-4 py-2.5">
                  <p className="text-xs font-medium text-(--color-ink)">{batch.filename}</p>
                  <p className="text-[11px] text-(--color-ink-muted)">
                    config v{batch.configVersion}
                    {batch.configDrift ? ' · drift' : ''}
                  </p>
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={statusTone(batch.status)}>{batch.status}</Badge>
                </td>
                <td className="px-4 py-2.5 text-xs text-(--color-ink-muted)">
                  {batch.counts.valid} valid · {batch.counts.error} errors
                  {batch.counts.collision > 0 ? ` · ${batch.counts.collision} collisions` : ''}
                  {batch.counts.duplicateInFile > 0
                    ? ` · ${batch.counts.duplicateInFile} duplicate in file`
                    : ''}
                  {batch.counts.created > 0 ? ` · ${batch.counts.created} created` : ''}
                </td>
                <td className="px-4 py-2.5 text-xs text-(--color-ink-muted)">
                  {new Date(batch.uploadedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        {selected ? (
          <BatchDetail
            batch={selected}
            onCommit={() => onCommit(selected)}
            committing={committing}
            canCommit={canCommit}
            onBack={() => onSelect(null)}
          />
        ) : (
          <p className="flex items-center gap-2 p-4 text-sm text-(--color-ink-muted)" role="status">
            Select a batch to see its row-level results.
          </p>
        )}
      </div>
    </div>
  );
}

function BatchDetail({
  batch,
  onCommit,
  committing,
  canCommit,
  onBack,
}: {
  batch: ImportBatchDto;
  onCommit: () => void;
  committing: boolean;
  canCommit: boolean;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<ImportRowDto[] | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRows() {
      setRowsLoading(true);
      setRowsError(null);
      try {
        const body = await api.getImportBatch(batch.id);
        if (!cancelled) setRows(body.rows);
      } catch (err) {
        if (!cancelled) {
          setRowsError(err instanceof ApiRequestError ? err.message : 'Could not load batch rows.');
        }
      } finally {
        if (!cancelled) setRowsLoading(false);
      }
    }
    void loadRows();
    return () => {
      cancelled = true;
    };
  }, [batch.id]);

  const isPreviewed = batch.status === 'PREVIEWED';

  return (
    <div className="rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)">
      <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-(--color-ink)">{batch.filename}</p>
          <p className="text-[11px] text-(--color-ink-muted)">
            {batch.counts.total} rows · {batch.counts.valid} valid · {batch.counts.error} errors
            {batch.counts.collision > 0 ? ` · ${batch.counts.collision} collisions` : ''}
            {batch.counts.duplicateInFile > 0
              ? ` · ${batch.counts.duplicateInFile} duplicate in file`
              : ''}
            {batch.counts.created > 0 ? ` · ${batch.counts.created} created` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
          {canCommit && isPreviewed && (
            <Button size="sm" onClick={onCommit} disabled={committing}>
              {committing ? 'Committing…' : 'Commit batch'}
            </Button>
          )}
        </div>
      </div>

      {batch.configDrift && (
        <div className="px-4 pt-3">
          <InfoBanner tone="warning">
            The configuration has advanced since this batch was validated. Re-upload against the
            current configuration before committing.
          </InfoBanner>
        </div>
      )}

      <div className="p-4">
        {rowsLoading ? (
          <p className="flex items-center gap-2 text-xs text-(--color-ink-muted)" role="status">
            <LoaderCircle aria-hidden size={13} className="animate-spin" /> Loading row results…
          </p>
        ) : rowsError ? (
          <p role="alert" className="text-xs text-rose-700">
            {rowsError}
          </p>
        ) : rows && rows.length > 0 ? (
          <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200/80">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-(--color-surface) text-[11px] text-(--color-ink-muted)">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Worksheet row
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Errors
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-(--color-ink-muted)">{row.rowNumber}</td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-(--color-ink-muted)">
                      {row.errors.length > 0 ? row.errors.join('; ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-(--color-ink-muted)">
            No persisted row results for this batch.
          </p>
        )}
      </div>
    </div>
  );
}
