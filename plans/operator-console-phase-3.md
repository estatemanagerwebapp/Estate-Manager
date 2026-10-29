# Operator Console — Phase 3: SOS Alerts

**Status:** Implemented and verified
**Scope:** The operator SOS queue only. No messages, complaints, billing, gate,
facilities, settings, or audit-log feature work in this step.

## Objective

Give guards and estate administrators an operational queue for resident SOS
alerts without adding an external paging provider or changing the resident
portal's self-scoped alert surface.

Phase 3 delivers:

- a staff-only `/app/sos` queue;
- 15-second in-app polling while the screen is open;
- acknowledge and resolve actions with a strict lifecycle;
- recorded acknowledging/resolving staff actors;
- an internal resolution note that residents never see;
- active/status filters, search and resident/property contact context;
- server-side `sos.read` / `sos.manage` enforcement on every route;
- audit events for both transitions.

## Non-goals

- No email, SMS, WhatsApp, push or external paging integration. The queue is
  in-app only.
- No resident portal changes. `GET/POST /resident/sos` stays self-scoped and
  unchanged.
- No reopen path. `RESOLVED` is terminal.
- No second alert table, no duplicate resident-owned queries.
- No module switch in this phase.

## Decisions

- Guards and estate administrators may acknowledge and resolve. Auditors may
  read the queue only. Residents cannot call the operator routes.
- `GUARD` baseline permissions now include `sos.read` and `sos.manage`.
- Acknowledgement is required before resolution. Duplicate transitions return
  `409`.
- The acknowledging and resolving staff members are stored separately. Both
  foreign keys are nullable with `onDelete: SetNull`, so deleting a staff
  account preserves the alert history.
- The resolution note is internal: it is stored on the alert but omitted from
  the resident-facing `SosEventDto`.
- Residents see only status and timestamps, as before.

## Database

Migration: `20261103002000_sos_resolution`

- `sos_events.acknowledged_by_id UUID NULL` → `users(id)` with `SET NULL`.
- `sos_events.resolved_by_id UUID NULL` → `users(id)` with `SET NULL`.
- `sos_events.resolution_note VARCHAR(500) NULL`.
- Existing `(organization_id, status)` queue index remains.
- Single-column indexes on `acknowledged_by_id` and `resolved_by_id`.
- Named relations `SosAcknowledgedBy` and `SosResolvedBy` avoid ambiguity with
  the existing resident relation.

Existing alerts remain valid; the new columns are null until a transition
occurs.

## API

Mounted at `/api/v1/sos`, organization-scoped, with `sos.read` on the queue and
`sos.manage` on mutations:

| Method | Route                  | Permission   | Behavior                                      |
| ------ | ---------------------- | ------------ | --------------------------------------------- |
| `GET`  | `/sos`                 | `sos.read`   | Queue with resident/property context.         |
| `POST` | `/sos/:id/acknowledge` | `sos.manage` | `RAISED` → `ACKNOWLEDGED`; records the actor. |
| `POST` | `/sos/:id/resolve`     | `sos.manage` | `ACKNOWLEDGED` → `RESOLVED`; optional note.   |

Queue filters:

- `status=RAISED|ACKNOWLEDGED|RESOLVED`
- `active=true|false` — active means `RAISED` or `ACKNOWLEDGED`
- `limit=1..200` (default 100), newest first

Behavior details:

- Every mutation resolves the alert within the caller's organization; another
  organization's alert is `404`.
- Malformed alert ids are rejected as `400` before reaching the database.
- Resolution before acknowledgement, duplicate acknowledgement and duplicate
  resolution all return `409`.
- `resolutionNote` is trimmed; more than 500 characters returns `400`.
- The response DTO includes `resident`, `property`, `acknowledgedBy`,
  `resolvedBy` and `resolutionNote` for staff.

## Contracts and UI

Shared contracts:

- `SosOperatorResidentDto`
- `SosOperatorPropertyDto`
- `SosOperatorActorDto`
- `SosOperatorEventDto`
- `OperatorSosEventsResponse`
- `OperatorResolveSosInput`
- `OperatorSosMutationResponse`

SOS screen:

- Sidebar item gated on `sos.read`.
- Active / all / raised / acknowledged / resolved views.
- Search across resident, contact, property and notes.
- Raised alerts use a high-contrast danger treatment; acknowledged alerts use
  warning; resolved alerts are neutral/success.
- Acknowledge is one click; resolve opens a modal for the internal note.
- Auto-refresh every 15 seconds, plus the existing header refresh.

React Query remains the only client cache. The SOS queue uses a registered
query key; mutations refetch the active filter after success.

## Audit

Emitted through the Phase 0 catalogue:

- `sos.acknowledged`
- `sos.resolved`

The actor is the staff member who performed the transition. Metadata records
the alert id and the previous/new status; the internal note is not copied into
audit metadata.

## Verification

- Shared tests: 26 passed across 2 files.
- API tests: 282 passed across 27 files.
- Web tests: 35 passed across 12 files.
- API integration tests cover unauthenticated access, malformed ids, guard read
  access, auditor read-only access, resident denial, resident/property context,
  active and status filters, lifecycle enforcement, actor persistence,
  resolution-note validation, audit events and organization scoping.
- Shared tests cover the updated `GUARD` baseline.
- Web tests cover navigation gating, queue filters, labels and search.
- Typecheck, lint, format check, Prisma validate/generate and production build
  pass.
- Migration applied to the local test database and verified against the schema.

## Rollback

- Revert the API, shared-contract, web and navigation changes.
- Leave the additive SOS columns and indexes in place, or add a later migration
  that drops them. Do not delete alert rows.
- The migration is safe to leave applied; the reverted code simply ignores the
  new columns.
