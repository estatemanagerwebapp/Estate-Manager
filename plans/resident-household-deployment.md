# Resident Household Accounts — Deployment

**Status:** Applied to the configured Silverstone database and verified
**Date:** 2026-10-31
**Target:** Supabase Postgres 17.11 (session pooler); schema owner via `DIRECT_URL`.

## 1. Safety

- Backup before the migration:
  `/Users/user/Desktop/build-zone/silverstone-backups/pre-resident-accounts-20261031-174823.dump`
  (custom format, 71 table-data entries, verified with `pg_restore --list`).
- Applied with `npm run db:deploy` (Prisma `directUrl` = `DIRECT_URL`, the
  schema owner). The restricted API role was not used for DDL.
- No reset, no dropped data. Baseline row counts were re-checked after cleanup
  (users 7, onboardings 2, invoices 5, codes 10, properties 4).

## 2. Migrations

```
20261103015000_resident_accounts_and_dependants   applied
20261103016000_resident_onboarding_user_index_fix applied (new)
```

`prisma migrate status` → **“Database schema is up to date!”** (50 migrations).

### Defect found and fixed

The original onboarding migration created the one-property-per-user rule with
`CREATE UNIQUE INDEX "resident_onboardings_user_id_key"`, not a table
constraint. Migration `15000` tried `DROP CONSTRAINT IF EXISTS
resident_onboardings_user_id_key`, which was a **no-op**, leaving the unique
index in place so a second property row for the same user still failed.

- `20261103016000_resident_onboarding_user_index_fix` drops the unique index
  and ensures the non-unique `resident_onboardings_user_id_idx` exists.
- The `15000` file was also corrected for fresh installs (`DROP INDEX IF
  EXISTS` before creating the index).
- Verified afterwards: only `resident_onboardings_user_id_idx` remains.

`resident_account_members` is RLS-enabled **and forced**, and the API runtime
role received `SELECT/INSERT/UPDATE/DELETE` via the default privileges set
during the estate-Isolation deployment.

## 3. Runtime role and readiness

```
current_user   = silverstone_api
rolsuper       = false
rolbypassrls   = false
owns public    = false
```

API restarted (tsx watch child respawn); `/health/live` 200 and
`/health/ready` 200. The readiness guard includes
`resident_account_members` in `RLS_PROTECTED_TABLES`, so a regression in its
RLS state would fail closed.

## 4. Verification through the API (18/18)

Temporary admin/owner/dependant/second-household accounts were created for the
test and fully removed afterwards (`tempUsers: 0`, `members: 0`,
`assignments: 0`).

| Check | Result |
| --- | --- |
| Admin links a second property to an existing resident (`POST /onboard/residents` with `existingResidentUserId` + property) | 201; account now has 2 onboarding rows |
| Owner sees both household properties | both |
| Dependant sees both household properties | both |
| Dependant cannot see the other household's property | hidden |
| Admin issues a household bill (per-property invoice) | 201 |
| Dependant sees the household bill and payment history | yes |
| Dependant does not see the other household's bill | hidden |
| Owner generates an access code for a property | 201 |
| Dependant sees the household code | yes |
| Dependant does not see the other household's code | hidden |
| Dependant pays the household bill | 200 |
| Payment audit actor = the dependant | yes |
| Dependant `POST /onboard/residents` (link property) | 403 |
| Dependant `PATCH /onboard/residents/:id` (change property) | 403 |
| Link audit actor = the admin | yes |

Notes from the flow:

- A linked property becomes visible once its onboarding row is `COMPLETED`;
  the link creates a pending property onboarding record with its own code.
- When a resident has more than one property, billing and code generation
  require an explicit `propertyId` (the service rejects an ambiguous choice
  instead of guessing).
- Household reads use `app.resident_account_user_ids` loaded inside the RLS
  transaction; dependants see the owner's properties, bills, payments and
  codes, while every new row still records the actual acting user.
- Public onboarding still receives only the property behind the hashed code.
- Residents and dependants cannot create/change property assignments; only
  `resident.manage` staff (estate admins/super admin) can.

## 5. Rollback

Restore the backup above and reverse the two migrations. The runtime role and
the existing estate-isolation policies are unchanged by this deployment.
