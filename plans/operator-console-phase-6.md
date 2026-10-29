# Operator Console — Phase 6: Gate Access

**Status:** Implemented and verified
**Scope:** Gate access-code inspection and verification history only. No
facilities, bookings, billing, settings, SOS, or audit-log feature work in this
step.

## Objective

Give guards a working gate-verification surface and give the estate office a
read-only register of resident access codes plus an append-only verification
history. The resident portal keeps full ownership of creating, extending and
revoking codes.

Phase 6 delivers:

- a staff/guard `/app/gate` page with a verification log and access-code
  register;
- a verify-code workflow for `ENTRY` and `EXIT` gates;
- a recorded outcome for every attempt, including denials;
- server-side `gate.read`, `gate.manage` and `verification.read` enforcement;
- an `verification.recorded` audit event for each attempt;
- derived `ACTIVE`/`EXPIRED`/`REVOKED` access-code status.

## Non-goals

- No KYC, identity-document, proof-of-address or visitor verification. In this
  console, "verification" means a gate/access-code attempt.
- No code creation, extension or revocation for staff. Those remain resident
  actions on `/resident/codes`.
- No guard mobile app and no hardware gate-controller integration.
- No email, SMS, WhatsApp or push notification for verification attempts.
- No resident portal redesign and no duplicate resident-owned code queries.
- No module switch work; that belongs to Phase 8.

## Decisions

- A verification is an attempt by a signed-in guard or operator to validate a
  resident's code at `ENTRY` or `EXIT`.
- Every well-formed attempt is recorded, whether granted or denied. Denials
  carry one of `NOT_FOUND`, `REVOKED`, `EXPIRED` or `WRONG_DIRECTION`.
- Codes are hashed with SHA-256. Verification hashes the presented value and
  looks it up inside the active organization. The full code and its hash are
  never returned to staff or copied into the history.
- History stores only a short code prefix for display. An unknown-code attempt
  stores the first four characters of the presented value; no full value is
  retained.
- Inputs are trimmed and uppercased before hashing, so a resident can present
  lower-case characters without failing verification.
- A code is valid when it is stored `ACTIVE`, is not past `validUntil`, and its
  kind is `BOTH` or matches the requested gate direction.
- `ACTIVE` codes past `validUntil` are displayed and filtered as `EXPIRED`
  without mutating the stored row.
- Access codes remain resident-owned. The operator register is read-only and
  never exposes the hash.
- Permissions:
  - `gate.read` — view the organization-wide access-code register;
  - `gate.manage` — verify a code and record an attempt;
  - `verification.read` — view verification history.
- The `GUARD` baseline now includes `verification.read` alongside `gate.read`
  and `gate.manage`, so a guard can review the history they produce. Auditors
  keep read-only access and cannot record attempts.
- Resident, property, code and guard references on history rows are nullable
  and `onDelete: SetNull`, so deleting an account does not erase the audit
  trail.
- React Query remains the only client cache. New keys are registered under
  `access-codes` and `verifications`; mutations refresh both lists. No polling
  is added; staff use the header Refresh button or the page Refresh action.

## Database

Migration: `20261103005000_operator_gate`

- New `access_verifications` table:
  - `id`, `organization_id`, `access_code_id`, `resident_id`, `property_id`,
    `verified_by_id`;
  - `gate` (`ENTRY`/`EXIT`), `outcome` (`GRANTED`/`DENIED`);
  - `reason` (`NOT_FOUND`/`REVOKED`/`EXPIRED`/`WRONG_DIRECTION`, null when
    granted);
  - `code_prefix` and `occurred_at`.
- Foreign keys:
  - organization → `CASCADE`;
  - access code, resident, property and verifier → `SET NULL`.
- Indexes:
  - `access_codes(organization_id, code_hash)` for organization-scoped hash
    lookup;
  - `access_verifications(organization_id, occurred_at DESC)`;
  - access code, resident and verifier indexes for history joins.

The migration is additive. Existing access codes keep their existing hash,
status and validity rows.

