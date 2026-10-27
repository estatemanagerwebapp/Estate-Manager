import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Save, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { PropertyOptionsView, UpdatePropertyOptionsRequest } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  InfoBanner,
  Field,
  inputClass,
} from '../../components/ui';

/**
 * Property-options screen (read + edit).
 *
 * The read view (`property.read`) shows the active config block: identifier
 * template, address components, asset/unit type catalogues and the current
 * `configVersion`. Editing requires `config.manage` (SUPER_ADMIN in the
 * default matrix) and uses optimistic concurrency: the PUT carries the
 * `baseVersion` the form was loaded with.
 *
 * Stale-version handling (per the approved requirement): when the API
 * returns a 409 `CONFLICT` because the active version advanced past the
 * caller's `baseVersion`, the caller's *edits are preserved*. "Reload"
 * refetches the latest configuration (keeping the user's unsaved form
 * values separately), and "Re-apply" resubmits the same edits against the
 * latest version — clearly informing the user that the configuration may
 * have changed underneath. The form fields are never wiped on conflict.
 */

// The editable subset of the property-options block, mirroring
// `UpdatePropertyOptionsRequest.propertyOptions`.
type AddressComponentDraft =
  UpdatePropertyOptionsRequest['propertyOptions']['addressComponents'][number];

interface FormDraft {
  addressComponents: AddressComponentDraft[];
  identifierTemplate: string;
  identifierMax: number;
}

