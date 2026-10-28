# Operator Console — Phase 0: Foundation

**Status:** Complete
**Scope:** Phase 0 only. No resident, billing, gate, facilities, SOS, settings, or
audit-log feature work in this step.

## Objective

Lay the shared foundation for the remaining operator console modules without changing
any existing property, estate, resident, or resident-portal behavior.

Phase 0 delivers:

- the operator permission catalogue used by Phases 1–9;
- the audit event/target catalogue used by Phases 1–9;
- a central operator navigation registry;
- reusable operator UI primitives;
- stable query-key conventions;
- tests that pin the permission and audit contracts.

## Non-goals

- No new operator pages or routes.
- No API endpoints for messages, complaints, invoices, gate verification, facilities,
  bookings, SOS, administrators, or settings.
- No database changes beyond additive audit enum values.
- No module switches or feature flags.
- No changes to the typed property model or the `propertyOptions` retirement.
- No new session cache. React Query remains the only client cache.

## Existing foundation

The operator console already has:

- authentication, session handling, and RBAC;
- estates and typed properties;
- resident onboarding registration, payment confirmation, and deletion;
- user account administration (list, role, status, delete);
- the dashboard KPI/property/activity shell;
- an audit route at `/app/activity` with `audit.read`.

The resident portal already owns the self-scoped flows for messages, complaints,
finance, access codes, facilities, bookings, SOS, and notifications. Later phases add
operator-side services over those tables; they do not rebuild the resident flows.

## Permission catalogue

Add the operator capabilities below to `packages/shared/src/permissions.ts`.

| Capability          | Purpose                                |
| ------------------- | -------------------------------------- |
| `complaint.read`    | Read the complaint queue               |
| `complaint.manage`  | Reply to complaints and change status  |
| `message.read`      | Read the operator message inbox        |
| `message.manage`    | Reply to and close message threads     |
| `sos.read`          | Read SOS alerts                        |
| `sos.manage`        | Acknowledge and resolve SOS alerts     |
| `facility.read`     | Read facilities and bookings           |
| `facility.manage`   | Create, edit, and archive facilities   |
| `booking.read`      | Read the booking queue                 |
| `booking.manage`    | Confirm, cancel, and complete bookings |
| `verification.read` | Read gate verification logs            |

Role baseline policy:

- `SUPER_ADMIN`: all capabilities.
- `ESTATE_ADMIN`: all operator capabilities except `organization.manage` and
  `config.manage`, plus `user.manage` (existing behavior).
- `AUDITOR`: add the new read capabilities to the existing read-only baseline.
- `GUARD`: unchanged in Phase 0. SOS/gate policy is decided when those modules ship.
- `RESIDENT`: unchanged. No operator capability leaks into the resident role.

The server remains authoritative. The web uses the same catalogue only to hide or show
navigation and actions.

## Audit catalogue

Add the event types below to `packages/shared/src/auth-contract.ts`, the Prisma
`AuditEventType` enum, and the audit repository mapping.

Residents and administrators:

- `resident.updated`
- `resident.archived`
- `resident.restored`
- `resident.access_disabled`
- `resident.access_enabled`
- `user.created`
- `user.sessions_revoked`

Messages and complaints:

- `message.replied`
- `message.thread_closed`
- `message.thread_reopened`
- `complaint.replied`
- `complaint.status_changed`

Billing:

- `invoice.created`
- `invoice.voided`
- `payment.recorded`

Gate access:

- `access_code.revoked`
- `access_code.extended`
- `verification.recorded`

Facilities and bookings:

- `facility.created`
- `facility.updated`
- `facility.archived`
- `booking.confirmed`
- `booking.cancelled`
- `booking.completed`

SOS:

- `sos.acknowledged`
- `sos.resolved`

Platform:

- `settings.updated`
- `audit.exported`

Also add these target types:

