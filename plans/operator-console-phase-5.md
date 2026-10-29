# Operator Console — Phase 5: Manual Billing

**Status:** Implemented and verified
**Scope:** The operator invoice queue and manual payment history only. No
gate, facilities, settings, SOS, or audit-log feature work in this step.

## Objective

Give the estate office a staff-only billing surface for issuing invoices,
voiding an unpaid invoice, and recording a payment received out of band. The
resident portal keeps its existing self-scoped finance view and payment route.

Phase 5 delivers:

- a staff-only `/app/billing` page with invoice and payment views;
- invoice search, status filters and a detail drawer with resident/property
  context;
- manual invoice creation for a resident;
- full-payment recording with method, reference and payment date;
- voiding an unpaid invoice with a confirmation step;
- server-side `billing.read`, `billing.manage` and `payment.verify`
  enforcement;
- audit events for invoice creation, invoice voiding and payment recording.

## Non-goals

- No payment-provider integration (Paystack, Flutterwave, Stripe or similar).
- No partial payments, instalments, refunds, credit notes or recurring
  invoices.
- No resident portal redesign. `GET /resident/finance` and
  `POST /resident/payments` stay self-scoped and keep their response shapes.
- No second invoice/payment/transaction model and no duplicate resident-owned
  queries.
- No billing settings screen and no changes to the registration-fee seed.

## Decisions

- Payments are recorded manually by staff. The provider is deliberately
  absent; recording a payment treats the invoice as settled in full.
- An invoice may only be voided while it is unpaid and has no payment rows.
  Paid or already-voided invoices return `409`.
- Recording a payment is only allowed on an unpaid, non-voided invoice with no
  existing payment. A duplicate payment attempt returns `409`.
- Recording a payment writes the same resident-visible `PAYMENT` credit and
  `INVOICE` settlement debit used by the existing resident finance flow.
  Residents therefore see the invoice and its settlement without a new
  resident query.
- Staff actors are recorded on the invoice creator, voider and payment
  recorder columns. All actor references are nullable and `onDelete: SetNull`
  so deleting a staff account does not delete financial history.
- Invoice property context comes from the resident's completed onboarding
  property. Missing onboarding leaves `property: null`; it does not block
  billing.
- Overdue is derived for display: a stored `OVERDUE` invoice is overdue, and a
  stored `UNPAID` invoice past `dueAt` is shown as overdue. The `OVERDUE`
  filter matches both stored `OVERDUE` rows and past-due `UNPAID` rows.
- Cross-organization resident, invoice and payment lookups are
  indistinguishable from missing rows and return `404`.
- React Query remains the only client cache. New list keys use the existing
  query-key registry; mutations refresh the active lists. No polling is added;
  staff use the header Refresh button.

## Database

Migration: `20261103004000_operator_billing`

- `invoices.created_by_id UUID NULL` → `users(id)` with `SET NULL`.
- `invoices.voided_at TIMESTAMPTZ(6) NULL`.
- `invoices.voided_by_id UUID NULL` → `users(id)` with `SET NULL`.
- `payments.recorded_by_id UUID NULL` → `users(id)` with `SET NULL`.
- Indexes on `invoices(created_by_id)`, `invoices(voided_by_id)` and
  `payments(recorded_by_id)`.

Existing invoices and payments remain valid with null provenance. The
migration is additive and does not backfill or rewrite financial rows.

The migration is applied to the local test database and the production
database. Production is at 36 migrations.

## API

Mounted at `/api/v1/invoices` and `/api/v1/payments`, organization-scoped:

| Method | Route                           | Permission       | Behavior                                        |
| ------ | ------------------------------- | ---------------- | ----------------------------------------------- |
| `GET`  | `/invoices`                     | `billing.read`   | Invoice queue with resident/property context    |
| `POST` | `/invoices`                     | `billing.manage` | Issue a manual invoice for a resident           |
| `POST` | `/invoices/:invoiceId/void`     | `billing.manage` | Void an unpaid invoice                          |
| `POST` | `/invoices/:invoiceId/payments` | `payment.verify` | Record a full manual payment and settle invoice |
| `GET`  | `/payments`                     | `billing.read`   | Manual payment history with recorder context    |