## API

Mounted at `/api/v1/access-codes` and `/api/v1/verifications`,
organization-scoped:

| Method | Route            | Permission          | Behavior                             |
| ------ | ---------------- | ------------------- | ------------------------------------ |
| `GET`  | `/access-codes`  | `gate.read`         | Read-only access-code register       |
| `GET`  | `/verifications` | `verification.read` | Verification history                 |
| `POST` | `/verifications` | `gate.manage`       | Verify a code and append the attempt |

Filters:

- access codes: `status=ACTIVE|EXPIRED|REVOKED`, `kind=ENTRY|EXIT|BOTH`,
  `limit=1..200` (default 100);
- verifications: `outcome=GRANTED|DENIED`, `gate=ENTRY|EXIT`,
  `limit=1..200` (default 100).

Behavior details:

- `GET /access-codes` returns the resident and property context plus kind,
  prefix, derived status and validity window. It never selects `codeHash`.
- `GET /verifications` returns newest first with resident, property, verifier,
  gate, outcome, reason, prefix and timestamp.
- `POST /verifications` validates a non-empty code up to 32 characters and an
  `ENTRY`/`EXIT` direction. It returns `201` with the saved attempt.
- Unknown codes and wrong-organization codes are recorded as `DENIED` /
  `NOT_FOUND` without revealing whether a code exists elsewhere.
- Malformed bodies and invalid filters return `400`.
- Resident sessions receive `403` on all three routes.
- Auditors can read both lists but cannot record an attempt.

## Contracts and UI

Shared contracts:

- `ACCESS_VERIFICATION_GATES` / `AccessVerificationGate`
- `ACCESS_VERIFICATION_OUTCOMES` / `AccessVerificationOutcome`
- `ACCESS_VERIFICATION_REASONS` / `AccessVerificationReason`
- `OperatorAccessCodeDto`, `OperatorAccessCodesResponse`
- `AccessVerificationDto`, `AccessVerificationsResponse`
- `OperatorVerifyAccessCodeInput`, `OperatorVerifyAccessCodeResponse`

Gate screen:

- Sidebar item "Gate access" gated on `verification.read`; route protected on
  the same permission.
- Verification log tab with time, resident, property, gate, result, denial
  reason, code prefix and verifier.
- Result and gate filters plus search across resident, property, prefix,
  result, reason and guard.
- Access-code tab, shown only with `gate.read`, with resident, property,
  direction, prefix, derived status, validity and issue date.
- Status filter and search across the register.
- "Verify code" modal with gate direction, code input and an inline
  granted/denied result that includes resident, property, prefix and time.
- Read-only users keep both lists visible and lose only the verify action.
- Summary cards for grants today, denials today and active codes.

## Audit

`verification.recorded` is emitted for every attempt through the Phase 0
catalogue, targeting `access_verification`.

Metadata records the gate, result, reason, access-code id, resident id and
property id. It never contains the presented code or its hash. The actor is the
guard or operator who performed the check.

## Verification

- Shared tests: 26 passed across 2 files.
- API tests: 307 passed across 30 files.
- Web tests: 53 passed across 16 files.
- Config tests: 22 passed.
- API integration tests cover unauthenticated access, resident denial,
  auditor read-only behavior, guard verification, case/whitespace
  normalization, granted/denied outcomes, revoked/expired/wrong-direction/
  not-found reasons, organization scoping, derived access-code filters,
  access-code kind filtering, invalid filters, audit actor/target and history
  filtering.
- Web helper tests cover view filters, derived expiry, status/result labels
  and tones, denial reasons, resident/property fallbacks, and search.
- Typecheck, lint, format check, Prisma validate/generate and the production
  build pass.
- Migration applied to the local test database and the production database;
  both are up to date at 37 migrations.

## Rollback

- Revert the API, shared-contract, web and navigation changes.
- Leave the additive access-code index and `access_verifications` table in
  place, or add a later migration that drops them. Do not delete audit or
  verification rows.
- The reverted code simply ignores the new table and index.
