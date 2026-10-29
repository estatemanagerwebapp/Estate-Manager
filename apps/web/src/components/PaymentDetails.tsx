import type { BankTransferDetailsDto } from '@silverstone/shared';

/**
 * Bank-transfer instructions shown on onboarding and resident invoices.
 * The estate office controls this block from Settings; residents never see a
 * half-configured account because the API validates the three required fields
 * together.
 */
export function PaymentDetailsPanel({
  details,
  heading = 'Pay by bank transfer',
}: {
  details: BankTransferDetailsDto | null;
  heading?: string;
}) {
  if (!details) return null;

  const rows: Array<[string, string]> = [];
  for (const [label, value] of [
    ['Bank', details.bankName],
    ['Account name', details.accountName],
    ['Account number', details.accountNumber],
    ['Sort code', details.sortCode],
  ] as const) {
    if (value !== null && value.trim().length > 0) rows.push([label, value]);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
        {heading}
      </p>
      {rows.length > 0 && (
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="text-xs text-(--color-ink-muted)">{label}</dt>
              <dd className="font-medium text-(--color-ink)">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {details.instructions && (
        <p className="mt-3 whitespace-pre-line border-t border-slate-200 pt-3 text-xs text-(--color-ink-muted)">
          {details.instructions}
        </p>
      )}
    </div>
  );
}
