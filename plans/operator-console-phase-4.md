# Operator Console — Phase 4: Messages & Complaints

**Status:** Implemented and verified
**Scope:** The operator message inbox and complaint queue only. No billing,
gate, facilities, settings, SOS, or audit-log feature work in this step.

## Objective

Give the estate office a shared inbox for resident conversations and a
workable complaint queue, without changing the resident portal's self-scoped
surfaces or duplicating resident-owned queries.

Phase 4 delivers:

- a staff-only `/app/messages` inbox with resident, property and author
  context;
- a shared estate-office unread marker per conversation;
- staff replies, close and reopen actions;
- a staff-only `/app/complaints` queue with replies and status changes;
- server-side `message.read` / `message.manage` and
  `complaint.read` / `complaint.manage` enforcement;
- audit events for replies and thread/status transitions.

## Non-goals

- No email, SMS, WhatsApp, push or other outbound messaging provider.
- No resident portal redesign. `GET/POST /resident/messages` and
  `GET/POST /resident/complaints` stay self-scoped and keep their existing
  response shapes.
- No ticket assignment, SLA clock, attachments, canned responses or
  per-staff read state.
- No changes to complaint categories or the complaint creation form.
- No second message/complaint table and no duplicate resident-owned queries.

## Decisions

- The estate-office read marker is shared per conversation. It records the
  last time any staff member opened the thread, not per-staff state, which
  matches the small-office operating model.
- Only operators with `message.manage` can mark a conversation read, reply,
  close or reopen it. Auditors with `message.read` can inspect the inbox but
  cannot move the shared marker or change the conversation.
- Message authors are recorded on every new message, whether resident or
  estate office. Legacy rows stay valid with a null author and fall back to
  the sender role in the UI.
- Resident messages remain immutable from the operator side. Staff
  participation is a new ESTATE_OFFICE message in the same thread.
- A closed conversation cannot receive a reply. Staff can reopen it.
- Complaint replies are staff-authored and visible to the resident through the
  existing complaint thread. Closing a complaint blocks new replies until its
  status is changed again.
- Complaint status moves through the existing `OPEN`, `IN_PROGRESS`,
  `RESOLVED`, `CLOSED` vocabulary. `RESOLVED` sets `resolvedAt`; moving back
  to `OPEN` or `IN_PROGRESS` clears it; `CLOSED` preserves an earlier
  resolution time.
- Residents see the existing complaint status, description and replies only.
  No internal operator notes are added.

## Database

Migration: `20261103003000_operator_messages_complaints`

- `messages.author_id UUID NULL` → `users(id)` with `SET NULL`.
- `message_threads.staff_last_read_at TIMESTAMPTZ NULL`.
- Index on `messages(author_id)`.
- Index on `message_threads(organization_id, status, updated_at)`.
- Index on `complaints(organization_id, status, created_at)`.

Complaint replies already carried `author_id`; no complaint-column change was
needed. Existing messages and complaints remain valid, with null authors and
null read markers where the data predates the migration.

## API

Mounted at `/api/v1/messages` and `/api/v1/complaints`, organization-scoped:

### Messages

| Method | Route                  | Permission       | Behavior                                    |
| ------ | ---------------------- | ---------------- | ------------------------------------------- |
| `GET`  | `/messages`            | `message.read`   | Inbox with resident/property/author context |
| `POST` | `/messages/:id/read`   | `message.manage` | Move the shared staff read marker           |
| `POST` | `/messages/:id/reply`  | `message.manage` | Post an ESTATE_OFFICE message               |
| `POST` | `/messages/:id/close`  | `message.manage` | `OPEN` → `CLOSED`                           |
| `POST` | `/messages/:id/reopen` | `message.manage` | `CLOSED` → `OPEN`                           |

### Complaints