export function PropertyOptionsPage() {
  const can = useCan();
  const toast = useToast();
  const canEdit = can['config.manage'];

  const [view, setView] = useState<PropertyOptionsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The version the form was loaded from — sent back as `baseVersion`.
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);

  // Conflict state: preserved edits + the latest reloaded view.
  const [conflict, setConflict] = useState<{
    message: string;
    latest: PropertyOptionsView;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const body = await api.getPropertyOptions();
      setView(body);
      setBaseVersion(body.configVersion);
      setDraft(emptyDraft(body));
      setConflict(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiRequestError ? err.message : 'Could not load property options.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyView(body: PropertyOptionsView, replace: boolean) {
    setView(body);
    setBaseVersion(body.configVersion);
    // On a "reload" after a conflict, keep the user's existing draft (their
    // unsaved edits) — only build a fresh draft when there is none yet.
    if (replace) setDraft(emptyDraft(body));
  }

  async function handleSubmit() {
    if (!draft || baseVersion === null) return;
    setSubmitting(true);
    setConflict(null);
    try {
      const result = await api.updatePropertyOptions({
        baseVersion,
        propertyOptions: {
          addressComponents: draft.addressComponents,
          identifierTemplate: draft.identifierTemplate,
          identifierMax: draft.identifierMax,
        },
      });
      toast.success(`Saved — configuration advanced to version ${result.configVersion}.`);
      setView(result);
      setBaseVersion(result.configVersion);
      setDraft(emptyDraft(result));
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'CONFLICT') {
        // Preserve the user's edits; fetch the latest so they can re-apply.
        const latest = await api.getPropertyOptions();
        setConflict({ message: err.message, latest });
        setView(latest);
        setBaseVersion(latest.configVersion);
      } else {
        toast.error(
          err instanceof ApiRequestError ? err.message : 'Could not save the configuration.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Re-apply the preserved draft against the latest version. The `draft`
   * still holds the user's edits from before the conflict; only
   * `baseVersion` (now the latest) has changed.
   */
  async function reApply() {
    if (!draft || baseVersion === null) return;
    setSubmitting(true);
    setConflict(null);
    try {
      const result = await api.updatePropertyOptions({
        baseVersion,
        propertyOptions: {
          addressComponents: draft.addressComponents,
          identifierTemplate: draft.identifierTemplate,
          identifierMax: draft.identifierMax,
        },
      });
      toast.success('Re-applied your changes on the latest configuration.');
      setView(result);
      setBaseVersion(result.configVersion);
      setDraft(emptyDraft(result));
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'CONFLICT') {
        const latest = await api.getPropertyOptions();
        setConflict({ message: err.message, latest });
        setView(latest);
        setBaseVersion(latest.configVersion);
      } else {
        toast.error(err instanceof ApiRequestError ? err.message : 'Re-apply failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Discard the user's edits and re-sync the form to the latest view. */
  async function reloadDiscarding() {
    const latest = await api.getPropertyOptions();
    applyView(latest, true);
    setConflict(null);
  }

  const assetLabels = useMemo(
    () => new Map((view?.assetTypes ?? []).map((type) => [type.key, type.label])),
    [view],
  );

  return (
    <div>
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
          <SlidersHorizontal aria-hidden size={20} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Property options</h1>
          <p className="text-sm text-(--color-ink-muted)">
            Address structure, identifier template and the type catalogues.
          </p>
        </div>
      </header>

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-(--color-ink-muted)" role="status">
          <LoaderCircle aria-hidden size={14} className="animate-spin" />
          Loading property options…
        </p>
      ) : loadError ? (
        <p role="alert" className="mt-6 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {loadError}
        </p>
      ) : view ? (
        <div className="mt-6 flex flex-col gap-6">
          <Card aria-label="Configuration summary">
            <CardBody className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-(--color-ink-muted)">Configuration version</p>
                <p className="text-lg font-semibold">{view.configVersion}</p>
              </div>
              <div>
                <p className="text-xs text-(--color-ink-muted)">Identifier template</p>
                <code className="text-sm">{view.identifierTemplate}</code>
              </div>
              <div>
                <p className="text-xs text-(--color-ink-muted)">Identifier readiness</p>
                <Badge tone={view.identifierConfigured ? 'success' : 'warning'}>
                  {view.identifierConfigured ? 'Configured' : 'Not configured'}
                </Badge>
              </div>
            </CardBody>
          </Card>

          {view.addressComponents.length === 0 && (
            <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800" role="note">
              <p className="font-medium">No address components are configured.</p>
              <p className="mt-1 text-xs">
                With the default <code>{view.identifierTemplate}</code> template, every property in
                an estate derives the same identifier — so only one property can be registered per
                estate until address components are configured.
              </p>
            </div>
          )}

          {view.addressComponents.length > 0 && (
            <Card aria-label="Identifier preview">
              <CardHeader
                title="Identifier preview"
                subtitle="Example of the identifier a new property would derive (sample values shown)."
              />
              <CardBody>
                <p className="text-sm text-(--color-ink-muted)">Template</p>
                <code className="mb-2 inline-block rounded bg-slate-100 px-2 py-1 text-xs">
                  {view.identifierTemplate}
                </code>
                <p className="text-sm font-medium">
                  {view.identifierTemplate.replace(
                    /\{([a-z][a-z0-9_]{0,47})\}/gi,
                    (_whole, token: string) =>
                      token === 'estate_slug'
                        ? 'sample-estate'
                        : view.addressComponents.find((component) => component.key === token)?.key
                          ? 'sample'
                          : '',
                  )}
                </p>
              </CardBody>
            </Card>
          )}

          <TypeCatalogues view={view} />

          {canEdit ? (
            <Card aria-label="Edit property options">
              <CardHeader
                title="Edit configuration"
                subtitle="Changes create a new configuration version. Saving is optimistic — a conflict preserves your edits."
                actions={
                  <Button size="sm" onClick={() => void load()}>
                    <RefreshCw aria-hidden size={13} />
                    Reload
                  </Button>
                }
              />
              <CardBody>
                <div className="mb-4">
                  <InfoBanner tone="info">
                    <p>
                      <strong>Property options read API.</strong> The read endpoint returns the
                      identifier template and length cap, plus each address component&apos;s key,
                      label, required types, length cap, pattern and "not applicable to" list.
                    </p>
                    <p className="mt-1">
                      These values are loaded into the form, so saving without changing them keeps
                      the configured values.
                    </p>
                  </InfoBanner>
                </div>
                {conflict && (
                  <div className="mb-4">
                    <InfoBanner tone="warning">
                      <p>
                        <strong>Configuration changed while you were editing.</strong>{' '}
                        {conflict.message}
                      </p>
                      <p className="mt-1">
                        Your edits are preserved. You can{' '}
                        <strong>re-apply them on the latest version</strong> (the configuration may
                        have changed underneath) or <strong>reload and discard</strong> your
                        changes.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => void reApply()}>
                          Re-apply my changes
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void reloadDiscarding()}>
                          Reload &amp; discard
                        </Button>
                      </div>
                    </InfoBanner>
                  </div>
                )}
                {draft && (
                  <OptionsForm
                    draft={draft}
                    assetLabels={assetLabels}
                    onChange={setDraft}
                    onSubmit={() => void handleSubmit()}
                    onReApply={() => void reApply()}
                    submitting={submitting}
                    showReApply={conflict !== null}
                  />
                )}
              </CardBody>
            </Card>
          ) : (
            <p className="text-xs text-(--color-ink-muted)">
              You can view the configuration but not edit it — editing requires the{' '}
              <code>config.manage</code> capability.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// --- Sub-components -----------------------------------------------------------

function TypeCatalogues({ view }: { view: PropertyOptionsView }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card aria-label="Asset types">
        <CardHeader title="Asset types" />
        <CardBody>
          <ul className="flex flex-col gap-2">
            {view.assetTypes.map((type) => (
              <li key={type.key} className="flex items-center justify-between text-sm">
                <span>
                  {type.label}
                  <span className="ml-2 text-xs text-(--color-ink-muted)">{type.key}</span>
                </span>
                <Badge tone={type.active ? 'success' : 'neutral'}>
                  {type.active ? 'active' : 'inactive'}
                </Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card aria-label="Unit types">
        <CardHeader title="Unit types" />
        <CardBody>
          <ul className="flex flex-col gap-2">
            {view.unitTypes.map((unit) => (
              <li key={unit.key} className="flex items-center justify-between text-sm">
                <span>
                  {unit.label}
                  <span className="ml-2 text-xs text-(--color-ink-muted)">{unit.bedrooms} bed</span>
                </span>
                <Badge tone={unit.active ? 'success' : 'neutral'}>
                  {unit.active ? 'active' : 'inactive'}
                </Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function OptionsForm({
  draft,
  assetLabels,
  onChange,
  onSubmit,
  onReApply,
  submitting,
  showReApply,
}: {
  draft: FormDraft;
  assetLabels: Map<string, string>;
  onChange: (draft: FormDraft) => void;
  onSubmit: () => void;
  onReApply: () => void;
  submitting: boolean;
  showReApply: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Identifier template"
        hint="Available tokens: {estate_slug} and each address component key above. Max length is a hard cap."
      >
        <div className="flex items-center gap-3">
          <input
            className={inputClass}
            value={draft.identifierTemplate}
            onChange={(event) => onChange({ ...draft, identifierTemplate: event.target.value })}
            maxLength={120}
          />
          <label className="flex items-center gap-2 text-xs text-(--color-ink-muted)">
            Max
            <input
              type="number"
              min={8}
              max={200}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-(--color-primary)"
              value={draft.identifierMax}
              onChange={(event) =>
                onChange({ ...draft, identifierMax: Number(event.target.value) || 8 })
              }
            />
          </label>
        </div>
        <p className="mt-1 text-[11px] text-(--color-ink-muted)">
          The read API does not return the current length cap; the value above is applied on save.
        </p>
      </Field>

      <div>
        <h3 className="text-xs font-medium text-(--color-ink-muted)">Address components</h3>
        <p className="mt-1 text-[11px] text-(--color-ink-muted)">
          These define the structured address fields shown on the property register screen and in
          imports. Add or remove components as your identifier needs them.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          {draft.addressComponents.map((component, index) => (
            <AddressComponentEditor
              key={index}
              component={component}
              assetLabels={assetLabels}
              onChange={(next) => {
                const updated = [...draft.addressComponents];
                updated[index] = next;
                onChange({ ...draft, addressComponents: updated });
              }}
              onRemove={() =>
                onChange({
                  ...draft,
                  addressComponents: draft.addressComponents.filter((_, i) => i !== index),
                })
              }
            />
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...draft,
                addressComponents: [
                  ...draft.addressComponents,
                  {
                    key: `component_${draft.addressComponents.length + 1}`,
                    label: `Component ${draft.addressComponents.length + 1}`,
                    requiredFor: [],
                    notApplicableFor: [],
                    maxLength: 64,
                  },
                ],
              })
            }
          >
            Add component
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {showReApply && (
          <Button variant="secondary" onClick={onReApply} disabled={submitting}>
            Re-apply on latest
          </Button>
        )}
        <Button onClick={onSubmit} disabled={submitting}>
          <Save aria-hidden size={14} />
          {showReApply ? 'Save on latest version' : 'Save configuration'}
        </Button>
      </div>
    </div>
  );
}

function AddressComponentEditor({
  component,
  assetLabels,
  onChange,
  onRemove,
}: {
  component: AddressComponentDraft;
  assetLabels: Map<string, string>;
  onChange: (component: AddressComponentDraft) => void;
  onRemove: () => void;
}) {
  function toggle(key: string, list: string[], setter: (next: string[]) => void) {
    setter(list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);
  }

  return (
    <div className="rounded-md border border-slate-200/80 bg-(--color-surface) p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Key">
          <input
            className={inputClass}
            value={component.key}
            onChange={(event) => onChange({ ...component, key: event.target.value })}
            maxLength={48}
          />
        </Field>
        <Field label="Label">
          <input
            className={inputClass}
            value={component.label}
            onChange={(event) => onChange({ ...component, label: event.target.value })}
            maxLength={120}
          />
        </Field>
        <Field label="Max length" hint="1–120 characters.">
          <input
            type="number"
            min={1}
            max={120}
            className={inputClass}
            value={component.maxLength}
            onChange={(event) =>
              onChange({ ...component, maxLength: Number(event.target.value) || 1 })
            }
          />
        </Field>
        <Field label="Pattern (optional)" hint="A simple regular expression the value must match.">
          <input
            className={inputClass}
            value={component.pattern ?? ''}
            onChange={(event) => onChange({ ...component, pattern: event.target.value || null })}
            maxLength={200}
          />
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        <MultiSelect
          label="Required for"
          selected={component.requiredFor}
          onToggle={(key) =>
            toggle(key, component.requiredFor, (next) =>
              onChange({ ...component, requiredFor: next }),
            )
          }
          assetLabels={assetLabels}
        />
        <MultiSelect
          label="Not applicable to"
          selected={component.notApplicableFor}
          onToggle={(key) =>
            toggle(key, component.notApplicableFor, (next) =>
              onChange({ ...component, notApplicableFor: next }),
            )
          }
          assetLabels={assetLabels}
        />
      </div>
      <p className="mt-1 text-[11px] text-(--color-ink-muted)">
        The "not applicable to" list overrides "required for" for the listed asset types.
      </p>
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  selected,
  onToggle,
  assetLabels,
}: {
  label: string;
  selected: string[];
  onToggle: (key: string) => void;
  assetLabels: Map<string, string>;
}) {
  const keys = Array.from(assetLabels.keys());
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-(--color-ink-muted)">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {keys.map((key) => {
          const active = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-(--color-primary-soft) text-(--color-primary)'
                  : 'bg-(--color-surface) text-(--color-ink-muted) hover:bg-slate-100'
              }`}
            >
              {assetLabels.get(key) ?? key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Build an editable draft from the read view (or an empty one). */
function emptyDraft(view: PropertyOptionsView): FormDraft {
  // The read view's address components carry `requiredForLabels` (labels, not
  // keys). The PUT request needs keys. Recover the keys by matching labels
  // back to the asset-type key set; fall back to the raw key if unmatched.
  const labelToKey = new Map(view.assetTypes.map((type) => [type.label, type.key]));
  const template = view.identifierTemplate;
  // If the template is just `{estate_slug}` and the org has address components
  // configured, append a placeholder so every property in that estate gets a
  // distinct identifier.
  const bareEstateSlug = template === '{estate_slug}' && view.addressComponents.length > 0;
  const newTemplate = bareEstateSlug ? `${template}-{{view.addressComponents[0].key}}` : template;
  return {
    identifierTemplate: newTemplate,
    // Recover the configured caps from the read view rather than hardcoding
    // them, so a save without edits round-trips the stored configuration.
    // The `??` fallbacks keep the form usable against an API that predates
    // these fields, and match the configuration schema's own defaults.
    identifierMax: view.identifierMax ?? 120,
    addressComponents: view.addressComponents.map((component) => ({
      key: component.key,
      label: component.label,
      requiredFor: component.requiredForLabels.map((label) => labelToKey.get(label) ?? label),
      notApplicableFor: component.notApplicableFor ?? [],
      pattern: component.pattern ?? null,
      maxLength: component.maxLength ?? 64,
    })),
  };
}
