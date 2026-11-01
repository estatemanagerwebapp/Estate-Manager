# Broadcast Compose — "Database Not Available" Fix

**Status:** Fixed and verified
**Symptom:** Sending a broadcast from Messages returned
`503 DATABASE_UNAVAILABLE — "The database is not available"`.

## Trace

```
MessagesPage (broadcast form)
  → POST /api/v1/messages/compose          (message.manage)
  → OperatorMessagesService.compose
  → PrismaMessageRepository.listOperatorRecipients   (ok)
  → PrismaMessageRepository.createOperatorThreads    (ok, committed)
  → PrismaAuditRepository.record('message.sent')     ← fails
  → Prisma auditEvent.create
  → PostgreSQL: invalid input value for enum "AuditEventType": "message_sent"
  → errorHandler: any Prisma error → 503 DATABASE_UNAVAILABLE
```

## Root cause

The migration `20261103008000_operator_message_compose`
(`ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'message_sent'`) had
**not been applied** to the application database. `prisma migrate status`
reported it as pending.

The failing operation was the audit insert at the end of `compose`, not the
thread creation and not connectivity:

- Prisma: `PrismaClientKnownRequestError`, code **P2010**
- PostgreSQL: **22P02** `invalid input value for enum "AuditEventType": "message_sent"`

The terminal error middleware collapsed every Prisma failure into the generic
`503 DATABASE_UNAVAILABLE`, so the real cause was invisible to the client.

A second defect was exposed by the trace: the audit write happened **after** the
thread transaction committed. A broadcast therefore left every recipient
messaged while the request still returned an error, with no audit row.

## Fixes

1. **Applied the pending migration** with `prisma migrate deploy`. No code change
   is needed for the enum itself; it was a deployment gap.
2. **Atomic compose.** `createOperatorThreads` now accepts a `beforeCommit`
   hook that runs inside the same transaction. `compose` writes the audit row
   and every resident notification through that hook, so threads, opening
   messages, audit and notifications commit together or not at all.
3. **Truthful error classification.** `describePrismaError` maps Prisma codes to
   specific responses:
   - `P2010` with `22P02`/`42P01`/`42703`, `P2021`, `P2022` → `503 SCHEMA_MIGRATION_REQUIRED`
     with the safe Prisma/PostgreSQL identifiers;
   - `P2002`/`P2003`/`P2014` → `409 CONFLICT`;
   - `P2025` → `404 NOT_FOUND`;
   - `P2028`/`P2034` → `503 DATABASE_BUSY` (retryable);
   - `P2000`/`P2011` → `400 VALIDATION_ERROR`;
   - other known codes → `503 DATABASE_ERROR` naming the Prisma code;
   - only initialization errors still say `DATABASE_UNAVAILABLE`.
4. **Notification destination.** Resident Messages was removed from the portal,
   so compose notifications link to `/resident/app/notifications` rather than a
   removed route.

Behaviour preserved: a direct message creates exactly one conversation; a
broadcast creates one per **active, non-archived** resident assigned to the
selected estate. Every conversation carries the subject and opening message,
authored by the acting staff account (`ESTATE_OFFICE`), and its resident is
notified. Organization scoping, `message.manage` authorization and audit logging
are unchanged.

## Verification

- `prisma migrate status` → **Database schema is up to date!**
- Direct enum cast of `'message_sent'::"AuditEventType"` now succeeds.
- Integration (`operator-messages-complaints.test.ts`, real Postgres + HTTP):
  - direct message → one thread, one opening message, author + subject + body,
    resident notification, `message_sent` audit with `recipientCount: 1`;
  - broadcast → two threads for the two active residents, archived resident
    excluded, one notification per recipient, audit `recipientCount: 2`;
  - resident and auditor → `403`; unknown/cross-org estate → `404`;
  - audit failure inside the transaction → **zero** threads and messages persist.
- Unit (`error-handler.test.ts`): schema errors are distinguished from outages;
  constraint/not-found/transaction codes map to their HTTP semantics; non-Prisma
  errors pass through.
- Suite results: 18 compose/error tests, 15 gate/app tests, 27 shared tests;
  API build, typecheck, lint and format pass.

## Note on schema drift

`prisma migrate diff` still reports pre-existing normalisation differences
(`TIMESTAMP` → `TIMESTAMPTZ` on a few legacy tables and two index renames).
They are unrelated to this failure, do not affect compose, and were **not**
applied. They should be captured in a dedicated migration when convenient.

## Rollback

- Revert the `beforeCommit` hook and move the audit write back after the
  transaction (not recommended: restores the partial-broadcast defect).
- Revert `describePrismaError` to the blanket 503 (not recommended: restores the
  misleading message).
- The enum value is additive and should stay.
