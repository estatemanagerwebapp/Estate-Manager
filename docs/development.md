# Local development

This page is the day-to-day runbook for a developer who just cloned the
repository. For design rationale, see `docs/adr/`.

## One-time setup

```sh
git clone <repo> "Silverstone Managers"
cd "Silverstone Managers"
npm install            # workspace install: packages/* and apps/*
```

Node 22.12+ is required (`engines` field). npm workspaces hoist shared
devDependencies to the root `node_modules`.

## Database (per session)

A disposable container keeps each session clean — this is what CI uses
(see `.github/workflows/ci.yml`). Local development now defaults to the
Supabase project instead (see `docs/database.md` → Supabase); keep the
docker container only when you want a fully offline/local database.

```sh
docker run -d --name silverstone-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=silverstone -p 5432:5432 postgres:16-alpine

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/silverstone"

npm run db:migrate     # applies prisma/migrations/* (safe, idempotent)
npm run prisma:generate
```

Tear-down at the end of the session:

```sh
docker rm -f silverstone-pg
```

## Environment

```sh
cp .env.example .env
# Edit .env: point DATABASE_URL at your container (or a managed instance).
```

`.env` is git-ignored. Never commit it. The API validates every variable at
startup and refuses to boot with an invalid or missing required value
(`EnvironmentError` lists each problem).

## Running

```sh
npm run dev          # API on :4000, web on :5173 (Vite proxies /api → :4000)
```

Or individually:

```sh
npm run dev -w @silverstone/api
npm run dev -w @silverstone/web
```

## Seeds

`npm run db:seed` is idempotent: it upserts the organization and, if none
exists, creates the initial ACTIVE configuration (version 1) from
`config/organization.default.json`. Re-running it against a provisioned
database is a no-op.

## Tests

```sh
npm run test         # vitest in every workspace
npm run test:watch   # api only
npm run check        # the full gate: format, lint, typecheck, test, build
```

Unit tests (shared, config-schema, api middleware/app) run without a
database. The API tests inject a fake `checkDatabase` and a fake repository
into `createApp`, so no live Postgres is required to run the suite.

### Phase 1 integration tests (auth flow)

`apps/api/src/auth-flow.test.ts` exercises the real auth routes against
real Prisma repositories, so it needs a live database. It reads
`SILVERSTONE_TEST_DATABASE_URL` (default:
`postgresql://postgres:postgres@localhost:5432/silverstone_test`) — a
separate database from development so the suites never share rows:

```sh
docker exec silverstone-pg psql -U postgres -c 'CREATE DATABASE silverstone_test'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/silverstone_test" \
  npm run db:deploy
SILVERSTONE_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/silverstone_test" \
  npm test -w @silverstone/api
```

The suite creates a dedicated test organization per run and cleans up
after itself; it is safe to run repeatedly against the same database.

## First administrator

After the seed, create the first `SUPER_ADMIN`:

```sh
ADMIN_EMAIL=ops@example.com ADMIN_PASSWORD='…' npm run bootstrap:admin -w @silverstone/api
```

The command is idempotent (a no-op when a super admin already exists) and
never logs or echoes the password. See `docs/adr/0005-auth-sessions.md`.

After signing in, create later staff accounts from **Administrators**
(`user.manage`). The screen generates a one-time temporary password and the
new account must change it at first sign-in. Resident accounts are created by
the resident onboarding/payment flow, not from the Administrators screen.
