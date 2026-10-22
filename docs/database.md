# Database setup

## Schema

`prisma/schema.prisma` defines the minimal Phase 0 models:

- `Organization` — one row per deployment (the deployment _is_ the
  organization; no tenant column).
- `OrganizationConfig` — versioned configuration documents. One row per
  version, per organization. Status: `DRAFT` / `ACTIVE` / `ARCHIVED`.

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

The current migration set contains only the init migration
(`20261022120000_init`). Later phases add migrations for domain entities;
each one is reviewed before it enters the repo. No destructive migrations
(`DROP`, irreversible `ALTER`) are accepted without an ADR.

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
