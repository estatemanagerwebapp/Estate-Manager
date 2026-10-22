# Silverstone Managers — Phase 0 Foundation

Config-driven estate management platform. Modular monorepo with a validated
organization configuration that is provisioned into PostgreSQL and becomes the
source of truth once the database holds an active document.

## Repository layout

```
apps/
  api/   Express + TypeScript API (NodeNext, ESM)
  web/   React + Vite + Tailwind operator console
packages/
  shared/          Money (kobo), roles, permissions, module flags, API wire contracts
  config-schema/  Zod organization-config schema, parse/resolve, stored-payload types
prisma/
  schema.prisma   Organization + versioned OrganizationConfig
  migrations/     Init migration (partial unique index: one ACTIVE config per org)
  seed.ts         Idempotent bootstrap of the organization + ACTIVE config v1
config/
  organization.default.json   Bootstrap defaults (Silverstone branding, fees, modules)
docs/
  adr/                Architecture decision records
.github/workflows/ci.yml
```

## Prerequisites

- Node 22.12+ (npm 10+)
- PostgreSQL 14+ (a local container is fine: see "Database setup")
- Docker (optional, for the disposable verification container)

## Quick start

```sh
npm install

# 1. Database: start a disposable Postgres container
docker run -d --name silverstone-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=silverstone -p 5432:5432 postgres:16-alpine

# 2. Configure the environment
cp .env.example .env
# Edit .env: set DATABASE_URL (and DIRECT_URL) to point at the container.

# 3. Migrate + seed
npm run db:migrate
npm run prisma:generate
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/silverstone" npm run db:seed

# 4. Run (API on :4000, web on :5173 with /api proxied to :4000)
npm run dev
```

Then verify:

```sh
curl http://localhost:4000/api/v1/health/live
curl http://localhost:4000/api/v1/health/ready
curl http://localhost:4000/api/v1/system/info
```

`/health/ready` reports database reachability and latency separately from the
liveness probe. `/system/info` returns the resolved organization configuration
with `source: "database"` once the seed has run (or `source: "bootstrap"` when
unprovisioned).

## Scripts (root)

| Script               | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | API + web concurrently (tsx watch + Vite)                |
| `npm run build`      | packages → api → web (tsc + Vite)                        |
| `npm run typecheck`  | TypeScript across all workspaces                         |
| `npm run lint`       | ESLint (flat config, typescript-eslint)                  |
| `npm run test`       | Vitest in every workspace                                |
| `npm run check`      | format:check + lint + typecheck + test + build (CI gate) |
| `npm run db:migrate` | `prisma migrate dev`                                     |
| `npm run db:deploy`  | `prisma migrate deploy` (production)                     |
| `npm run db:seed`    | Idempotent bootstrap of org + ACTIVE config v1           |

## Environment variables

All variables are validated at startup (fail-fast, secret-free errors).
See `.env.example` for the full list with comments. The minimum a running
deployment needs:

- `DATABASE_URL` — PostgreSQL connection string (user:password required).
- `CORS_ORIGINS` — comma-separated origin allowlist (required in production).
- `NODE_ENV`, `PORT`, `LOG_LEVEL` — standard.

## Architecture notes

- **Modular monolith.** `apps/api` keeps routes / services / repositories in
  per-module folders; business logic lives out of handlers.
- **Money as integer kobo.** No floating-point currency anywhere. All
  formatting flows through `@silverstone/shared`'s `formatNaira` (en-NG, NGN).
- **Configuration precedence.** Database document → bootstrap file, wholesale
  (no deep merge). `resolveOrganizationConfig` reports the source so operators
  can tell a provisioned deployment from an unprovisioned one.
- **No payment or resident-activation logic in Phase 0.** Zest keys,
  transaction API, and email provider are Phase 4 concerns.

See `docs/adr/` for the full record of decisions.
