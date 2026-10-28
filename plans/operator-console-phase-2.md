# Operator Console — Phase 2: Administrators

**Status:** Implemented and verified
**Scope:** The staff-account surface only. No resident portal, billing, gate,
facilities, SOS, settings, or audit-log feature work in this step.

## Objective

Give operators a staff-only account screen that can create, list, search,
suspend, re-enable, re-role, sign out and delete administrators without
duplicating the resident account lifecycle.

Phase 2 delivers:

- a dedicated `/app/administrators` screen;
- staff-only listing (`SUPER_ADMIN`, `ESTATE_ADMIN`, `GUARD`, `AUDITOR`);
- account creation with a one-time temporary password;
- session revocation without changing status or password;
- role/status/delete actions using the existing user-management API;
- server-side `user.manage` enforcement on every route;
- `user.created` and `user.sessions_revoked` audit events;
- a compatibility redirect from the old `/app/users` bookmark.

## Non-goals

- No resident accounts are created here. Residents continue to be created by
  the onboarding/payment flow and managed from the Residents screen.
- No second user or session API. The existing `/api/v1/auth/users` routes are
  extended instead of duplicated.
- No new database table or column. The audit enum values were added in Phase 0.
- No profile editing in this phase (the audit catalogue has no `user.updated`
  event yet).
- No email delivery of temporary passwords. The operator receives the value
  once and shares it through a trusted channel.

## Decisions

### Staff-only scope

The Administrators screen manages every role except `RESIDENT`:

```ts
STAFF_ROLE_KEYS = ['SUPER_ADMIN', 'ESTATE_ADMIN', 'GUARD', 'AUDITOR'];
```

`scope=staff` intersects with the optional `role` filter, so a request for
`scope=staff&role=RESIDENT` returns an empty list rather than resident
accounts. The historical unscoped list remains available for existing callers
and tests.

### One-time temporary password

Creating an account generates a 16-character password that satisfies the
password policy, stores only its hash, sets `mustChangePassword = true`, and
returns the plaintext exactly once in the `201` response. The password is
never written to the audit log or returned by a later read.

The generator is shared with resident onboarding, which previously had a
private duplicate.

### Role limits

The server uses the existing hierarchy:

- `SUPER_ADMIN` may create and manage every staff role, including peers.
- `ESTATE_ADMIN` may create and manage staff roles below and at their own
  level, but never `SUPER_ADMIN`.
- Other roles cannot create administrators.
- `RESIDENT` is rejected by the create endpoint with `400`; the onboarding
  flow is the only resident account-creation path.

The web role picker mirrors this matrix for display, but the API re-checks it
on create, role change, status change, session revocation and delete.

### Self and last-super-admin protection

The existing guards remain in force:

- an operator cannot change their own status or role, revoke their own
  sessions through the admin endpoint, or delete themselves;
- the last active `SUPER_ADMIN` cannot be suspended, disabled, demoted or
  deleted.

## API

### `GET /api/v1/auth/users?scope=staff`

Lists staff accounts in the caller's organization. Optional `role` and
`status` filters compose with the staff scope. Requires `user.manage`.

### `POST /api/v1/auth/users`

Creates a staff account. Requires `user.manage`.

```json
{
  "email": "guard@example.com",
  "fullName": "New Guard",
  "phone": "+234 800 111 2222",
  "role": "GUARD"
}
```

`201` response:

```json
{
  "ok": true,
  "user": { "...": "UserListItemDto" },
  "temporaryPassword": "…"
}
```

Errors:

- `400` for a resident role or invalid input;
- `403` when the actor cannot create that role;
- `409` when the email already exists.

### `POST /api/v1/auth/users/:userId/sessions/revoke`

Revokes every session for a managed account without changing its status or
password. Requires `user.manage`; self-revocation and higher-role targets are
blocked. Returns `{ "ok": true, "id": "…" }`.

### Existing routes

`GET /users`, `GET /users/:userId`, `POST /users/:userId/status`,
`POST /users/:userId/role` and `DELETE /users/:userId` are unchanged except
that the list accepts `scope=staff`.

## UI

`/app/administrators` replaces the old `/app/users` screen in the sidebar.
`/app/users` redirects to the new route so existing bookmarks still work.

The page provides:

- role, status and text filters over the loaded staff list;
- an **Add administrator** modal (name, email, optional phone, role);
- a one-time password panel with copy support and a warning that the value is
  shown only once;
- per-row role assignment, suspend/re-enable (with an optional reason),
  sign-out-everywhere and delete actions;
- a "you" marker for the signed-in account and read-only treatment for roles
  the actor cannot manage.

Hiding these controls is convenience only. Every action is validated by the
API under `user.manage`, the role hierarchy and the last-super-admin guard.

## Audit

New events emitted by this phase:

- `user.created` — target user, email, role, `mustChangePassword: true`; no
  password or temporary-password field;
- `user.sessions_revoked` — target user, role and status.

Existing events continue to cover role changes, suspension, reactivation,
deletion and login/session activity.

## Verification

- Shared tests: 26 passed.
- API tests: 275 passed across 26 files.
- Web tests: 31 passed across 11 files.
- Typecheck, lint, format check, Prisma validate/generate and the production
  build pass.
- New API coverage: staff-scoped listing excludes residents; creation returns a
  working one-time password; resident-role creation is rejected; estate-admin
  escalation to `SUPER_ADMIN` is rejected; duplicate email returns `409`;
  session revocation invalidates the target's cookie and is audited;
  higher-role and self-revocation are blocked.
- No database migration was required.

## Rollback

Phase 2 is backward-compatible at the data layer:

- remove the `create` and `revokeSessions` service methods and routes;
- remove the `scope=staff` handling (the default list behavior is unchanged);
- restore the previous Users nav/route if required;
- revert the shared staff-role constants and UI.

No table, column or stored account data is changed by a rollback.

## Next

Phase 3 (SOS Alerts) remains blocked pending confirmation that alert handling
is in-app polling rather than an external integration. Phase 6 also still
needs the meaning of “Verification Logs” confirmed before implementation.
