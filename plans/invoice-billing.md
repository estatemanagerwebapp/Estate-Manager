# Invoice Creation and Part Payments

**Status:** Implemented and verified
**Scope:** Operator invoice creation form, resident/operator payments, and the
finance aggregates that depend on them.

## Create invoice

The form now follows the estate workflow:

1. **Bill name** — e.g. "Security levy" (new `invoices.title` column).
2. **Period** — e.g. "2026-11" or "Q4 2026".
3. **Due date**.
4. **Estate** — chosen first.
5. **Resident** — the list is limited to that estate and is searchable by name,
   email or property, then selected.

The server checks the estate/resident pair rather than trusting the client: a
resident whose property is not in the selected estate is rejected with
`400 VALIDATION_ERROR — Resident is not in the selected estate`. The invoice,
its audit row (`invoice.created`, now carrying the title and estate) and the
resident notification are written as before.

## Part payments

Invoices may now receive more than one payment. The new
`PrismaFinanceRepository.applyInvoicePayment` runs in one transaction:

1. `SELECT … FOR UPDATE` on the invoice row, so two concurrent payments cannot
   both claim the same balance.
2. Sum the payments already recorded.
3. Reject a void/settled invoice, a non-positive amount, or an amount above the
   remaining balance (with the remaining amount in the message).
4. Insert the `Payment`, update the invoice (`PAID` only when the cumulative
   payments cover the amount) and write both ledger entries.

Both paths use it:

- **Operator** — `POST /invoices/:id/payments` now takes `amountKobo`; the modal
  defaults to the outstanding balance and accepts a smaller amount.
- **Resident** — `POST /resident/payments` accepts an optional `amountKobo`;
  omitting it pays the remaining balance. The resident pay form shows the
  amount field and defaults it to the outstanding balance.

Overpayment is rejected rather than silently trimmed, so the recorded amount
always matches the money received.

## Money display

- `OperatorInvoiceDto`: `title`, `paidKobo`, `outstandingKobo`, `paymentCount`.
- `ResidentInvoiceDto`: `title`, `paidKobo`, `outstandingKobo`.
- A part-paid invoice stays `UNPAID` (or `OVERDUE` when past due) and shows
  "₦X paid · ₦Y remaining"; the operator drawer renders the same split.
- The resident finance page now includes **OVERDUE** invoices in the
  outstanding list (previously only `UNPAID`).
- Operator dashboard outstanding, resident dashboard outstanding and the
  organisation summary subtract payments: the aggregate is the sum of
  `amount - paid`, not the sum of invoice totals (one grouped SQL aggregate, so
  the 5-second sync poll stays cheap).

## Migration

`20261103009000_invoice_title`

```sql
ALTER TABLE "invoices" ADD COLUMN "title" VARCHAR(160) NOT NULL DEFAULT '';
UPDATE "invoices" SET "title" = "period" WHERE "title" = '';
```

Applied with `prisma migrate deploy`; `prisma migrate status` reports the
database up to date and the column is present (existing rows backfilled with
their period).

## Verification

- `operator-billing.test.ts` (11 passed) covers: invoice creation with title and
  estate context, estate/resident mismatch, a 1,000,000 part payment leaving
  1,500,000 outstanding, overpayment rejection, settlement on the second
  payment (two payment rows), resident-visible totals, resident part payment,
  duplicate-payment rejection, the two-payment race, voiding and cross-org
  isolation.
- `resident-finance` and `resident-dashboard`: 15 passed.
- Operator dashboard (including the new outstanding aggregate): 16 passed.
- Web: 93 tests, typecheck, lint, format and production build pass.
- API build, Prisma validate and schema/migration checks pass.

## Rollback

- Revert the service/repository changes and the `amountKobo` inputs; the
  previous single-payment behaviour allowed only one payment per invoice.
- Drop `invoices.title` with a later migration if the column is not wanted.
- No payments or ledger rows were rewritten; existing rows remain valid.
