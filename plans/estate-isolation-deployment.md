# Estate Isolation — Row-Level Security Deployment

**Status:** Applied to the configured Silverstone database and verified
**Date:** 2026-10-31
**Target:** Supabase Postgres 17.11 (session pooler, `aws-1-eu-central-1`), the
same `DATABASE_URL` the API uses.

## 1. Safety

- Backup taken **before** any migration:
  `/Users/user/Desktop/build-zone/silverstone-backups/pre-estate-rls-20261031-152537.dump`
  (custom format, 70 table-data entries; `pg_restore --list` verified).
- No `migrate reset`, no `DROP`, no data rewrite. Migrations are additive or
  policy-only.

## 2. Migrations applied (schema owner)

```
20261103012000_user_estate_assignments
20261103013000_estate_row_level_security
20261103014000_rls_verification_scope_fix   (new, see §3)
```

`prisma migrate status` → **“Database schema is up to date!”** (48 migrations).
Verified: 26 tables with `relrowsecurity` **and** `relforcerowsecurity`, 8
`app_scope_*` functions, 40 policies.

## 3. Defects found and fixed while applying

1. **`access_code_staff_scope` referenced a non-existent column.**
   The policy on `access_codes` used `verified_by_id` in its `WITH CHECK`; that
   column belongs to `access_verifications`. The first `migrate deploy` failed
   with PostgreSQL `42703` and rolled back atomically (`applied_steps_count 0`,
   no RLS enabled). Fixed to `user_id` before the successful apply.
2. **Null-property verifications could not be read back.**
   `access_verification_staff_scope` allowed guards to insert their own
   property-less verification (unknown code) but its `USING` clause did not
   allow reading it, so `INSERT … RETURNING` failed. Added
   `20261103014000_rls_verification_scope_fix` to include
   `property_id IS NULL AND verified_by_id = app_scope_user_id()`.
3. **Readiness false positive from Supabase's `realtime.messages`.**
   `assertRlsRuntimeReady` joined `pg_class` by name only; the `realtime` schema
   also has a `messages` table, which is not `FORCE`-enabled, so readiness
   reported RLS incomplete. The checks now constrain the join to
   `public` (`relnamespace = 'public'::regnamespace`).
4. **Pre-authentication audit writes were blocked by RLS.**
   `login.*`, `password.reset_*` and similar events are written before a user
   scope exists, and `audit_events` is protected. Login returned 503 under the
   runtime role. Fixed by:
   - wrapping `/auth/login`, `/auth/forgot-password` and
     `/auth/reset-password` in an organization-only database scope
     (`preAuthScope`);
   - writing audit rows with `createMany` (no `RETURNING`) so the audit SELECT
     policy does not reject an insert that is intentionally invisible to
     estate admins.

## 4. Runtime role

Created `silverstone_api`:

```
LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE
owns 0 relations
```

Grants: `USAGE` on `public`; `SELECT, INSERT, UPDATE, DELETE` on all tables;
`USAGE, SELECT` on sequences; `EXECUTE` on functions; matching
`ALTER DEFAULT PRIVILEGES`.

Connection check through the pooler (`silverstone_api.<ref>`) succeeds;
without scope `SELECT count(*) FROM estates` returns **0**; with an estate
scope it returns only that estate; `UPDATE` of another estate returns 0 rows.

## 5. Configuration

`.env` now separates the roles:

```sh
DIRECT_URL=postgresql://postgres.<ref>:...@...   # schema owner: migrate/seed/test
DATABASE_URL=postgresql://silverstone_api.<ref>:...@...  # API runtime
```

- `prisma/schema.prisma` declares `directUrl = env("DIRECT_URL")`; Prisma
  Migrate/status use the owner automatically.
- `prisma/seed.ts` uses `DIRECT_URL` (writes protected tables before any scope).
- Vitest uses `DIRECT_URL` (via `lib/prisma.ts`), so the suite continues to
  seed protected tables as before.
- `.env.example` and `docs/database.md` document the split, the grants and the
  fail-closed checks.
- The API was restarted (`tsx watch` child respawn) and `/health/ready` returns
  **200**. Pointing the API at the owner URL makes readiness fail closed with
  “The API database role must not be a superuser, BYPASSRLS role, or owner of
  protected tables”.

## 6. Verification (through the running API, runtime role)

Isolation, two estate admins (A = Eastland Golf, B = Fairfield):

| Check | Result |
| --- | --- |
| A lists estates / properties | only A |
| A reads estate B / property B | 404 |
| A mutates property B | 404 |
| A dashboard counts | 1 estate, 1 property |
| A facilities / bookings / invoices / messages / SOS / codes / complaints | 200, no B rows |
| A resident register (`/onboard/residents`) | only A |
| A activity log | no B-target/B-estate events; own login visible |
| A creates facility in B / invoices B resident / replies B thread / acknowledges B SOS | 404 or 400 (denied) |
| A access-code register | no B codes |
| Guard A verifies B's code | recorded `DENIED / NOT_FOUND`, no B context |
| Super admin | 8 estates, 2 properties (organization-wide) |
| Resident | own property only; B property 404 |

Write paths under RLS (all passed): facility create, invoice create + resident
notification, partial resident payment, code generation, guard verification
(granted and unknown), resident message + staff reply, SOS raise + acknowledge,
complaint create, booking create + confirm, resident dashboard.

Administration/onboarding: super admin creates an estate admin with an estate
assignment; the new admin signs in and sees only that estate. Public onboarding
with a valid code reads/saves its own property; a wrong code returns 404.

No temporary users, assignments, facilities, notifications or audit rows were
left behind (user/facility counts returned to baseline).

## 7. Known unrelated suite state

`auth-flow.test.ts` still has four failing user-management tests: the current
code intentionally reserves account creation/role changes for `SUPER_ADMIN`
(`PermissionResolver`) and requires `estateIds` for non-super-admin staff. Those
tests predate that policy and need updating; they are not caused by the RLS
deployment. Login/forgot/reset tests pass (29/33).

## 8. Rollback

- Restore the backup above, or `prisma migrate resolve` + reverse the policies.
- To disable enforcement temporarily, point `DATABASE_URL` back at the owner
  role — the API will **refuse to become ready** by design. Restore the runtime
  role URL to bring it back.
