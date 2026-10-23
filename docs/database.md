# Database setup

## Schema

`prisma/schema.prisma` defines the Phase 0 models plus the Phase 1
identity surface:

- `Organization` — one row per deployment (the deployment _is_ the
  organization; no tenant column).
- `OrganizationConfig` — versioned configuration documents. One row per
  version, per organization. Status: `DRAFT` / `ACTIVE` / `ARCHIVED`.
- `User` — staff accounts, scoped per organization
  (`@@unique([organizationId, email])`); stores `role` / `status` as
  plain `VARCHAR(20)` mirroring the shared `ROLE_KEYS` /
  `ACCOUNT_STATUSES`, plus the Argon2id (or PBKDF2) password hash.
- `Session` — one row per live sign-in; `expiresAt` is `NULL` when the
  session was revoked. The opaque cookie value is the row's primary key.
- `PasswordResetToken` — stores only the **SHA-256 hash** of the
  plaintext reset token; a single-active-token policy (one unconsumed
  token per user) and a `consumedAt` timestamp.
- `AuditEvent` — append-only security log (insert-only from
  application code). `eventType` / `outcome` are Prisma enums with
  underscored values; the wire contract uses dotted names and the
  translation lives in `modules/audit/audit-repository.ts`.

### Partial unique index

```sql
CREATE UNIQUE INDEX organization_configs_one_active_per_org
  ON "OrganizationConfig" ("organizationId")
  WHERE "status" = 'ACTIVE';
```

At most one `ACTIVE` document per organization, enforced by the database.
The seed and the service layer archive the current ACTIVE document in the
same transaction they create the next one, so the invariant holds without a
race.

## Migrations

Migrations live in `prisma/migrations/` and are applied with:

```sh
npm run db:deploy        # prisma migrate deploy (production-safe, applies pending)
npm run db:migrate       # prisma migrate dev (creates new migration files in dev)
npm run db:status        # prisma migrate status
```

The current migration set contains the init migration
(`20261022120000_init`) and the identity migration
(`20261023091817_add_identity`). Later phases add migrations for domain
entities; each one is reviewed before it enters the repo. No destructive
migrations (`DROP`, irreversible `ALTER`) are accepted without an ADR.

The integration test suite (`apps/api/src/auth-flow.test.ts`) runs
against a dedicated `silverstone_test` database (see
`docs/development.md`) so it never touches development or production
rows.

## Seed

```sh
DATABASE_URL="postgresql://..." npm run db:seed
```

Idempotent. Creates the organization and the initial ACTIVE config (version

1. from `config/organization.default.json` only if the organization has no
   active document. Re-runs print a "nothing to do" message.

## Backups

Out of scope for Phase 0. The deployment layer (IaC, not this repo) is
responsible for `pg_dump` / snapshots.
