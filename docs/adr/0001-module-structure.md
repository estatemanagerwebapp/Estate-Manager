# ADR — Module structure and layered boundaries

- Status: accepted
- Date: 2026-10-22
- Phase: 0

## Context

The platform will grow to many modules (estates, residents, billing,
payments, gate access, ...). A flat Express app would become unmanageable and
untestable as modules land.

## Decision

Each domain module in `apps/api` owns three layers:

```
modules/<name>/
  <name>.routes.ts    # HTTP surface: validation, status codes, mapping
  <name>.service.ts   # Business rules; the only place decisions live
  <name>.repository.ts# Data access (Prisma); returns domain shapes
```

Rules:

- Handlers never branch on business conditions; they translate.
- Services never import `express` or `@prisma/client` — they depend on the
  repository interface and the shared contracts.
- Repositories return plain domain objects; Prisma's types stop at the
  repository boundary.
- Cross-module calls go through services, never across repositories.

## Consequences

- A module can be extracted to a separate service in a later phase without
  rewriting its internals (the boundary is already clean).
- The API grows linearly: adding a module touches no shared files.
- Tests inject fakes at the repository interface; no HTTP server needed.
