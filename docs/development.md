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

A disposable container keeps each session clean:

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
