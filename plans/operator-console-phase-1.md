# Operator Console — Phase 1: Residents Management

**Status:** Implemented and verified
**Scope:** The existing `/app/residents` surface only. No messages, billing, gate,
facilities, SOS, administrators, settings, or audit-log feature work in this step.

## Objective

Turn the resident register from a register/pay/delete screen into a usable
operator record, without duplicating the resident portal or changing the
onboarding ownership model.

Phase 1 delivers:

- operator edit of the admin-owned resident fields;
- soft archive and restore;
- portal-access enable/disable for the linked resident account;
- safe deletion: only records without a linked portal account;
- active, pending, complete and archived filters on the Residents screen;
- server-side organization scoping for every resident mutation;
- audit events for edit, archive, restore, access disable and access enable.

## Non-goals

- No resident profile fields become operator-owned. Gender, marital status,
  next of kin, ID document and the resident's own phone remain resident-owned.
- No second resident portal and no duplicate resident-owned queries.
- No hard delete of residents with a portal account, invoices, payments or
  other history. Archive is the reversible path.
- No change to the typed property model, property identifiers, React Query
  session cache, header Refresh behavior, or the 30-second API config cache.
- No module switches. The Residents route keeps its existing `user.manage`
  authorization and `user.manage` server guard.

## Database

Migration: `20261103001000_resident_archive`

- `resident_onboardings.archived_at TIMESTAMPTZ(6)` nullable.
- Index on `(organization_id, archived_at)`.

The row and its history remain. Archive does not touch the linked `User` row;
portal access is a separate action.

## API

All routes remain under `/api/v1/onboard` and require `user.manage`:

| Method   | Route                          | Behavior                                      |
| -------- | ------------------------------ | --------------------------------------------- |
| `GET`    | `/residents`                   | List every draft, including archived records. |
| `PATCH`  | `/residents/:id`               | Edit first name, email, phone, property.      |
| `POST`   | `/residents/:id/archive`       | Soft archive; onboarding code stops working.  |
| `POST`   | `/residents/:id/restore`       | Clear `archived_at`.                          |
| `POST`   | `/residents/:id/portal-access` | Set the linked account to ACTIVE/DISABLED.    |
| `POST`   | `/residents/:id/payment`       | Existing admin payment confirmation.          |
| `DELETE` | `/residents/:id`               | Delete only when no `userId` is linked.       |

Behavior details:

- Every mutation resolves the record and rejects a record from another
  organization as `404`.
- Archived codes are excluded from guest lookup, so a shared code cannot resume
  onboarding after archive. Restore makes the same code valid again.
- Editing a completed resident updates the linked user's email and name too.
  Email is required while an account exists and must stay unique in the
  organization.
- Disabling portal access sets `User.status = DISABLED`. Login and every
  authenticated route already reject non-`ACTIVE` users, so existing sessions
  are denied on their next request.
- Archive deliberately does not enable or disable portal access.
- The dashboard resident count excludes archived records.
- Property reassignment applies to future billing only; existing invoices keep
  their original property.

## Contracts and UI

Shared contracts:

- `ResidentOnboardingDto.archivedAt`
- `ResidentOnboardingDto.accountStatus`
- `AdminUpdateResidentInput`
- `AdminSetResidentPortalAccessInput`
- `ResidentMutationResponse`

Residents screen:

- Active / pending / complete / archived / all filters and search.
- Edit modal reusing the existing estate + property picker cache.
- Archive, restore, portal enable/disable and delete actions on each card.
- Details view shows record and portal status.
- Delete is hidden when a linked account exists; the API also enforces it.

## Audit

Emitted through the Phase 0 catalogue:

- `resident.updated` (changed field names and property)
- `resident.archived`
- `resident.restored`
- `resident.access_disabled`
- `resident.access_enabled`
- `resident.deleted` (existing hard-delete path)

No secrets, passwords, onboarding codes or document URLs are written to audit
metadata.

## Verification

- API integration tests cover edit, archive/restore, archived-code rejection,
  pending delete, linked-account delete refusal, portal disable, existing-session
  denial, portal re-enable, and linked-account email sync.
- Shared, API and web test suites pass.
- Typecheck, lint, format check, Prisma validate/generate and production build
  pass.
- Migration applied to the local test database and verified against the schema.

## Rollback

- Revert the API, shared-contract and web changes.
- Leave `archived_at` in place (nullable and unused by the reverted code) or add
  a later migration that drops it. Never drop resident rows to roll back.
- The additive index is safe to leave in place.
