# ADR — Organization configuration: versioned document, database wins

- Status: accepted
- Date: 2026-10-22
- Phase: 0

## Context

Estate management behavior (asset model, fees, modules, branding, roles)
varies per deployment. Two sources exist:

1. `config/organization.default.json` — bootstrap defaults in the repository.
2. An `OrganizationConfig` row in PostgreSQL, versioned per organization.

Once an organization is provisioned, the database document is the source of
truth. The repository file is a _first-boot default_, not a live override.

## Decision

- The Zod schema in `packages/config-schema` is the single source for what a
  configuration document may contain. `parseOrganizationConfig` fails closed
  with readable per-field issue paths.
- `schemaVersion` is stamped by code (`CONFIG_SCHEMA_VERSION`), never
  trusted from input. A deployment refuses to boot with a document whose
  schema major it does not support.
- **Database wins wholesale.** If an ACTIVE document exists, it is used
  entirely; bootstrap defaults are never deep-merged into it. Merging would
  let a release from a newer repository silently change live behavior.
- `resolveOrganizationConfig` reports the source:
  - `source: 'database'` — a stored document was found and validated;
  - `source: 'bootstrap'` — unprovisioned deployment, version 0.
- Provisions (seeding / admin config changes) create the _next_ version,
  atomically archiving the previous ACTIVE document in the same transaction.
  A partial unique index (`organization_configs_one_active_per_org`) enforces
  at most one ACTIVE document per organization.

## Consequences

- An unprovisioned deployment runs on repository defaults until someone
  provisions; diagnostics can tell the two apart.
- Config drift between releases is impossible by construction: the database
  document is validated on read, and an invalid document surfaces as
  `CONFIG_INVALID` (503) instead of silent degradation.
- Admin-editing a live config becomes a new version; history is retained.