Filters:

- invoices: `status=UNPAID|PAID|OVERDUE|VOID`, `limit=1..200` (default 100)
- payments: `limit=1..200` (default 100)

Behavior details:

- `POST /invoices` validates the resident in the active organization, uses the
  onboarding property, trims the period and requires a positive safe-integer
  amount. It returns `201`.
- `POST /invoices/:id/payments` records the full invoice amount. The method is
  one of `CASH`, `BANK_TRANSFER`, `POS`, `CHEQUE`, `OTHER`; the reference is
  optional and capped at 120 characters. It returns `201`.
- A recorded payment flips the invoice to `PAID` and writes both ledger
  transactions. The response includes the saved payment and updated invoice.
- `POST /invoices/:id/void` sets `VOID`, records `voidedAt` and the actor, and
  returns `200`. Paid, already-voided or paid-in-part invoices return `409`.
- Malformed ids are rejected as `400` before reaching the database.
- Invalid status filters and limits return `400`.
- The operator invoice DTO includes resident, property, creator, voider and
  derived overdue context. The payment DTO includes resident, property and
  recorder context.
- The resident finance route remains self-scoped. It can list and pay an
  operator-issued invoice through the existing flow.

## Contracts and UI

Shared contracts:

- `OPERATOR_PAYMENT_METHODS` / `OperatorPaymentMethod`
- `OperatorInvoiceDto`
- `OperatorInvoicesResponse`
- `OperatorCreateInvoiceInput`
- `OperatorInvoiceResponse`
- `OperatorRecordPaymentInput`
- `OperatorPaymentDto`
- `OperatorPaymentsResponse`
- `OperatorRecordPaymentResponse`

Billing screen:

- Sidebar item gated on `billing.read`; route protected on the same
  permission.
- Invoice / payment tabs with count and summary cards for outstanding amount,
  invoices in view and recorded payments.
- Invoice views: all, unpaid, paid, overdue and void.
- Search across resident, email, phone, property, period, status and amount.
- Invoice table with a side drawer showing amount, resident, property, due
  date, issuer and void provenance.
- New-invoice modal for a resident with completed onboarding; amount is
  entered in naira and converted to kobo by the shared money helpers.
- Record-payment modal for the full amount with method, optional reference and
  payment date.
- Void action with confirmation; only shown with `billing.manage`.
- Payment history table with resident, invoice period, property, amount,
  method, reference and recorder.
- Payment recording is render-gated on `payment.verify`; read-only users keep
  the invoice and payment history visible.

## Audit

Emitted through the Phase 0 catalogue:

- `invoice.created`
- `invoice.voided`
- `payment.recorded`

The actor is the staff member who performed the action. Metadata records the
resident, property, period, amount and relevant payment reference. No resident
contact details or free-form notes are copied into audit metadata.

## Verification

- Shared tests: 26 passed across 2 files.
- API tests: 300 passed across 29 files.
- Web tests: 47 passed across 15 files.
- Config tests: 22 passed.
- API integration tests cover unauthenticated access, resident denial,
  auditor read-only access, invoice creation with resident/property context,
  derived overdue filtering, organization scoping, malformed ids, invalid
  filters, full payment settlement, ledger entries, duplicate payments,
  voiding, paid-invoice rejection, concurrent payment settlement, audit actors and resident visibility.
- Web helper tests cover invoice view filters, status labels and tones,
  derived overdue display, property/resident context and invoice/payment
  search.
- Typecheck, lint, format check, Prisma validate/generate and the production
  build pass.
- Migration applied to the local test database and verified against the
  schema.
- Migration applied to the production database; schema is up to date at 36
  migrations.

## Rollback

- Revert the API, shared-contract, web and navigation changes.
- Leave the additive invoice/payment provenance columns and indexes in place,
  or add a later migration that drops them. Do not delete invoice, payment or
  transaction rows.
- The migration is safe to leave applied; the reverted code simply ignores the
  new columns.
