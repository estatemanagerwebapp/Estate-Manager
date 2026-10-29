import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Phone, Plus, Save, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  SOS_CONTACT_CATEGORIES,
  SOS_CONTACT_CATEGORY_LABELS,
  koboToNaira,
  parseNaira,
  type OrganizationSettingsView,
  type SosContactCategory,
  type SosContactDto,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { queryKeys } from '../api/query-keys';
import { useApiQuery } from '../api/query';
import { useToast } from '../toast/Toast';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorBanner,
  Field,
  LoadingPanel,
  inputClass,
  selectClass,
} from '../components/ui';
import { OperatorPageHeader } from '../components/operator';

interface SettingsDraft {
  feeNaira: string;
  feeDescription: string;
  feeRefundable: boolean;
  codeDurationDays: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  sortCode: string;
  instructions: string;
  contacts: SosContactDto[];
}

function draftFromSettings(settings: OrganizationSettingsView): SettingsDraft {
  const bank = settings.payments.bankTransfer;
  return {
    feeNaira: String(koboToNaira(settings.onboarding.registrationFee.amountKobo)),
    feeDescription: settings.onboarding.registrationFee.description ?? '',
    feeRefundable: settings.onboarding.registrationFee.refundable,
    codeDurationDays: String(settings.accessCodes.defaultDurationDays),
    bankName: bank.bankName ?? '',
    accountName: bank.accountName ?? '',
    accountNumber: bank.accountNumber ?? '',
    sortCode: bank.sortCode ?? '',
    instructions: bank.instructions ?? '',
    contacts: settings.sos.contacts.map((contact) => ({ ...contact })),
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function newContactId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Operational estate settings (Phase 8).
 *
 * This screen deliberately edits only day-to-day operating values: the
 * onboarding fee, the default gate-code window, bank-transfer instructions and
 * emergency contacts. Structural configuration (asset model, property
 * options, module switches) is not exposed here.
 */
export function SettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    data: settings,
    loading,
    error: queryError,
    refresh,
  } = useApiQuery(queryKeys.settings.all, api.getSettings, 'Could not load estate settings.');

  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setDraft(draftFromSettings(settings));
  }, [settings]);

  const error = actionError ?? queryError;

  function updateContact(id: string, patch: Partial<SosContactDto>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            contacts: current.contacts.map((contact) =>
              contact.id === id ? { ...contact, ...patch } : contact,
            ),
          }
        : current,
    );
  }

  function addContact() {
    setDraft((current) =>
      current
        ? {
            ...current,
            contacts: [
              ...current.contacts,
              {
                id: newContactId(),
                label: '',
                phone: '',
                category: 'OTHER',
                notes: null,
                active: true,
                sortOrder: current.contacts.length,
              },
            ],
          }
        : current,
    );
  }

  function removeContact(id: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            contacts: current.contacts
              .filter((contact) => contact.id !== id)
              .map((contact, index) => ({ ...contact, sortOrder: index })),
          }
        : current,
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !settings) return;
    setActionError(null);

    let amountKobo: number;
    try {
      amountKobo = parseNaira(draft.feeNaira);
    } catch {
      setActionError('Enter a valid onboarding fee amount in naira (0 for free).');
      return;
    }

    const duration = Number(draft.codeDurationDays);
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) {
      setActionError('Access-code duration must be a whole number between 1 and 365 days.');
      return;
    }

    const contacts = draft.contacts.map((contact, index) => ({
      ...contact,
      label: contact.label.trim(),
      phone: contact.phone.trim(),
      notes: nullable(contact.notes ?? ''),
      sortOrder: index,
    }));
    if (contacts.some((contact) => contact.label.length === 0 || contact.phone.length === 0)) {
      setActionError('Every emergency contact needs a label and a phone number.');
      return;
    }

    const bankName = nullable(draft.bankName);
    const accountName = nullable(draft.accountName);
    const accountNumber = nullable(draft.accountNumber);
    const bankFields = [bankName, accountName, accountNumber];
    const configuredBankFields = bankFields.filter((value) => value !== null).length;
    if (configuredBankFields > 0 && configuredBankFields < 3) {
      setActionError('Bank name, account name and account number are required together.');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateSettings({
        expectedVersion: settings.version,
        onboarding: {
          registrationFee: {
            amountKobo,
            description: nullable(draft.feeDescription),
            refundable: draft.feeRefundable,
          },
        },
        accessCodes: { defaultDurationDays: duration },
        payments: {
          bankTransfer: {
            bankName,
            accountName,
            accountNumber,
            sortCode: nullable(draft.sortCode),
            instructions: nullable(draft.instructions),
          },
        },
        sos: { contacts },
      });

      queryClient.setQueryData(queryKeys.settings.all, updated);
      setDraft(draftFromSettings(updated));
      await queryClient.invalidateQueries({ queryKey: ['resident'], refetchType: 'none' });
      toast.success('Estate settings saved.');
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not save estate settings.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <OperatorPageHeader
        icon={<Settings2 aria-hidden size={18} className="text-(--color-primary)" />}
        title="Estate settings"
        description="Registration fee, gate-code validity, payment instructions and emergency contacts."
        actions={
          <Button type="submit" form="estate-settings-form" disabled={!draft || saving}>
            <Save aria-hidden size={15} />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={queryError ? refresh : undefined} />}

      {loading && !draft ? (
        <Card>
          <LoadingPanel label="Loading estate settings…" />
        </Card>
      ) : draft ? (
        <form id="estate-settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Onboarding fee"
                subtitle="Charged once before a resident account is activated."
              />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Amount (₦)"
                  hint="Enter 0 to make onboarding free. The API stores kobo."
                >
                  <input
                    className={inputClass}
                    value={draft.feeNaira}
                    onChange={(event) => setDraft({ ...draft, feeNaira: event.target.value })}
                    inputMode="decimal"
                    placeholder="50000"
                  />
                </Field>
                <Field label="Description">
                  <input
                    className={inputClass}
                    value={draft.feeDescription}
                    onChange={(event) => setDraft({ ...draft, feeDescription: event.target.value })}
                    maxLength={160}
                    placeholder="One-off resident registration fee"
                  />
                </Field>
                <label className="flex items-center gap-2 self-end text-sm text-(--color-ink)">
                  <input
                    type="checkbox"
                    checked={draft.feeRefundable}
                    onChange={(event) =>
                      setDraft({ ...draft, feeRefundable: event.target.checked })
                    }
                  />
                  Refundable
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Access codes"
                subtitle="Default validity for newly generated resident gate codes."
              />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Default duration (days)"
                  hint="Residents can request 1–365 days; this is the fallback."
                >
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={365}
                    value={draft.codeDurationDays}
                    onChange={(event) =>
                      setDraft({ ...draft, codeDurationDays: event.target.value })
                    }
                  />
                </Field>
                <div className="flex items-center gap-2 self-end text-xs text-(--color-ink-muted)">
                  <SlidersHorizontal aria-hidden size={14} />
                  Existing codes keep the expiry they were issued with.
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Payment details"
                subtitle="Shown on resident onboarding and unpaid invoices."
              />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label="Bank name">
                  <input
                    className={inputClass}
                    value={draft.bankName}
                    onChange={(event) => setDraft({ ...draft, bankName: event.target.value })}
                    maxLength={120}
                  />
                </Field>
                <Field label="Account name">
                  <input
                    className={inputClass}
                    value={draft.accountName}
                    onChange={(event) => setDraft({ ...draft, accountName: event.target.value })}
                    maxLength={120}
                  />
                </Field>
                <Field label="Account number" hint="10–20 digits.">
                  <input
                    className={inputClass}
                    value={draft.accountNumber}
                    onChange={(event) => setDraft({ ...draft, accountNumber: event.target.value })}
                    inputMode="numeric"
                    maxLength={20}
                  />
                </Field>
                <Field label="Sort code (optional)">
                  <input
                    className={inputClass}
                    value={draft.sortCode}
                    onChange={(event) => setDraft({ ...draft, sortCode: event.target.value })}
                    maxLength={20}
                  />
                </Field>
                <Field label="Instructions (optional)">
                  <textarea
                    className={`${inputClass} min-h-20`}
                    value={draft.instructions}
                    onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
                    maxLength={500}
                    placeholder="Use your invoice reference as the transfer narration."
                  />
                </Field>
                <p className="self-end text-xs text-(--color-ink-muted)">
                  Leave bank name, account name and account number blank to hide this block from
                  residents.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Emergency contacts"
                subtitle="Predefined numbers shown with the SOS action."
                actions={
                  <Button type="button" variant="secondary" size="sm" onClick={addContact}>
                    <Plus aria-hidden size={14} />
                    Add contact
                  </Button>
                }
              />
              <CardBody className="space-y-3">
                {draft.contacts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center">
                    <Phone aria-hidden size={18} className="mx-auto text-(--color-ink-muted)" />
                    <p className="mt-2 text-sm font-medium text-(--color-ink)">
                      No emergency contacts yet
                    </p>
                    <p className="text-xs text-(--color-ink-muted)">
                      Add security, medical or estate-office numbers residents should call.
                    </p>
                  </div>
                ) : (
                  draft.contacts.map((contact, index) => (
                    <div
                      key={contact.id}
                      className="rounded-md border border-slate-200 p-3"
                      aria-label={`Emergency contact ${index + 1}`}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Label">
                          <input
                            className={inputClass}
                            value={contact.label}
                            onChange={(event) =>
                              updateContact(contact.id, { label: event.target.value })
                            }
                            maxLength={80}
                            placeholder="Estate security"
                          />
                        </Field>
                        <Field label="Phone">
                          <input
                            className={inputClass}
                            value={contact.phone}
                            onChange={(event) =>
                              updateContact(contact.id, { phone: event.target.value })
                            }
                            maxLength={32}
                            placeholder="+234 800 000 0000"
                          />
                        </Field>
                        <Field label="Category">
                          <select
                            className={`${selectClass} w-full`}
                            value={contact.category}
                            onChange={(event) =>
                              updateContact(contact.id, {
                                category: event.target.value as SosContactCategory,
                              })
                            }
                          >
                            {SOS_CONTACT_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {SOS_CONTACT_CATEGORY_LABELS[category]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Notes (optional)">
                          <input
                            className={inputClass}
                            value={contact.notes ?? ''}
                            onChange={(event) =>
                              updateContact(contact.id, { notes: event.target.value })
                            }
                            maxLength={200}
                            placeholder="24/7 line"
                          />
                        </Field>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs text-(--color-ink-muted)">
                          <input
                            type="checkbox"
                            checked={contact.active}
                            onChange={(event) =>
                              updateContact(contact.id, { active: event.target.checked })
                            }
                          />
                          Show to residents
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeContact(contact.id)}
                          aria-label={`Remove ${contact.label || 'emergency contact'}`}
                        >
                          <Trash2 aria-hidden size={14} />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save aria-hidden size={15} />
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
