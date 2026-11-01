# Access-Code Authentication Type — Deployment

**Status:** Applied to the configured Silverstone database and verified
**Date:** 2026-10-31
**Target:** Supabase Postgres 17.11 (session pooler); schema owner via `DIRECT_URL`.

## 1. Safety

- Backup before the migration:
  `/Users/user/Desktop/build-zone/silverstone-backups/pre-access-code-auth-20261031-183051.dump`
  (custom format, 474 KB, 72 table-data entries, verified with
  `pg_restore --list`).
- Applied with `npm run db:deploy` (Prisma `directUrl` = `DIRECT_URL`). The
  restricted API role was not used for DDL.

## 2. Migration

```
20261103016000_access_code_authentication_type   applied
```

`prisma migrate status` → **“Database schema is up to date!”** (51 migrations).

Database checks:

| Check | Result |
| --- | --- |
| `access_codes.authentication_type` | `varchar(24) NOT NULL DEFAULT 'ID_IMAGE'` |
| Check constraint | `access_codes_authentication_type_check` = `ID_IMAGE`, `CAR_PLATE`, `VISITOR_IMAGE` |
| Existing codes | all 10 = `ID_IMAGE` |
| Allowed values accepted | `ID_IMAGE`, `CAR_PLATE`, `VISITOR_IMAGE` |
| Invalid value rejected | `BOGUS` → PostgreSQL `23514` check-constraint violation |

## 3. Server enforcement added

The resident form already required a plate for `CAR_PLATE`, but the API did
not. `ResidentCodesService.generate` now rejects a car-plate code without a
plate (`400 VALIDATION_ERROR — A car plate is required when verification is by
car plate`). The route also defaults `authenticationType` to `ID_IMAGE` so
older clients keep the previous behaviour.

## 4. Restart and readiness

API restarted (tsx watch child respawn); `/health/live` 200 and
`/health/ready` **200** with the database check `ok`.

Runtime role unchanged: `silverstone_api`, `rolsuper=false`,
`rolbypassrls=false`, no protected-table ownership.

## 5. Verification through the API (12/12)

Temporary admin/resident/guard accounts were created and removed afterwards;
existing counts returned to baseline (users 7, codes 10, no recent test codes,
onboardings 2, assignments 0).

| Check | Result |
| --- | --- |
| Resident generates `ID_IMAGE` code | 201 |
| Resident generates `CAR_PLATE` code with plate | 201 |
| Resident generates `VISITOR_IMAGE` code | 201 |
| `CAR_PLATE` without a plate | 400 with clear message |
| Guard code list shows `ID_IMAGE` | yes |
| Guard code list shows `CAR_PLATE` | yes |
| Guard code list shows `VISITOR_IMAGE` | yes |
| Verification preview shows `ID_IMAGE` | yes |
| Verification preview shows `CAR_PLATE` | yes |
| Verification preview shows `VISITOR_IMAGE` | yes |
| Preview exposes the plate (`LAG-999-AA`) | yes |

The guard screens render these fields through `AUTHENTICATION_TYPE_LABELS`
(code list and verification preview); the API verification confirms both
payloads carry the selected requirement.

## 6. Notes

- Migration `20261103016000_resident_onboarding_user_index_fix` shares the
  `20261103016000` timestamp prefix with this migration. Both are applied and
  ordered deterministically by full folder name; future migrations should use
  a later timestamp to avoid ambiguity.
- Existing access codes retain their prior behaviour (`ID_IMAGE`) by default.

## 7. Rollback

Restore the backup above, then drop the check constraint and the
`authentication_type` column. The API field and UI can remain, falling back to
`ID_IMAGE`.
