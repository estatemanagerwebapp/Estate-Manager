# Organization Data Import

**Status:** Implemented
**Scope:** One organization-level `.xlsx` workbook that onboards estates, properties,
facilities, resident onboarding drafts, and opening invoices. No new resident portal
surface and no changes to the existing estate-scoped property importer.

## Objective

Give a new or migrating organization one preview-first import surface instead of
entering the same data through five separate screens. The workbook is relational:
properties reference an estate slug, residents reference an estate + property
identifier, and invoices reference an existing active resident email.

## Workbook

Sheets, in commit order:

1. `Estates` — `slug`, `name`, `address`, `status`
2. `Properties` — `estate_slug`, `type`, `house_type`, `street_name`,
   `house_number`, `block_name`, `floor_number`, `unit_number`, `plot_number`,
   `plot_name`, `name`, `status`
3. `Facilities` — `estate_slug`, `name`, `description`, `bookable`,
   `usage_fee_naira`
4. `Residents` — `estate_slug`, `property_identifier`, `first_name`, `email`,
   `phone`
5. `Billing` — `resident_email`, `property_identifier`, `period`,
   `amount_naira`, `due_date`, `status`

The template also contains `Instructions` and `Reference` sheets. The
`Reference` sheet lists the active house types and existing estate slugs so the
operator can copy valid values.

## Rules

- Preview first: upload parses and validates every row, writes a batch + rows,
  and creates no domain records.
- Commit is one transaction, ordered Estates → Properties → Facilities →
  Residents → Billing.
- Create-only. Existing estate slugs, property identifiers, facility names,
  resident emails, and invoice keys are reported as collisions. Existing
  records are never overwritten.
- Residents are created as **onboarding drafts** only. They complete their
  profile, upload an ID document, and pay through the existing flow. Imported
  residents do not get user accounts or passwords.
- Billing creates **unpaid invoices** for residents who already have an active
  account. It does not record payments, mark invoices paid, or create accounts.
- Billing rows cannot reference residents created as drafts in the same
  workbook. The template instructions say so explicitly.
- Estates and properties may include an optional `status`; new rows default to
  `ACTIVE`. Properties cannot be added to an archived estate.
- Amounts in the workbook are naira; the API stores integer kobo.
- CSV/Excel formula-looking values are treated as text; no formula evaluation.
- One fingerprint per organization prevents re-importing the same file. A
  terminal batch cannot be uploaded again.

## Permissions and audit

- New capability `import.manage`, granted to `SUPER_ADMIN` and `ESTATE_ADMIN`
  by the default role baselines.
- Every import endpoint requires `import.manage` server-side.
- Preview, completion and commit failure reuse the existing `import.previewed`,
  `import.completed`, and `import.commit_failed` audit events with
  `scope: "organization"` metadata. No database audit-enum change.

## API

Mounted at `/api/v1/org-imports`:

- `GET /template` — generated workbook.
- `POST /` — upload + preview (`multipart/form-data`, field `file`).
- `GET /` — recent batches.
- `GET /:batchId` — batch + row results.
- `POST /:batchId/commit` — commit a `PREVIEWED` batch.

## UI

- New `Data import` navigation entry at `/app/imports`, gated on
  `import.manage`.
- Template download, upload, batch history, per-sheet summary, row-level errors,
  and commit confirmation.
- The existing estate-level imports tab is unchanged.

## Non-goals

- No update/upsert mode.
- No deletion, rollback, or retention UI.
- No payments/paid invoices, access codes, complaints, messages, bookings, or
  SOS imports.
- No resident account creation or temporary passwords.
- No new audit event enum values.
- No changes to the existing estate-scoped property import behavior.

## Verification

- `npm run check` passes: Prettier, ESLint, all workspace typechecks, shared/API/web
  tests, and the production builds.
- `apps/api/src/org-import.test.ts` covers the generated template, full
  preview/commit, in-file duplicates, collisions and cross-reference errors,
  resident-draft-only billing rejection, unpaid invoices for active residents,
  and permission denial.
- `apps/web/src/pages/imports/OrgImportsPage.test.tsx` covers the empty state and
  row-level problem review, and `navigation.test.ts` covers the `import.manage`
  gate.
- Migration `20261029141655_organization_data_import` creates the batch/row
  tables; `20261029150000_organization_import_batch_org_fk` adds the organization
  cascade foreign key.
