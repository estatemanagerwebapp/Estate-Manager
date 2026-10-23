# Phase 1 — identity, authentication, RBAC, audit

Status: complete. Builds on the Phase 0 foundation (commit `4e7dcbc`);
Phase 2 has not started.

## Scope

| Area             | Shipped                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data model       | `User`, `Session`, `PasswordResetToken`, `AuditEvent` (migration `20261023091817_add_identity`, applied to `silverstone` and `silverstone_test`)                                          |
| Shared contracts | `packages/shared/src/auth-contract.ts` (DTOs, `AUDIT_EVENT_TYPES`, `PASSWORD_POLICY`, `validatePasswordPolicy`), `user.manage` in `PERMISSIONS` + role baselines                          |
| Sessions         | Opaque cookie (`silverstone.session`, HttpOnly, SameSite=Lax, Secure in production); server-side row with revocation; 7-day default lifetime                                              |
| Passwords        | Argon2id (native) with self-describing PBKDF2-SHA256 fallback; dummy-hash timing equalization on unknown emails                                                                           |
| Reset flow       | Hashed single-use tokens, 60-min default TTL, session revocation on use, no account enumeration                                                                                           |
| Auth endpoints   | `POST /auth/login` `POST /auth/logout` `GET /auth/me` `POST /auth/change-password` `POST /auth/forgot-password` `POST /auth/reset-password` — all rate-limited, generic failure responses |
| User management  | `GET /auth/users` `GET /auth/users/:id` `POST /auth/users/:id/status` `POST /auth/users/:id/role` — permission-gated (`user.manage`), escalation guards, last-active-super-admin guard    |
| Email            | `EmailAdapter` interface; `console` (default) / `resend` / `mock` providers                                                                                                               |
| Audit            | Append-only `AuditEvent` insert-only repository; metadata sanitizer; wire↔DB event-name map                                                                                               |
| Bootstrap CLI    | `npm run bootstrap:admin` (idempotent, env or prompt, policy-validated, no default credentials)                                                                                           |
| Frontend         | Login / forgot / reset / overview / account / users admin pages, auth context + route guards, permission-aware nav                                                                        |
| Tests            | 51 API tests (unit + integration incl. auth flow, RBAC, bootstrap, audit) + web smoke test; full `npm run check` green                                                                    |
| CI               | `quality` job (format/lint/typecheck/test/build) + `database` job now creates `silverstone_test` and runs the API integration suite                                                       |
| Docs             | This page, `ADR-0005` (auth/session/hashing decisions), updated `environment.md`, `database.md`, `development.md`                                                                         |

## Audit event types

`login.succeeded`, `login.failed`, `logout`, `password.changed`,
`password.reset_requested`, `password.reset_completed`,
`account.suspended`, `account.reactivated`, `account.disabled`,
`user.role_changed`, `admin.bootstrap`.

## Security invariants (enforced, not just tested)

1. The caller's identity is always read from the authenticated session
   row — never from the request body.
2. `ESTATE_ADMIN` cannot manage `SUPER_ADMIN` targets; no actor can
   change their own status/role; roles only move strictly down.
3. The last active `SUPER_ADMIN` cannot be closed or demoted.
4. Reset tokens are stored hashed; a leaked token table yields no
   reusable credentials.
5. Audit rows are insert-only from application code; sensitive keys are
   stripped defense-in-depth.
6. Suspended / disabled accounts fail every authenticated request
   (status is re-checked on each request in `requireAuth`).

## Verification performed

- `npm run check` (format, lint, typecheck, test, build) — green.
- Integration suite against `silverstone_test`: 17/17 auth-flow tests.
- Deploy + seed against the docker `silverstone-pg` container;
  `bootstrap:admin` smoke-tested; login via the web console verified
  end-to-end.
- Phase 2 work: none (no estate, billing, or onboarding features
  started).
