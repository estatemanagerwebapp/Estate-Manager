# UI Design Plan — Operator Console (HTML-first)

Date: 2026-10-23
Status: Draft for review
Method: Design in static HTML/CSS first, iterate, **then** port to React (Vite SPA + react-router-dom + TanStack Query + shadcn/ui on Radix — fastest path; keep Vite, no Next.js rewrite).

## 1. Inputs from the backend

- **Modules** (gated by org config flags): `estates, residents, properties, assignments, billing, payments, gateAccess, maintenance` (on), `power, pettyCash, facilities, shortlet` (off by default).
- **Money**: integer kobo everywhere; UI renders via `formatNaira` only.
- **Branding**: configurable `primaryColor` (#FF5A1F default) + `portalName`.
- **Roles & permissions** exist in shared package → per-user menu/route gating.
- **Errors**: stable `ERROR_CODES` envelope (`ApiErrorBody`) with `requestId` and field-level `details[]` → forms map `VALIDATION_ERROR.details` to fields.
- **System**: `/system/info` returns `config.source` (database vs bootstrap) + `version` → "config not provisioned" banner state.
- **Asset model**: 3 asset types (house, apartment block, land plot) with unit types (studio…4bed, penthouse, shop, office).

## 2. Visual direction (modern SaaS / Notion-style)

- **Typography**: Inter, tight tracking on headings, ~15px body, subtle weight contrast.
- **Color**: white cards on `#F8FAFC` canvas; slate text; single orange accent (token-driven, so org `primaryColor` can retheme later); soft pastels for status.
- **Shape**: 12px radii, 1px slate-200 borders, very soft shadows, light 1–2px inner top highlight on key cards.
- **Chips/badges**: rounded-full, pastel bg + tinted text (paid=green, due=amber, overdue=rose, draft=slate).
- **Density**: comfortable (Notion-like), not dense — tables with 44–48px rows, hover states, zebra off.
- **Icons**: Lucide only, 16/20px, no emoji.
- **Motion**: 150ms ease on hover/expand only; no decorative animation.

Design tokens: extend `index.css` `@theme` (radius, shadow, chip pastels, focus ring) — single source of truth, later consumed by shadcn/ui.

## 3. App shell

- **Sidebar (240px, collapsible to 72px)**: logo/org name → nav sections grouped by module (each item hidden when its module flag is off):
  - Overview (Dashboard)
  - Estates · Properties · Residents · Assignments · Billing · Payments · Gate access · Maintenance
  - Bottom: "Settings & config" (org config, roles), user chip w/ role.
- **Top bar (56px)**: page title + breadcrumb, global search ⌘K, config-source indicator dot (database/badge), user menu.
- **Content**: max-width 1200px, 24–32px gutters, 24px spacing.

## 4. Page patterns (build these as reusable HTML templates)

| Pattern                      | Used on                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **List page**                | filter bar (search + status chips) → table (sticky header, pagination, row actions menu)                    | estates, properties, residents, invoices |
| **Detail page**              | header w/ entity name + status chip + primary action; tabbed body (Overview / History / Notes)              | property detail, resident detail         |
| **Dashboard**                | 4 KPI cards (row of equal cards, no nesting) + 2 panels (recent activity, attention list e.g. overdue fees) | Overview                                 |
| **Record form**              | 2-col responsive, section cards, inline validation from `details[]`, sticky footer (Cancel / Save)          | create/edit estate, resident, invoice    |
| **Wizard**                   | stepper (Invite → Details → Payment → Done), one step per screen                                            | resident onboarding (invite)             |
| **Empty / error / skeleton** | consistent per module                                                                                       | everywhere                               |
| **Dialogs**                  | confirm, quick-add, detail drawer (right, 480px)                                                            | row actions                              |

## 5. Concrete flow: resident onboarding (first full module flow)

1. Residents list → filter "Invitations pending" → **"Invite resident"** button.
2. Wizard (guest, reached via persistent code): (a) prefilled invitee details (read-only), (b) gender / marital status / property type / next of kin, (c) ID type + ID document upload, (d) payment reference submission (temporary walk-through — gateway not yet connected).
3. Admin marks the resident **Paid** on the Residents screen.
4. **Account creation:** if all required fields are complete (gender, marital status, next of kin, ID type + document, email), marking Paid immediately creates the resident's `USER` account with role `RESIDENT`, generates a one-time demo password, and shows it to the admin in a modal to share with the resident. The resident's first login forces a password change. If fields are missing, payment is recorded but the account is not created until the resident completes the wizard.
5. Resident detail: tabs Overview (contacts, dependants, asset), Payments (fee + invoices), Activity (audit log).

## 6. Resident Portal (`/resident/*`)

Separate, login-gated surface for residents (`portalName` branding). Distinct from the operator console (`/app/*`).

**Routes:**

| Route                           | Description                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/resident/login`               | Login with email + demo password issued by estate manager.                                                           |
| `/resident/app/dashboard`       | "Welcome to your dashboard" — resident home.                                                                         |
| `/resident/app/change-password` | Forced first-login password change (when `mustChangePassword = true`). Redirects to `/resident/login` after success. |

**Flow:**

1. Resident logs in at `/resident/login` with the demo password.
2. If `mustChangePassword`, they are sent to `/resident/app/change-password` before reaching the dashboard.
3. After password change, the server revokes all sessions; resident signs back in at `/resident/login`.
4. Dashboard shows welcome message + property/payment info (to be fleshed out in upcoming phases).

## 7. HTML deliverables (iteration artifacts)

Live in `docs/ui/html/` — plain HTML + shared `styles.css` (tokens + primitives: card, chip, table, form, nav, dialog). No framework, no JS beyond small optional behavior:

```
docs/ui/
  index.html            # 0 · shell: sidebar + top bar + all module placeholders
  dashboard.html        # 1 · KPI cards + activity/attention panels
  residents.html        # 2 · list w/ filters + status chips + invite wizard entry
  invite-wizard.html    # 3 · stepper, cascading selects, fees review
  resident-detail.html  # 4 · tabs: overview / payments / activity + drawer
  properties.html       # 5 · estate→property→unit tree pattern
  invoices.html         # 6 · billing table + pay/invoice actions
```

Each page: top-of-file HTML comment noting patterns used + open questions. One shared `styles.css` = the future design-token baseline.

## 7. Acceptance criteria (per screen, when we review)

- Matches shell: sidebar/top bar consistent, module gating visible via "off" examples.
- All money strings are `₦…` formatted (kobo source noted in comments).
- Chips/statuses have a fixed vocabulary (paid/due/overdue/draft/invited/pending/active/inactive).
- Works at 1280px and 1440px widths; mobile is out of scope for now (operator console is desktop-first).
- Every interaction has a default + error + empty + loading representation (skeletons drawn statically).

## 8. After sign-off: port plan

1. `apps/web`: install `react-router-dom`, `@tanstack/react-query`, shadcn/ui (Radix) + Tailwind v4 theme from the approved tokens.
2. Shell components → React; each HTML page → route; data hooks mirror shared API contracts.
3. Validation UI driven by `ApiErrorBody.details`; errors shown with `requestId` copy link.
4. Gate routes/menu items on `SystemInfo.modules` + role grants.

## 9. Open questions

- Resident Portal in scope ✅ — separate surface at `/resident/*` (`portalName` branding); login, dashboard, and forced password-change built. Dashboard content (property, payments) to be fleshed out in upcoming phases.
- Confirm desktop-only for the console (mobile operator access later?)
- Global search ⌘K in v1 or phase 2?

## 10. Resident Dashboard (Phase 3) — execution tracker

Status legend: ✅ done · ⬜ not started · 🔶 in progress

**Decisions (user-confirmed):**

- All 11 resident capabilities granted to `RESIDENT` **on by default** (`portal.access.self`,
  `profile.view`, `property.view`, `invoice.view`, `payment.create`, `code.create`,
  `code.deactivate`, `complaint.create`, `complaint.view`, `message.view`,
  `facility.book`, `sos.create`).
- Registration fee **seeds** the first Invoice + Payment + Transaction (finance never empty).
- **Single property** per resident (`My Properties` returns one, list-shaped response).
- Access codes have a **30-day validity window**, extendable + revocable.

**Blueprint:** `plans/resident-dashboard.md` (S0–S11).

| Step | Page / area                                                                          | Status | Notes                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S0   | Foundation: nav shell, permissions, 12 routes, `/resident` API mount, resident guard | ✅     | Full 12-item sidebar nav; all slugs routable (stub pages); `PERMISSIONS` + `RESIDENT` baseline extended; `packages/shared/src/resident-contract.ts` (all S1–S11 DTOs); `requireResident` guard + `GET /resident/ping`; `createResidentRouter` mounted at `/resident` in `app.ts` + `main.ts`. All 175 API + 9 web tests green, api/web tsc clean, `vite build` OK. |
| S1   | Profile (`profile.view`)                                                             | ✅     | Self-scoped `GET/PATCH /resident/profile` + live profile page. `ResidentProfileService` (user row + onboarding draft + property detail); `resident.profile_updated` audit event (shared + Prisma + web labels); client `getResidentProfile`/`updateResidentProfile`; profile page replaces stub.                                                                   |
| S2   | My Properties (`property.view`)                                                      | ✅     | `GET /resident/properties` → acting resident's assigned property(ies) with full formatted address (config-ordered component join) + raw components; list-shaped response. `ResidentPropertiesService` reuses property/estate repos + config snapshot; empty list when no draft or unresolvable property. Live `ResidentPropertiesPage` replaces stub. |
| S3   | Invoices & Payments (`invoice.view`, `payment.create`)                               | ✅     | Additive `Invoice`/`Payment`/`Transaction` models + migration; `PrismaFinanceRepository`; `ResidentFinanceService` (4-section view, NONE-provider pay, idempotent registration-fee seed on account creation). `GET /resident/finance`, `POST /resident/payments` (self-scoped, 409 paid/void, 404 unknown). `resident.invoice_created` audit event. Live `ResidentInvoicesPage` (outstanding/paid/payments/ledger + pay dialog). `resident-finance.test.ts` 8/8. Also fixed bootstrap config validation (`house.<subtype>` type-key refs + regex `pattern` validation) which was blocking every onboarding flow. |
| S4   | Access Codes (`code.create`, `code.deactivate`)                                      | ⬜     | New `AccessCode` model; generate (30-day window) / extend / deactivate; full code shown once.                                                                                                                                                                                                                                                                      |
| S5   | Complaints (`complaint.create`, `complaint.view`)                                    | ⬜     | New `Complaint`/`ComplaintReply` models; open list + new-complaint form.                                                                                                                                                                                                                                                                                           |
| S6   | Messages (`message.view`)                                                            | ⬜     | New `MessageThread`/`Message` models; thread list + compose pane.                                                                                                                                                                                                                                                                                                  |
| S7   | Community (announcements + estate broadcast)                                         | ⬜     | New `Announcement`/`EstateBroadcast` models; read-only feed.                                                                                                                                                                                                                                                                                                       |
| S8   | Facilities & Bookings (`facility.book`)                                              | ⬜     | New `Facility`/`Booking` models; bookable list + upcoming bookings.                                                                                                                                                                                                                                                                                                |
| S9   | Emergency / SOS (`sos.create`)                                                       | ⬜     | New `SosEvent` model; SOS trigger + resident history.                                                                                                                                                                                                                                                                                                              |
| S10  | Notifications (upcoming bookings + recent)                                           | ⬜     | New `Notification` model; unread badge + mark-read.                                                                                                                                                                                                                                                                                                                |
| S11  | Dashboard home (compose live data)                                                   | ⬜     | `GET /resident/dashboard` aggregate; section cards each link to its page.                                                                                                                                                                                                                                                                                          |

**Cross-cutting (per step):** new Prisma models are **additive** migrations + `prisma generate`;
new audit event types added to shared `AuditEventType` **and** the Prisma enum; resident
endpoints resolve the acting user from the session (never a path param) and verify ownership
of any `:id` resource.
