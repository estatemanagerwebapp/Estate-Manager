# ADR — Phase 1: authentication, sessions, and password storage

- Status: accepted
- Date: 2026-10-23
- Phase: 1

## Context

Phase 0 shipped the API skeleton, shared contracts, and organization
configuration. Phase 1 adds the identity surface: staff accounts,
server-side sessions, password reset, and an append-only security audit
log. The key decisions had to balance security, operability, and test
isolation without adding infrastructure beyond the Phase 0
disposable-database posture.

## Decision

### Sessions

- Sessions are **opaque random ids** (16 bytes of `crypto.randomBytes`,
  hex-encoded) stored in an **HttpOnly, SameSite=Lax** cookie named
  `silverstone.session`. The browser holds nothing else.
- The database row (`sessions.expires_at`) is the source of truth: a
  null `expires_at` means the session was revoked, a past timestamp
  means it expired. `logout`, `change-password`, `reset-password`, and
  `suspend` each revoke the relevant session(s) by writing `NULL`.
- Default lifetime is 7 days, configurable via `SESSION_LIFETIME_DAYS`.
- `Secure` is set only in production; `SameSite=Lax` is always set
  (blocks cross-site POST CSRF without a separate token).
- Cookie options are centralized in `lib/session-cookie.ts` so the
  `Secure`/`SameSite` posture has one home.

### Password hashing

- Primary: **Argon2id** via the `argon2` native module (0.45.1), tuned
  per the package's recommended parameters.
- Fallback: PBKDF2-SHA256 at 600,000 iterations when the native module
  cannot load (runners without a C++ toolchain). The stored hash format
  is self-describing (a `$argon2id$` prefix vs. a `pbkdf2$` prefix), so
  `verify` routes by scheme and a fallback-deployed password remains
  verifiable by an argon2-deployed server.
- Helper utilities (`sha256Hex`, `generateOpaqueToken`) live in
  `lib/password.ts` alongside the backends.
- **Timing equalization**: login against an unknown email address runs a
  verification against a pre-computed dummy hash so response time does
  not reveal whether the address exists.

### Password reset

- A 32-byte random token is generated; only its **SHA-256 hash** is
  stored (`password_reset_tokens.token_hash`). The plaintext token
  appears in exactly one place: the reset email.
- **Single-active-token policy**: requesting a new reset consumes the
  outstanding token for the user, so at most one is in flight.
- Default TTL is 60 minutes (`RESET_TOKEN_TTL_MINUTES`).
- Using a reset token revokes every session for that user, so a
  compromised token does not leave stale sessions alive.
- The reset endpoint returns the same `200 { ok: true }` body whether
  or not the address is known (no account enumeration), and the audit
  log records `unknown_email` failures without exposing which address
  was probed.

### Authorization (RBAC)

- Roles are stored as plain `VARCHAR(20)` matching the shared
  `ROLE_KEYS` / `ACCOUNT_STATUSES` constants; only
  `AuditEventType` / `AuditEventOutcome` are Prisma enums.
- A `PermissionResolver` answers "does this role have this permission?"
  by combining the role's baseline (from `permissionsForRole` in
  `@silverstone/shared`) with any organization-level grants loaded via
  an injected `loadGrants` closure. Unknown roles and grants that
  reference permissions no longer in the catalogue fail closed to an
  empty permission set.
- **Privilege-escalation guards** (`user-rules.ts`, pure functions):
  - No self role/status changes.
  - `ESTATE_ADMIN` cannot manage `SUPER_ADMIN` targets.
  - A role may only be set to a value strictly below the actor's
    current role (peers may be reassigned among themselves by
    `SUPER_ADMIN` only).
  - The last active `SUPER_ADMIN` cannot be suspended, disabled, or
    demoted (the `409 CONFLICT` guard in `user.service.ts`).
  - Unknown roles fail closed.

### Email delivery

- The auth service depends on an `EmailAdapter` interface; concrete
  implementations: `ConsoleEmailAdapter` (default, logs locally),
  `ResendEmailAdapter` (production), `MockEmailAdapter` (tests).
- The factory (`email-adapter-factory.ts`) reads `EMAIL_PROVIDER`
  (`console` | `resend` | `mock`) and `RESEND_API_KEY` (Zod
  superRefine enforces the key's presence when the provider is
  `resend`).

### Audit logging

- **Append-only**: `PrismaAuditRepository` exposes only `record`
  (insert); there is deliberately no `update` or `delete` method.
- Sensitive metadata keys are stripped defense-in-depth by
  `sanitizeMetadata` (a second layer over the service-layer discipline
  of never putting secrets in metadata).
- Wire event names are dotted (`login.succeeded`); the database stores
  underscored enum values (`login_succeeded`); the translation is a
  single map in `audit-repository.ts`.

### Rate limiting

- Per-endpoint limiters: login (10/15min), forgot-password (5/15min),
  reset-password (5/1h), on top of the existing API-wide limiter.
- Limits are overridable via `AuthRouteOptions.rateLimits` so the
  integration test suite (which issues far more than the production
  caps) never trips them.

### Organization id

- The routes operate on the organization's **database UUID**, not its
  slug. The id is resolved once at startup in `createAppDependencies`
  (now async) via `resolveOrganizationId` and passed to the auth router
  through `AuthRouteOptions.organizationId`.

### Bootstrap

- `apps/api/src/bootstrap-admin.ts` (`npm run bootstrap:admin` in the
  api workspace) is the idempotent CLI for creating the first
  `SUPER_ADMIN`. It reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the
  environment or prompts on a trusted local terminal, validates the
  password against the shared policy, reuses
  `AuthService.bootstrapSuperAdmin` (a no-op when a super admin
  already exists), and never logs or echoes the password.

## Consequences

- A fresh deployment's first action is `bootstrap:admin`; there are
  no default credentials.
- An attacker who exfiltrates `password_reset_tokens` cannot recover
  any password (the table stores only hashes).
- A suspended account's sessions stop working immediately (the status
  check in `requireAuth` runs on every authenticated request).
- The last-active-super-admin guard means a deployment can never lock
  itself out of recovery.
- Test suites that issue many logins must raise the per-endpoint
  limiter caps (done via `AuthRouteOptions.rateLimits`).
