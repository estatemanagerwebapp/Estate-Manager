# ADR — Local development database: disposable container

- Status: accepted
- Date: 2026-10-22
- Phase: 0

## Context

Developers need a PostgreSQL instance that is zero-config, version-pinned,
and safe to destroy. Shipping a database on the host machine (via
`brew`/`postgres` service) creates version drift and surprise data loss.

## Decision

- Local development uses a **disposable Docker container**
  (`postgres:16-alpine`), not a host service.
- Container is ephemeral: no volume mounts, no bind mounts. Stop / remove it
  and all data is gone — that is intentional.
- CI uses a `postgres:16` service container with the same image family.
- The connection string is injected via `DATABASE_URL`; the API never hardcodes
  a host/port.

## Consequences

- `docker run` + `npm run db:migrate` + `npm run db:seed` is the entire setup.
- No shared dev database, no `.env` check-in, no "delete my rows" fear.
- The container name (`silverstone-pg`) is a developer choice; CI does not
  care.
