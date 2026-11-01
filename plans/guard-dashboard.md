# Guard Dashboard — Gate Desk

**Status:** Implemented and verified
**Scope:** A role-specific home for `GUARD`. SOS and gate verification only; no
other operator module work in this step.

## Objective

A gateman has one job: watch SOS and check people in and out. Landing on the
operator overview loaded an estate-management dashboard they cannot act on —
KPI cards resolving to "n/a", a property chart, and an audit feed that returned 403. This step replaces that default home for `GUARD` with a focused gate desk.

The guard home delivers:

- active SOS alerts, newest first, with a direct link to the SOS queue;
- an "expected today" list of visitor codes valid today;
- today's granted/denied verification counts;
- the day's most recent verification attempts;
- a single action that opens the existing gate screen.

## Non-goals

- No new permissions or role changes. The page reuses `sos.read`, `gate.read`,
  `verification.read` and `gate.manage`.
- No scheduled-arrival field on access codes. "Expected today" is derived from
  the existing `issuedAt` / `validUntil` window.
- No verify-code modal on the home. Verification stays on `/app/gate` so there
  is exactly one place an attempt is recorded.
- No changes to the operator overview for every other role.
- No real-time push. The guard refreshes manually, and the page reuses the SPA
  cache invalidation conventions.

## Decisions

- **Role-aware home, single route.** `/app` renders `DashboardHome`, which
  branches on `user.role === 'GUARD'`. The URL does not change, so existing
  links, redirects and the post-login destination keep working.
- **A dedicated aggregate.** `GET /api/v1/dashboard/guard` returns exactly the
  four gate/SOS sections in one request. The loader deliberately does not call
  the estate, property, finance or complaint counters.
- **`null` still means "hidden", never zero.** Each section is `null` when the
  role lacks the matching read permission, so a restricted role sees an
  explanatory line rather than a misleading `0`.
- **"Expected today" means**: status `ACTIVE`, still valid (or no expiry), and
  either issued today or expiring before the day ends. A standing code issued
  before today with no expiry is excluded — nobody scheduled that visitor, and
  including every open-ended code would turn the list into a second register.
- **Day boundary is the server's local calendar day.** The organization
  timezone is display-only in the config schema today; the loader takes an
  injectable clock so the boundary is deterministic in tests and can move with
  the timezone once scheduling modules consume it.
- **Counts are server-side.** Verification totals come from a grouped count and
  the expected list from an indexed query, not from a capped client-side list.
- The endpoint requires `verification.read` (the gate-work capability the guard
  baseline holds); individual sections still degrade to `null`.

## Surfaces

| Surface                                        | Detail                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/dashboard/guard`                  | `GuardOverviewDto`: `activeSos`, `activeSosEvents` (max 3), `expectedToday` (max 50), `verificationsToday`, `recentVerifications` (max 5), `generatedAt` |
| `apps/web/src/pages/DashboardHome.tsx`         | Role-aware home: `GUARD` → gate desk, everyone else → operator overview                                                                                  |
| `apps/web/src/pages/GuardOverviewPage.tsx`     | SOS panel, three counters, expected list, recent verifications, gate CTA                                                                                 |
| `apps/web/src/api/hooks.ts`                    | `useGuardOverview`                                                                                                                                       |
| `packages/shared/src/dashboard-contract.ts`    | `GuardOverviewDto`, `GuardVerificationCountsDto`                                                                                                         |
| `apps/api/src/modules/gate/gate-repository.ts` | `listExpectedToday`, `countVerificationsToday`, `occurredAt` window on `listVerifications`                                                               |

## Verification

- API: `dashboard.test.ts` covers unauthenticated (401), a role without
  `verification.read` (403), and a guard reading SOS, expected visitors,
  today's granted/denied counts and the newest attempts. The expected-list test
  asserts inclusion and exclusion with a fixed clock: issued today, expiring
  today, valid-for-days, old open-ended, and revoked.
- Web: `GuardOverviewPage.test.tsx` covers counters, visitor detail, the SOS and
  gate render, calm/empty states, permission fallbacks and the loading state.
- Typecheck, lint, format check, shared build and the production web build pass.
- Web suite: 90 tests across 21 files.

## Rollback

- Revert the web home branch to always render `OverviewPage`, then remove the
  page, hook, query key and client method.
- Remove `GET /dashboard/guard` and the three repository helpers.
- The contract additions and the `occurredAt` filter are additive; leaving them
  in place is harmless.
