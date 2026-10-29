# Operator Console — Phase 9: Audit Logs + Dashboard Completion

**Status:** Implemented and verified locally
**Scope:** Finish the organisation-wide audit log and turn the overview into an
operational dashboard. No new resident surface and no module rollout changes.

## Objective

Make the audit trail usable for day-to-day operator work, and make the overview
answer two questions at a glance: _what is happening?_ and _what needs
attention?_

Phase 9 delivers:

- a dedicated audit-log API with permission-gated filtering, cursor pagination
  and CSV export;
- a full `/app/activity` screen with filters, event detail and export;
- an Activity navigation entry visible only to roles with `audit.read`;
- an exact 30-day audit-event count instead of a capped list scan;
- a completed overview with permission-scoped operational KPIs and a "Needs
  attention" panel;
- removal of the Phase-0 money-contract demo from the operator overview.

## Non-goals

- No changes to Phases 0–8 behavior.
- No new audit event catalogue entries: `audit.exported` already exists.
- No audit mutation, deletion or retention UI. The log stays append-only.
- No new permission. Export uses the same `audit.read` grant as the log.
- No second resident portal or duplicate resident queries.
- No facility, power, petty-cash or short-let metrics while those modules are
  disabled. Facilities remains off by default.
- No database migration. Existing audit indexes support the planned filters;
  the query shape can be indexed later if production volume requires it.

## Audit log API

New router mounted at `/api/v1/audit`:

### `GET /api/v1/audit/events`

Requires `audit.read`.

Query parameters:

```ts
{
  limit?: number;       // clamped to [1, 50], default 25
  after?: string;       // opaque cursor (last event id)
  eventType?: AuditEventType;
  outcome?: 'success' | 'failure';
  targetType?: AuditTargetType;
  actorId?: string;     // UUID
  from?: string;        // inclusive ISO timestamp
  to?: string;          // inclusive ISO timestamp
}
```

Response:

```ts
{
  events: AuditEventDto[];
  nextCursor: string | null;
  limit: number;
}
```

Invalid enum values, malformed dates or malformed actor ids return
`400 VALIDATION_ERROR`. Every query remains organisation-scoped.

### `GET /api/v1/audit/export`

Requires `audit.read` and accepts the same filters. Returns
`text/csv; charset=utf-8` with a dated filename.

Rules:

- Hard cap of 10,000 rows; the export is written newest-first.
- CSV cells are quoted and escaped. Values beginning with `=`, `+`, `-` or `@`
  are prefixed with `'` to prevent spreadsheet formula injection.
- Columns: `id`, `created_at`, `event_type`, `outcome`, `actor_id`,
  `actor_email`, `target_type`, `target_id`, `request_id`, `metadata`.
- A successful export records `audit.exported` with the applied filters, row
  count and whether the cap was reached. The event does not include any secret
  or full request body.
- A failed export records nothing; the error follows the standard envelope.

### Repository changes

- Extend `PrismaAuditRepository.listForAuditReadonly` with the filters above.
- Add an organisation-scoped `countForOrganization` using Prisma `count` so the
  dashboard's 30-day KPI is exact, not capped at 500 rows.
- Include the actor relation so the DTO can expose `actorEmail` and
  `actorName` (nullable, additive) without an N+1 lookup.
- Keep the wire/database event-name translation and metadata sanitisation
  exactly where they are today.

## Activity screen

`/app/activity` moves from the dashboard feed endpoint to the dedicated audit
endpoint and becomes a proper operator screen:

- `OperatorPageHeader` with an Export action.
- `FilterBar` with event type, outcome, target type, date-from and date-to.
  Event types are grouped by domain in the select. A "Clear" action resets all
  filters.
- `DataTable` columns: **When**, **Event**, **Actor**, **Target**, **Outcome**,
  **Details**.
- Cursor "Load more" pagination using the same React Query infinite-query
  pattern already on the page.
- A row-level `DetailDrawer` showing event id, timestamp, actor, target,
  request id, outcome and the redacted metadata as formatted key/value rows.
- Loading, empty, denied and error states using the shared operator primitives.
- Export downloads the current filtered view through the API, surfaces errors
  in the page, and shows a toast on success.
- The header Refresh action continues to refetch the pages already loaded.

The dashboard's compact recent-activity feed keeps its existing capped endpoint
and `queryKeys.dashboard.activity(5)` cache key, so the overview and the full
audit log remain independent.

## Navigation

Add an **Activity** entry with the `History` icon and `audit.read` grant. It is
visible only when the permission is present. The route guard remains the
authority; navigation visibility is only a convenience.

## Dashboard completion

### KPI row

Replace the current four generic counters with operational cards:

1. **Residents** — active resident accounts, with pending invitations as the
   sub-line.
2. **Active properties** — active / total properties.
3. **Outstanding invoices** — formatted naira total, with invoice and overdue
   counts.
4. **Open issues** — active SOS alerts, with open complaints as the sub-line.

Every value remains `null` when the role lacks the relevant permission, and the
client renders `n/a` rather than a misleading zero.

### Needs attention panel

Replace the money-contract demo with a permission-scoped list:

- pending resident invitations → Residents;
- overdue invoices → Billing;
- open complaints → Complaints;
- active SOS alerts → SOS alerts.

Each item shows its count and links to the relevant module. Items the role
cannot read are omitted. If every readable count is zero, the panel shows a
quiet "Nothing needs attention" state.

### Exact aggregates

Add count/aggregate methods rather than fetching capped lists:

- `countByRole` for resident accounts;
- pending-onboarding count;
- invoice outstanding/overdue aggregate;
- active SOS count;
- open complaint count;
- exact audit-event count for the trailing 30 days.

All queries are organisation-scoped. Module flags are enforced server-side; a
disabled module contributes no attention item or KPI.

## Caching and refresh

- React Query remains the only client cache.
- Audit filters are part of the audit query key, so each filtered view has its
  own cache entry.
- The dashboard KPI and feed keys stay separate.
- The header Refresh behavior, the 30-second API config cache and the API
  `fra1` region are unchanged.

## Verification

- API audit tests: authentication, `audit.read` enforcement, each filter,
  cursor pagination, invalid filter values, organisation scoping, CSV headers
  and escaping, export cap, and the `audit.exported` event.
- API dashboard tests: exact counts, permission `null`s, new KPI/attention
  fields, and disabled-module behavior.
- Web tests: navigation visibility, activity filter/pagination/detail/export
  flows, dashboard KPI and attention states.
- Full workspace verification: API and web test suites, Prisma validation,
  typecheck, lint, format check and production build.
- Deploy and smoke-test the audit list, export and overview in production.

## Rollback

Phase 9 is additive:

- remove the audit router and restore the activity page's dashboard endpoint;
- remove the Activity navigation entry;
- restore the previous KPI row and money-contract card.
- No schema or data migration needs to be reversed.
