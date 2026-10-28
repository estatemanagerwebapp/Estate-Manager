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
- `ResidentOnboarding` — draft resident record created when an admin
  registers a resident; holds the persistent onboarding code
  (`onboardingCode` column, SHA-256 hash at rest), all wizard-collected
  fields (gender, marital status, next of kin, ID type + document URL),
  payment status, and an optional link to the `User` once the account is
  created. Revocable by admin deletion; no TTL, no attempt cap, not
  single-use — re-shareable from the Residents page. Phase 1 adds a nullable
  `archivedAt` soft-archive timestamp: archived records stay for history but
  their onboarding code stops resolving. Portal access is controlled
  separately by the linked `User.status`.
- `MediaFile` — uploaded ID documents tracked by organization and relative
  object key. Local development stores files under `apps/api/uploads`; Vercel
  deployments use a private Cloudflare R2 bucket and serve authorized files
  through `GET /api/v1/media/:org/:id`.
- `Session` — one row per live sign-in; `expiresAt` is `NULL` when the
  session was revoked. The opaque cookie value is the row's primary key.
- `PasswordResetToken` — stores only the **SHA-256 hash** of the
  plaintext reset token; a single-active-token policy (one unconsumed
  token per user) and a `consumedAt` timestamp.
- `AuditEvent` — append-only security log (insert-only from
  application code). `eventType` / `outcome` are Prisma enums with
  underscored values; the wire contract uses dotted names and the
  translation lives in `modules/audit/audit-repository.ts`.
  Phase 2 adds: `resident.registered`, `resident.onboarding_completed`,
  `resident.payment_recorded`, `resident.payment_submitted`,
  `resident.deleted`, `user.deleted`; targetType `'resident'` / `'user'`.

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

### Supabase

Development currently runs against a Supabase project (pooler, **session**
mode, port 5432) — the same schema, Prisma as the only data-access layer,
so the backend is Postgres-agnostic by design.

```sh
# In .env (gitignored), DATABASE_URL is the Supabase session-pooler URI:
postgresql://postgres.<ref>:<password>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
```

- **Connection limit.** The Supabase session pooler caps at 15 concurrent connections per database user. Prisma's default pool size is `num_cpus * 2 + 1` (17 on an 8-core machine), which exceeds this ceiling and causes `EMAXCONNSESSION` errors under concurrent test loads. Append `?connection_limit=5` to `DATABASE_URL` to cap the per-process pool. With vitest forking ~4 workers, 4 × 5 = 20 potential connections queue at the pooler rather than fail; a single-worker dev server uses at most 5.
- **Session, not transaction, pooler.** Prisma keeps pooled connections
  open between requests; transaction mode (port 6543) breaks that.
- **URL-encode pooler passwords containing special characters** for both
  the app and the Prisma CLI. The Supabase console hands you the raw
  password; when pasting into `.env`, encode it:
  `node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" '<pw>'`
  An unencoded special character makes `prisma migrate deploy` fail with
  P1001 "Can't reach database server" even though `psql` succeeds — the
  CLI parses the URL, psql does not.
- **Boot after the tables exist.** If the API starts while its database
  has no tables yet (fresh Supabase, pre-migration), Prisma latches onto
  that broken state and later reports `Inconsistent column data … UUID`
  on the first real query. `prisma migrate deploy` + `db:seed` first,
  then (re)start the API.
- CI still uses a local docker `postgres:16-alpine` container
  (`.github/workflows/ci.yml`), so Supabase is not a CI dependency.

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