`message_thread`, `complaint`, `invoice`, `payment`, `access_code`,
`access_verification`, `facility`, `booking`, `sos_event`, `settings`.

The existing duplicate `resident.payment_recorded` entry in `AUDIT_EVENT_TYPES` must be
removed. Event types and database enum names must stay one-to-one; a test will fail if
the shared catalogue and the database map drift apart.

## Navigation registry

Move the sidebar definitions out of `AppShell.tsx` into
`apps/web/src/navigation.ts`.

- `PRIMARY_NAV` contains Overview, Estates, Properties, Residents, and Users.
- `SETTINGS_NAV` contains Account & password.
- Each item declares its route, label, icon, optional permission, and optional
  `requiresUserManage`.
- Visibility is a pure function, so it can be tested without rendering the shell.
- `sectionLabelForPath()` moves to the registry as well.

Later phases add entries to the registry when their route and permission are real. No
dead links are added in Phase 0.

## Query-key conventions

Add `apps/web/src/api/query-keys.ts` with stable key factories for:

- dashboard KPIs and activity;
- house types;
- estates and estate detail;
- properties and property detail;
- users and user filters;
- residents;
- audit activity;
- future operator messages, complaints, invoices, payments, codes, verifications,
  facilities, bookings, SOS, and administrators.

Existing pages keep their equivalent literal keys. New modules use the factory, and
existing screens migrate as they are touched. This avoids a risky, unrelated cache
refactor in Phase 0.

## Operator UI primitives

Add `apps/web/src/components/operator.tsx`:

- `OperatorPageHeader` — icon, title, description, actions.
- `FilterBar` — consistent filter/search row with optional summary and actions.
- `DataTable<T>` — typed columns, mobile horizontal scroll, loading/empty/error states.
- `DetailDrawer` — right-side scrollable detail panel with Escape/overlay close.
- `StatusBadge` — uses the existing `Badge` tones and `statusTone()` mapping.

These compose the existing `ui.tsx` primitives. No new visual system is introduced.

## Files

- `plans/operator-console-phase-0.md`
- `packages/shared/src/permissions.ts`
- `packages/shared/src/auth-contract.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/contracts.test.ts`
- `apps/api/src/modules/audit/audit-repository.ts`
- `apps/api/src/operator-foundation.test.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20261103000000_operator_audit_catalogue/migration.sql`
- `apps/web/src/navigation.ts`
- `apps/web/src/navigation.test.ts`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/components/operator.tsx`
- `apps/web/src/components/operator.test.tsx`
- `apps/web/src/api/query-keys.ts`
- `apps/web/src/api/query-keys.test.ts`
- `apps/web/src/api/hooks.ts`
- `apps/web/src/components/DashboardWidgets.tsx`

## Verification

- `npx prisma validate --schema prisma/schema.prisma`
- `npx prisma generate --schema prisma/schema.prisma`
- `npm run build:packages`
- `npm run typecheck`
- `npm run test`
- `npm run lint`
- `npm run format:check`
- `npm run build`

The audit migration is additive. It can be applied to production later with
`npm run db:deploy`; Phase 0 does not require a production deploy.

### Results

- Prisma schema validation and client generation pass.
- Shared tests: 25 passed.
- API tests: 265 passed across 26 files.
- Web tests: 28 passed across 10 files.
- Typecheck, lint, format check, and production build pass.
- The migration remains pending by design; no production database was changed.

## Rollback

Phase 0 is additive:

- revert the permission and audit-catalogue changes;
- revert the navigation registry and shell refactor;
- delete the new query-key and operator UI files;
- leave the additive audit enum migration unapplied or roll it back with a new
  migration that does not remove existing data.

No existing table, route, or resident-portal behavior is modified.

## Next phases

1. Residents management
2. Administrators
3. SOS Alerts
4. Messages & Complaints
5. Payments & Invoices
6. Access Codes & Verification Logs
7. Facilities & Bookings
8. Settings
9. Audit Logs + Dashboard completion