| Method | Route                    | Permission         | Behavior                             |
| ------ | ------------------------ | ------------------ | ------------------------------------ |
| `GET`  | `/complaints`            | `complaint.read`   | Queue with resident/property context |
| `POST` | `/complaints/:id/reply`  | `complaint.manage` | Add an estate-office reply           |
| `POST` | `/complaints/:id/status` | `complaint.manage` | Move to a shared complaint status    |

Filters:

- message threads: `status=OPEN|CLOSED`, `limit=1..200` (default 100)
- complaints: `status=OPEN|IN_PROGRESS|RESOLVED|CLOSED`,
  `limit=1..200` (default 100)

Behavior details:

- Every route is organization-scoped; another organization's thread or
  complaint is `404`.
- Malformed ids are rejected as `400` before reaching the database.
- Replies are trimmed and capped at 4,000 characters.
- Replying to a closed conversation or complaint returns `409`.
- Message close/reopen is idempotent; an unchanged status returns the current
  thread without a second audit event.
- Complaint status changes are idempotent; an unchanged status returns the
  current complaint without a second audit event.
- `unreadCount` counts resident messages created after the shared staff read
  marker. A null marker means all resident messages are unread.
- The operator DTO includes resident, assigned property and message/reply
  author context. Legacy messages without an author return `author: null`.

## Contracts and UI

Shared contracts:

- `OperatorResidentSummaryDto`
- `OperatorPropertySummaryDto`
- `OperatorActorSummaryDto`
- `OperatorMessageDto`
- `OperatorMessageThreadDto`
- `OperatorMessagesResponse`
- `OperatorMessageReplyInput`
- `OperatorMessageThreadResponse`
- `OperatorComplaintReplyDto`
- `OperatorComplaintDto`
- `OperatorComplaintsResponse`
- `OperatorComplaintReplyInput`
- `OperatorComplaintStatusInput`
- `OperatorComplaintResponse`

Messages screen:

- Sidebar item gated on `message.read`.
- Open / all / closed conversation views, search across resident, property,
  subject and message text.
- Two-pane layout: conversation list and selected thread.
- Unread badge for resident messages after the shared marker.
- Selecting an unread thread marks it read for the estate office.
- Staff replies post as the estate office; close/reopen controls appear only
  with `message.manage`.

Complaints screen:

- Sidebar item gated on `complaint.read`.
- All / open / in progress / resolved / closed views, search across resident,
  property, description and replies.
- Table queue with a side drawer for the full complaint.
- Staff can reply, change status, and read author/timestamp context in the
  drawer.
- Status controls and replies are render-gated on `complaint.manage`.

React Query remains the only client cache. New list keys use the existing
query-key registry; mutations refresh the active list. The header Refresh
continues to invalidate active queries. No polling is added in this phase.

## Audit

Emitted through the Phase 0 catalogue:

- `message.replied`
- `message.thread_closed`
- `message.thread_reopened`
- `complaint.replied`
- `complaint.status_changed`

The actor is the staff member who performed the transition. Metadata records
the subject and resident target; complaint status changes also record the
previous and next status. Message bodies and complaint descriptions are not
copied into audit metadata.

## Verification

- Shared tests: 26 passed across 2 files.
- API tests: 292 passed across 28 files.
- Web tests: 42 passed across 14 files.
- API integration tests cover unauthenticated access, malformed ids, auditor
  read-only access, resident denial, resident/property context, message author
  identity, shared read markers, replies, close/reopen, complaint replies and
  status timestamps, status filters, organization scoping and audit events.
- Web helper tests cover view filters, labels, tones and search.
- Typecheck, lint, format check, Prisma validate/generate and the production
  build pass.
- Migration applied to the local test database and verified against the schema.

## Rollback

- Revert the API, shared-contract, web and navigation changes.
- Leave the additive message author/read-marker columns and indexes in place,
  or add a later migration that drops them. Do not delete message or complaint
  rows.
- The migration is safe to leave applied; the reverted code simply ignores the
  new columns.
