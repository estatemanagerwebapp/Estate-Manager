# Phase 0 — Foundation

This document records what Phase 0 ships, how to verify it, and what it
deliberately does not contain.

## Deliverables

| #   | Deliverable                                      | Where                                |
| --- | ------------------------------------------------ | ------------------------------------ |
| 1   | Modular monorepo (npm workspaces)                | `package.json`, `apps/`, `packages/` |
| 2   | Validated environment config (Zod, fail-fast)    | `apps/api/src/config/env.ts`         |
| 3   | Prisma schema + init migration + idempotent seed | `prisma/`                            |
| 4   | Organization config schema (Zod, versioned)      | `packages/config-schema/`            |
| 5   | Shared wire contracts + money utilities          | `packages/shared/`                   |
| 6   | API: health (live/ready) + system info, DI       | `apps/api/src/modules/`              |
| 7   | Error envelope, request IDs, structured logging  | `apps/api/src/lib/`, `middleware/`   |
| 8   | Web foundation (health polling + money demo)     | `apps/web/src/`                      |
| 9   | CI + docs + lint/test scripts                    | `.github/workflows/ci.yml`, `docs/`  |

## Verification

```sh
npm run check   # format:check + lint + typecheck + test + build (all workspaces)
```

For a real-database pass:

```sh
docker run -d --name silverstone-pg -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=silverstone \
  -p 5432:5432 postgres:16-alpine
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/silverstone"
npm run db:deploy && npm run prisma:generate && npm run db:seed
DATABASE_URL="$DATABASE_URL" node apps/api/dist/main.js &
curl -s localhost:4000/api/v1/health/ready | grep '"status":"ok"'
```

## What Phase 0 does NOT include

- No payment provider integration (Zest keys/webhooks arrive in Phase 4).
- No resident-activation or onboarding flows.
- No RBAC enforcement beyond the shared permission contract.
- No domain entities beyond `Organization` and `OrganizationConfig`.

These omissions are intentional and tracked in the roadmap; they are not
leftovers.
