# Live Sync, Notification Badges, and the Complaints Merge

**Status:** Implemented and verified
**Scope:** Badge counts and automatic refresh for both shells; resident
notifications on operator actions; removal of the duplicate Complaints screens.
No realtime socket and no schema migration.

## Objective

Operators and residents were looking at stale screens. A resident requested a
booking, the operator only saw the queue after a manual refresh, the approval
was invisible to the resident until they reloaded, and a code used at the gate
never reached the resident at all.

This step makes both shells **self-updating**:

- one poll drives every badge and every open list;
- an operator action notifies the resident and bumps the resident badge;
- a resident action bumps the operator queue badge;
- following a notification clears it and opens the updated record.

## Transport decision

The API runs as a Vercel serverless Express service. WebSockets and SSE need a
long-lived connection and shared in-memory state, neither of which survives
that deployment model. The chosen mechanism is a **cursor poll**:

- `GET /api/v1/sync?since=<ISO>` — one request per poll;
- 5-second interval while the tab is visible (TanStack pauses it in the
  background);
- the server bounds the lookback to 10 minutes so a tab left open overnight
  cannot trigger a wide scan;
- `generatedAt` is captured **before** the reads, so an event written while the
  request is in flight is reported next time instead of being skipped.

## Two sources of truth

| Shell    | Change source                                 | Why                                                                                                    |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Operator | `AuditEvent` grouped by type since the cursor | Every domain mutation already writes an audit row. One indexed `groupBy` per poll; no new event table. |
| Resident | `Notification` rows addressed to the user     | A notification carries the route it points at, so the same row drives the inbox and the section badge. |

Both are mapped to a small `SyncDomain` set — `bookings`, `messages`,
`payments`, `codes`, `sos`, `community`, `notifications` — and the client
invalidates only those TanStack Query prefixes.

## Resident badges

`residentCountsFromLinks` groups unread notifications by `linkTo`:

| Notification link         | Badge                             |
| ------------------------- | --------------------------------- |
| `/resident/app/bookings`  | Bookings                          |
| `/resident/app/codes`     | Access codes                      |
| `/resident/app/invoices`  | Invoices & payments               |
| `/resident/app/sos`       | Emergency / SOS                   |
| `/resident/app/community` | Community                         |
| anything else             | bell only (`unreadNotifications`) |

`unreadNotifications` is always the total, so the bell and the section badges
agree. Following a notification's "View" link marks it read, which clears the
badge.

## Notification writes added

| Transition                                        | Notification                         |
| ------------------------------------------------- | ------------------------------------ |
| Operator confirms / cancels / completes a booking | `BOOKING` → `/resident/app/bookings` |
| Guard records a **granted** verification          | `CODE` → `/resident/app/codes`       |
| Invoice created / payment recorded                | `PAYMENT` → `/resident/app/invoices` |
| SOS acknowledged / resolved                       | `SOS` → `/resident/app/sos`          |

Notification writes are best-effort: a failure is swallowed so it can never
undo the committed booking, payment, reply or verification. Resident
notifications already existed for booking creation and freed facility windows.

## Complaints and resident Messages removed

Complaints duplicated the Messages workflow. The duplicate **screens** were
removed:

- operator `/app/complaints` route and sidebar entry;
- resident `/resident/app/complaints` route and sidebar entry;
- the resident dashboard "Open complaints" row;
- the operator dashboard "Open complaints" attention link (it pointed at the
  removed route).

Messages was then removed from the **resident portal** as well: the sidebar
entry, the `/resident/app/messages` route and the page are gone. The operator
inbox, the message API and existing threads remain for staff. Because residents
can no longer open a thread, an operator reply no longer writes a resident
notification — that would have pointed at a removed route.

The complaint and message APIs, tables, audit events and counts remain in place
but are dormant, so historical data is intact and the change is reversible.
Notifications were **held** as a separate feature: Community and Notifications
stay as distinct screens until a later consolidation.

## Surfaces

| File                                                        | Change                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/shared/src/sync-contract.ts`                      | `SYNC_DOMAINS`, `SyncSnapshotDto`, `residentSectionForLink`, resident counter keys |
| `apps/api/src/modules/sync/sync.routes.ts`                  | `GET /sync`, cursor parsing/clamping                                               |
| `apps/api/src/modules/sync/sync.service.ts`                 | Audit → domain map, resident badge grouping, snapshot loader                       |
| `apps/api/src/modules/audit/audit-repository.ts`            | `eventTypesSince`                                                                  |
| `apps/api/src/modules/resident/notifications-repository.ts` | `unreadGroupsByLink`, `linksSince`                                                 |
| `apps/api/src/modules/resident/community-repository.ts`     | `hasChangeSince`                                                                   |
| Operator services                                           | Optional `notify` hook wired in `dependencies.ts`                                  |
| `apps/web/src/api/sync.ts`                                  | Polling hook, domain → query-key invalidation map                                  |
| `apps/web/src/components/AppShell.tsx`                      | Staff badges from `/sync`                                                          |
| `apps/web/src/components/ResidentAppShell.tsx`              | Resident badges from `/sync`                                                       |
| `apps/web/src/api/navigation.ts`                            | `invalidateNavigationCounts` now refreshes `/sync`                                 |

## Verification

- API integration (`dashboard.test.ts`): 16 passed, including 401/invalid
  cursor, staff baseline counts with `changed: []`, `sos` reported after an
  audit event, and resident badges grouped from unread notifications with
  read rows excluded from the change set.
- API unit (`sync-unit.test.ts`): 6 passed for event→domain mapping, empty
  counters, link grouping and unknown-route handling.
- Gate integration: a granted verification writes a `CODE` notification to the
  code owner; denials do not.
- Booking/billing/message/SOS suites: 47 passed across 5 files.
- Web: 93 tests across 21 files, including the domain → query-key map and the
  sync refresh shim. Typecheck, lint, format, shared build and production web
  build pass.

## Rollback

- Revert the shell badges to `useNavigationCounts` and remove `apps/web/src/api/sync.ts`.
- Remove the `/sync` mount and module; the repository additions are additive.
- Revert the `notify` wiring in `dependencies.ts` (the service hooks are optional).
- Restore the Complaints routes/nav and the two page files; the API and data
  were never removed.
