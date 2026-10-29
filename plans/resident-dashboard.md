# Blueprint — Resident Dashboard (`/resident/app/*`)

**Objective:** Build out the full resident dashboard: a complete navigation shell plus
individual pages (Profile, My Properties, Invoices & Payments, Access Codes, Complaints,
Messages, Community, Facilities, Bookings, Emergency/SOS, Notifications) with matching
API endpoints, shared contracts, permissions, and audit events. Pages are created
**one at a time**, each fully self-contained (contract → API → web → test), so any
step can be executed by a fresh agent without reading prior steps.

**Execution mode:** Direct edit-in-place on `phase-2` (no branching — the repo's existing
workflow is uncommitted-on-branch; keep it that way).

**Invariants that must hold after EVERY step:**

- `npx tsc -p packages/shared/tsconfig.json` then `npx tsc --noEmit -p apps/api` and
  `npx tsc --noEmit -p apps/web` are all clean.
- `cd apps/api && npx vitest run` passes (175+ existing + new tests).
- `cd apps/web && npx vitest run` passes (9+ existing + new tests).
- No destructive DB changes; new Prisma models are additive migrations.
- `RESIDENT` role keeps only `portal.access.self` baseline; new capabilities are
  additive permissions (`profile.view`, `property.view`, `invoice.view`, `payment.create`,
  `code.create`, `code.deactivate`, `complaint.create`, `complaint.view`, `message.view`,
  `facility.book`, `sos.create`) wired into the shared permission catalogue.
- API enforces authorization server-side; the web UI uses permissions only to hide/show.
- All resident endpoints are scoped to the **acting user's own data** — a resident can
  never read another resident's invoices, codes, complaints, or profile.

---

## Dependency graph

```
S0 (foundation: shell nav + permission wiring + contract scaffolding)
 └─ S1  Profile
 └─ S2  My Properties
 └─ S3  Invoices & Payments   (needs new models: Invoice, Payment, Transaction)
 └─ S4  Access Codes          (needs new model: AccessCode)
 └─ S5  Complaints            (needs new models: Complaint, ComplaintReply)
 └─ S6  Messages              (needs new models: MessageThread, Message)
 └─ S7  Community             (needs new models: Announcement, Broadcast)
 └─ S8  Facilities & Bookings (needs new models: Facility, Booking)
 └─ S9  Emergency/SOS         (needs new model: SosEvent)
 └─ S10 Notifications        (needs new model: Notification)
 └─ S11 Dashboard home (composes live data from S1–S10)
```

S1–S10 are **parallelizable** after S0 (they touch disjoint Prisma models and
disjoint API routes; only `main.tsx`, `client.ts`, `ResidentAppShell.tsx`, and
`packages/shared` are shared, so run them serially to avoid merge conflicts on those
files, or run in parallel with per-step file ownership as noted). S11 depends on all of
S1–S10 because it aggregates their data.

**Model-tier guidance:** S0, S3 (billing), and S11 (aggregation) benefit from the
strongest model; S1/S2/S4 are default-tier.

---

## Step S0 — Foundation: shell navigation, permissions, contract scaffolding

**Context brief (cold-start):**
The resident shell (`apps/web/src/components/ResidentAppShell.tsx`) currently has a
single "Dashboard" link. The dashboard route table lives in
`apps/web/src/main.tsx` under the `ResidentAppShell` nested routes (index + dashboard +
change-password). Resident accounts are `RESIDENT`-role users created by
`ResidentOnboardingService.createAccount()`. Permissions come from
`packages/shared/src/permissions.ts` (`PERMISSIONS` array + `DEFAULT_ROLE_PERMISSIONS`).
The web hides/shows actions via `apps/web/src/auth/useCan.ts` (reads
`user.permissions`). The API guard is
`apps/api/src/middleware/auth-guard.ts` (`requireAuth`, `requirePermission`).

**Tasks:**

1. Add the resident capability strings to `PERMISSIONS` in
   `packages/shared/src/permissions.ts`:
   `profile.view`, `property.view`, `invoice.view`, `payment.create`, `code.create`,
   `code.deactivate`, `complaint.create`, `complaint.view`, `message.view`, `facility.book`,
   `sos.create`. (Keep `portal.access.self`.)
2. Update `DEFAULT_ROLE_PERMISSIONS.RESIDENT` to include these new capabilities (they
   are additive; the RESIDENT baseline today is only `['portal.access.self']`).
3. Rebuild shared: `npx tsc -p packages/shared/tsconfig.json`.
4. Add a `resident` export to `packages/shared/src/index.ts` re-exporting the new
   contracts created in later steps (create a stub
   `packages/shared/src/resident-contract.ts` now, export empty, fill per step) so
   there is a single import site.
5. In `ResidentAppShell.tsx`: replace the single link with the full navigation list
   (Dashboard, Profile, My Properties, Invoices & Payments, Access Codes, Complaints,
   Messages, Community, Facilities, Bookings, Emergency/SOS, Notifications) with lucide
   icons. Each link routes to `/resident/app/<slug>`. Keep sign-out. Do NOT gate links
   on permission beyond what the server allows (they all require only a valid resident
   session); gate only specific actions inside pages later.
6. In `apps/web/src/main.tsx`: add a nested route per dashboard page under the
   `ResidentAppShell` block (one placeholder `<Route path="<slug>" element={<X />} />`
   with a trivial stub page that renders the title). Create stub pages in
   `apps/web/src/pages/resident/` (one per slug) so the nav never 404s. Keep
   `change-password`.
7. API: add a `requireSelfResident` guard helper (or reuse `requireAuth` + a role check
   that `role === 'RESIDENT'` OR the route handler verifies the resource belongs to the
   acting user) in a new `apps/api/src/middleware/resident-guard.ts`. This centralizes
   "you can only touch your own data."
8. Add a mount in `apps/api/src/app.ts` for a new `/resident` router (create
   `apps/api/src/modules/resident/resident.routes.ts` that composes the per-domain
   routers from S1–S10 as they land; for now mount an empty router so the app still
   builds).

**Verification:**

- `npx tsc -p packages/shared/tsconfig.json` clean.
- `npx tsc --noEmit -p apps/api` and `-p apps/web` clean.
- `cd apps/web && npx vitest run` green.
- Web build: `cd apps/web && npx vite build` succeeds.
- Every nav link resolves to a (stub) page; no broken routes.

**Exit criteria:** Shell has full nav; all 12 dashboard slugs are routable stubs;
permission catalogue extended; shared package rebuilt; API `/resident` mount exists
(empty). No behavioral regression on existing admin pages.

**Rollback:** Revert `permissions.ts`, the shell, `main.tsx`, `app.ts`, and delete
`resident-contract.ts` + the stub pages. Purely additive — safe to undo.

---

## Step S1 — Profile page (`profile.view`)

**Context brief:**
The logged-in resident's own record is a `User` row (email, phone, fullName, role,
status). The resident's onboarding detail (gender, maritalStatus, nextOfKin, idType,
propertyType, idDocumentUrl) lives on `ResidentOnboarding`, linked via
`userId` (`ResidentOnboarding.userId` ↔ `User.id`). The acting user's id is available
in the API via `getAuth(req)` (see `auth.routes.ts`). `useCan().user` exposes the
logged-in user's id/email/phone/fullName on the web.

**Contracts (add to `packages/shared/src/resident-contract.ts`):**

- `ProfileDto` = user basics (id, email, phone, fullName) + onboarding block
  (gender, maritalStatus, nextOfKinName/Phone/Email, idType, propertyType,
  idDocumentUrl, property identifier + estate).
- `ProfileView` = `{ profile: ProfileDto }`.
- `ProfileUpdateInput` = editable own fields (phone, nextOfKin*, idType, propertyType).
- `ProfileUpdateResponse` = `{ ok: true; profile: ProfileDto }`.

**API (new `apps/api/src/modules/resident/profile.service.ts` + routes under
`resident.routes.ts`):**

- `GET /resident/profile` (auth, RESIDENT) → own user + linked onboarding + property.
- `PATCH /resident/profile` (auth, RESIDENT, `profile.view`) → update allowed own fields;
  never allow changing email/role/status; audit event `resident.profile_updated`
  (new type, add to `AuditEventType` + Prisma enum).
- Scope: always resolve via the **acting user's id**, never a path param — a resident
  cannot fetch anyone else.

**Web (`apps/web/src/pages/resident/ResidentProfilePage.tsx`):**

- Load via new `api.getProfile()` / `api.updateProfile()` methods in `client.ts`.
- Read-only: email, fullName, property/estate, onboarding id fields.
- Editable: phone + next-of-kin block, gated on `useCan().profileView`… actually
  gating edit uses the capability string; show edit controls only when
  `user.permissions` includes the relevant capability.
- Save with toast on success/failure; loading + error states.

**Tests:** API: profile self-fetch returns own data, other-resident id is not fetchable
(no such route — assert only acting-user resolution), PATCH validates + persists +
audits. Web: renders read-only + editable sections.

**Verification:** shared rebuild → api/web tsc clean; api vitest green; web vitest green.

**Exit:** Profile page live, self-scoped, audited.

---

## Step S2 — My Properties (`property.view`)

**Context brief:**
A resident is bound to exactly one property via `ResidentOnboarding.propertyId`
(→ `Property` → `Estate`). `PropertyDto` (in
`packages/shared/src/property-contract.ts`) already models identifier, typeKey/Label,
addressComponents, parent property. Address component **labels** come from
`api.getPropertyOptions()` (a config read) — reuse it to render component values with
their human labels, exactly as `PropertyDetailPage.tsx` does.

**Contracts:**

- `ResidentPropertyDto` = the resident's property: identifier, typeKey/Label,
  estate { name, slug }, full address string (label: value joined), addressComponents,
  unit type, status.
- `ResidentPropertiesResponse` = `{ property: ResidentPropertyDto }`.

**API:**

- `GET /resident/properties` (auth, RESIDENT, `property.view`) → resolve the acting
  user's onboarding → property + estate + config component labels; return the one
  assigned property. (One property today; shape is a list-friendly object so a
  future multi-property assignment is non-breaking.)
- Reuse the property-loading helper already injected into
  `ResidentOnboardingService` (`loadProperty`) — lift it into a shared
  `PropertyRepository` call to avoid duplicating the estate relation query.

**Web (`apps/web/src/pages/resident/ResidentPropertiesPage.tsx`):**

- `api.getResidentProperties()`.
- Card showing identifier, type, estate, and the **full formatted address**
  (iterate `addressComponents` with labels from `getPropertyOptions()`, same pattern as
  `PropertyDetailPage`). Empty state when the property can't be resolved.

**Tests:** API resolves the acting resident's property; unknown user → empty. Web renders
address components with labels.

**Verification:** tsc clean; api/web vitest green.

**Exit:** "My Property" page shows the full address of the assigned property.

---

## Step S3 — Invoices & Payments (`invoice.view`, `payment.create`)

**Context brief (largest step — use strongest model):**
No billing models exist yet. This step introduces the financial domain. The registration
fee already lives on `ResidentOnboarding` (`paymentStatus`, `paymentRef`, `paidAt`),
but recurring invoices/payments/transactions do not. Introduce additive models; no
destructive changes to existing tables.

**New Prisma models (additive migration):**

- `Invoice` (id, organizationId, userId, propertyId, period, amountKobo, currency,
  status [UNPAID|PAID|OVERDUE|VOID], dueAt, issuedAt, createdAt, updatedAt; index
  `[organizationId, userId, status]`).
- `Payment` (id, organizationId, userId, invoiceId, amountKobo, method, reference,
  paidAt, createdAt; index `[userId]`, `[invoiceId]`).
- `Transaction` (id, organizationId, userId, kind [INVOICE|PAYMENT|REFUND|FEE],
  amountKobo, signed (credit positive/debit negative), memo, occurredAt, reference;
  index `[organizationId, userId, occurredAt desc]`).

**Contracts:**

- `InvoiceDto`, `PaymentDto`, `TransactionDto`,
- `ResidentFinanceView` = `{ outstanding: InvoiceDto[]; paid: InvoiceDto[];
payments: PaymentDto[]; transactions: TransactionDto[] }`.
- `CreatePaymentInput` = `{ invoiceId, method?, reference? }`;
  `CreatePaymentResponse` = `{ ok: true; payment: PaymentDto }`.

**API (`resident.routes.ts`):**

- `GET /resident/invoices` (auth, RESIDENT, `invoice.view`) → outstanding + paid for the
  acting user.
- `GET /resident/transactions` (auth, RESIDENT, `invoice.view`) → payment history
  (paginated).
- `POST /resident/payments` (auth, RESIDENT, `payment.create`) → record a payment against
  an invoice belonging to the acting user (verify ownership: 404 if not theirs).
  **Provider is `NONE`** (no Zest wired), so this records a reference; set the invoice
  PAID when payments cover the amount. Audit `resident.payment_recorded`.
- All scoped strictly to `userId === actingUser.id`.

**Web (`apps/web/src/pages/resident/ResidentInvoicesPage.tsx`):**

- `api.getResidentInvoices()`, `api.getResidentTransactions()`,
  `api.createResidentPayment()`.
- Four sections: Outstanding Bills, Paid Bills, Payment History, Transaction History
  (tables/cards). "Pay" action on outstanding (opens a small form for method/reference).
  Loading/skeleton + empty states.

**Tests:** API ownership scoping (user A cannot pay/read user B's invoices), payment
creates + flips invoice status, transaction ledger reflects it, audit written. Web
renders the four sections.

**Verification:** migration applied to the **local/test DB only** (never a shared
destructive op on the remote Supabase — run the additive migration locally and confirm
`prisma migrate diff` is clean); tsc clean; api/web vitest green.

**Exit:** Finance page with all four sections + a working (NONE-provider) payment
flow scoped to the resident.

---

## Step S4 — Access Codes (`code.create`, `code.deactivate`)

**Context brief:**
Introduce `AccessCode` (id, organizationId, userId, propertyId, kind
[ENTRY|EXIT|BOTH], code (hashed like the onboarding code; store hash + a display prefix),
status [ACTIVE|REVOKED], extendedUntil (nullable), issuedAt, revokedAt, createdAt;
index `[organizationId, userId, status]`). Codes are **persistent** like the onboarding
code (no TTL) but can be **extended** (extend = set `extendedUntil` further out) or
**deactivated**.

**Contracts:**

- `AccessCodeDto` (code prefix + kind + status + validity window; never the full hash).
- `GenerateAccessCodeInput` = `{ kind, durationHours? }`;
  `GenerateAccessCodeResponse` = `{ ok: true; code: string; codeId: string }`
  (full code returned **once**, like the onboarding demo password).
- `ExtendAccessCodeResponse` = `{ ok: true; code: AccessCodeDto }`.

**API:**

- `GET /resident/codes` (auth, RESIDENT, `code.create`) → active codes for the acting
  user (show prefix + validity, not the raw secret).
- `POST /resident/codes` (auth, `code.create`) → generate; return the full code once.
- `POST /resident/codes/:id/extend` (auth, `code.create`) → extend validity.
- `POST /resident/codes/:id/deactivate` (auth, `code.deactivate`) → revoke.
  All verify code ownership (`userId === acting`). Audit events
  `resident.code_generated`, `resident.code_extended`, `resident.code_deactivated`
  (new types).

**Web (`apps/web/src/pages/resident/ResidentCodesPage.tsx`):**

- List of active codes (copy prefix, show kind + validity), "Generate" button
  (modal showing the new full code once, with copy), "Extend" and "Deactivate"
  actions per code.

**Tests:** ownership scoping, generate returns code once, extend extends window,
deactivate revokes, all audited. Web render + generate modal.

**Verification:** tsc clean; api/web vitest green; migration additive.

**Exit:** Access Codes page with generate / extend / deactivate, self-scoped.

---

## Step S5 — Complaints (`complaint.create`, `complaint.view`)

**Context brief:**
Introduce `Complaint` (id, organizationId, userId, propertyId, category, subject,
description, status [OPEN|IN_PROGRESS|RESOLVED|CLOSED], createdAt, updatedAt,
resolvedAt; index `[organizationId, userId, status]`) and `ComplaintReply`
(id, complaintId, authorId [estate office], body, createdAt) so the estate office can
respond and the resident sees the thread.

**Contracts:**

- `ComplaintDto` (includes the reply thread),
- `CreateComplaintInput` = `{ category, subject, description }`;
  `CreateComplaintResponse` = `{ ok: true; complaint: ComplaintDto }`.

**API:**

- `GET /resident/complaints?status=open` (auth, `complaint.view`) → resident's
  complaints (default: open ones; the dashboard uses this for "Open Complaints").
- `POST /resident/complaints` (auth, `complaint.create`) → file a complaint on the
  acting resident's property. Audit `resident.complaint_created`.

**Web (`apps/web/src/pages/resident/ResidentComplaintsPage.tsx`):**

- List of the resident's complaints (open first, with reply threads). "New complaint"
  form (category + subject + description).

**Tests:** create + list scoped to acting resident; status filter. Web render.

**Verification:** tsc clean; api/web vitest green; migration additive.

**Exit:** Complaints page (open complaints + file new), self-scoped.

---

## Step S6 — Messages (`message.view`)

**Context brief:**
Introduce `MessageThread` (id, organizationId, residentUserId, subject, status
[OPEN|CLOSED], createdAt, updatedAt) and `Message` (id, threadId, senderRole
[RESIDENT|ESTATE_OFFICE], body, createdAt). A resident can view their threads and
post into an open thread (posting reuses `message.view` scope + is self only).

**Contracts:**

- `MessageThreadDto` (with messages), `SendMessageInput` = `{ threadId?, subject?,
body }`; `SendMessageResponse`.

**API:**

- `GET /resident/messages` (auth, `message.view`) → the acting resident's threads +
  recent messages.
- `POST /resident/messages` (auth, `message.view`) → create a thread or reply (self
  scope). Audit optional (`resident.message_sent`).

**Web (`apps/web/src/pages/resident/ResidentMessagesPage.tsx`):**

- Thread list + a read pane; post a message into an open/new thread.

**Tests:** thread + message creation scoped to acting resident. Web render.

**Verification:** tsc clean; api/web vitest green; migration additive.

**Exit:** Messages page (estate-office ↔ resident), self-scoped.

---

## Step S7 — Community (`estate broadcast`, `latest announcements`)

**Context brief:**
Introduce `Announcement` (id, organizationId, title, body, authorId, publishedAt,
createdAt) and `EstateBroadcast` (id, organizationId, estateId, title, body,
priority, issuedAt, createdAt) as **read-only** feeds for residents (created by the
estate office elsewhere; residents only read). The dashboard "Estate Office" section
shows Open Complaints (from S5) + Latest Announcements + a broadcast alert.

**Contracts:**

- `AnnouncementDto`, `BroadcastDto`,
- `ResidentCommunityView` = `{ announcements: AnnouncementDto[]; broadcast:
BroadcastDto | null }`.

**API:**

- `GET /resident/community` (auth, RESIDENT) → latest announcements + any active
  broadcast for the resident's estate. Read-only; no write capability for residents.

**Web (`apps/web/src/pages/resident/ResidentCommunityPage.tsx`):**

- "Latest Announcements" list + "Estate Broadcast" banner when one is active.

**Tests:** read feed returns the resident's estate broadcast + org announcements. Web render.

**Verification:** tsc clean; api/web vitest green; migration additive.

**Exit:** Community page (announcements + broadcast), read-only.

---

## Step S8 — Facilities & Bookings (`facility.book`)

**Context brief:**
Introduce `Facility` (id, organizationId, estateId, name, description, bookable,
createdAt) and `Booking` (id, organizationId, userId, facilityId, startsAt, endsAt,
attendees, status [REQUESTED|CONFIRMED|CANCELLED|COMPLETED], createdAt). The
dashboard "Notifications → Upcoming Bookings" lists the resident's confirmed/requested
bookings.

**Contracts:**

- `FacilityDto`, `BookingDto`,
- `ResidentBookingsView` = `{ facilities: FacilityDto[]; upcoming: BookingDto[] }`.
- `CreateBookingInput` = `{ facilityId, startsAt, endsAt, attendees? }`;
  `CreateBookingResponse`.

**API:**

- `GET /resident/facilities` (auth, RESIDENT, `facility.book`) → bookable facilities +
  the resident's upcoming bookings (feeds the dashboard).
- `POST /resident/bookings` (auth, `facility.book`) → request a booking (self scope).
  Audit `resident.booking_created`.

**Web (`apps/web/src/pages/resident/ResidentFacilitiesPage.tsx` and
`ResidentBookingsPage.tsx`):**

- Facilities: list + "Book" form. Bookings: upcoming + past, cancel action.

**Tests:** booking creation scoped to acting resident; upcoming list. Web render.

**Verification:** tsc clean; api/web vitest green; migration additive.

**Exit:** Facilities + Bookings pages, `facility.book` wired, self-scoped.

---

## Step S9 — Emergency / SOS (`sos.create`)

**Context brief:**
Introduce `SosEvent` (id, organizationId, userId, propertyId, note, status
[RAISED|ACKNOWLEDGED|RESOLVED], raisedAt, acknowledgedAt, resolvedAt). A resident
triggers an SOS; it is an event the estate office is alerted to (out-of-band, like the
payment-note walk-through — no external alerting wired yet).

**Contracts:**

- `SosEventDto`, `CreateSosInput` = `{ note? }`; `CreateSosResponse` =
  `{ ok: true; event: SosEventDto }`.

**API:**

- `POST /resident/sos` (auth, RESIDENT, `sos.create`) → raise an SOS event for the
  acting resident + their property. Audit `resident.sos_raised`.
- `GET /resident/sos` (auth, `sos.create`) → the resident's own events (history).

**Web (`apps/web/src/pages/resident/ResidentSosPage.tsx`):**

- Prominent "Emergency / SOS" button (immediate, no confirm friction on the trigger),
  plus a short history of the resident's events.

**Tests:** raise creates + audits, self-scoped history. Web render + SOS button.

**Verification:** tsc clean; api/web vitest green; migration additive.

**Exit:** Emergency/SOS page, `sos.create` wired.

---

## Step S10 — Notifications (`upcoming bookings`, `recent notifications`)

**Context brief:**
Introduce `Notification` (id, organizationId, userId, kind [BOOKING|ANNOUNCEMENT|
BROADCAST|COMPLANT|SYSTEM], title, body, read, createdAt, linkTo?) — a per-resident
notification inbox. The dashboard's "Notifications" section shows Upcoming Bookings
(from S8) + Recent Notifications (from this model). A new facility booking (S8) and
a new announcement (S7) enqueue a notification to the resident.

**Contracts:**

- `NotificationDto`, `ResidentNotificationsView` = `{ upcoming: BookingDto[];
recent: NotificationDto[] }`, `MarkNotificationReadInput` = `{ id }`.

**API:**

- `GET /resident/notifications` (auth, RESIDENT) → upcoming bookings + recent
  notifications (unread badge count).
- `POST /resident/notifications/:id/read` (auth, RESIDENT) → mark read (self scope).

**Web (`apps/web/src/pages/resident/ResidentNotificationsPage.tsx`):**

- Unread badge + recent list; mark-read; link into the relevant page.

**Tests:** inbox returns unread count + upcoming; mark-read persists. Web render.

**Verification:** tsc clean; api/web vitest green; migration additive.

**Exit:** Notifications page with upcoming bookings + recent notifications.

---

## Step S11 — Dashboard home (compose live data)

**Context brief:**
`ResidentDashboardPage.tsx` is currently a static welcome + banner. Now that S1–S10
exist, replace it with a live, aggregated home: **Welcome header** (name + property),
**My Property** card (S2 data), **Finance** summary (outstanding count + amount from S3),
**Access Codes** (active count + a generate shortcut from S4), **Estate Office**
(open complaints count + latest announcement + active broadcast from S5/S7), and
**Notifications** (upcoming bookings + recent from S8/S10). Each section links to its
full page. One aggregation endpoint keeps the home fast.

**Contract:**

- `ResidentDashboardView` = `{ profile: ProfileDto (S1); property: ResidentPropertyDto
(S2); finance: { outstandingCount: number; outstandingTotalKobo: number } (S3);
codes: { activeCount: number } (S4); estateOffice: { openComplaints: number;
latestAnnouncement: AnnouncementDto | null; activeBroadcast: BroadcastDto | null }
(S5/S7); notifications: { upcomingBookings: BookingDto[]; recentNotifications:
NotificationDto[] } (S8/S10); }`.

**API:**

- `GET /resident/dashboard` (auth, RESIDENT) → assemble the view from the already-built
  repositories (do not duplicate queries — call the same services S1–S10 expose).

**Web:**

- `ResidentDashboardPage.tsx` loads `api.getResidentDashboard()`; render the sections
  with skeletons; each card has a "view all →" link to its page. Empty states per
  section.

**Tests:** aggregation endpoint returns the composed view; each section tolerates empty
data. Web renders sections.

**Verification (final gate):** shared rebuild → api/web tsc clean → api vitest green
(all) → web vitest green → `vite build` clean. Walk every nav link: Dashboard,
Profile, My Properties, Invoices & Payments, Access Codes, Complaints, Messages,
Community, Facilities, Bookings, Emergency/SOS, Notifications — each loads and is
self-scoped.

**Exit:** Full resident dashboard live, composed from real data, every page functional,
all endpoints self-scoped and audited, invariants hold.

---

## Cross-cutting audit events to add (across steps)

`resident.profile_updated`, `resident.invoice_paid` / `resident.payment_recorded`
(existing), `resident.code_generated`, `resident.code_extended`,
`resident.code_deactivated`, `resident.complaint_created`, `resident.message_sent`,
`resident.booking_created`, `resident.sos_raised`.
Each must be added to: `packages/shared` `AuditEventType` union **and** the Prisma
`AuditEventType` enum, then `npx prisma generate`.

## Ordering & sequencing notes

- Do S0 first (it unlocks routing + permissions + the `/resident` mount).
- S1–S10 can be done in any order; recommended: S1, S2 (quick, build confidence) →
  S3 (billing, heaviest) → S4, S5, S6, S7, S8, S9, S10 → S11 last (needs them all).
- Every step: additive Prisma migration + `prisma generate`; never touch the remote
  Supabase destructively; verify with `prisma migrate diff` locally.
- After each step, rebuild shared and re-run both test suites before starting the next.

## Confirmed decisions (user-approved)

1. **Permissions:** `RESIDENT` role gets **all 11 capabilities on by default**
   (`profile.view`, `property.view`, `invoice.view`, `payment.create`, `code.create`,
   `code.deactivate`, `complaint.create`, `complaint.view`, `message.view`,
   `facility.book`, `sos.create`). Org config may narrow later.
2. **Invoices seed:** When onboarding records the registration fee
   (`paymentStatus = PAID` + `paidAt` set), **seed the first `Invoice` + `Payment` +
   `Transaction`** so the finance page is never empty for a paying resident. This
   happens in `ResidentOnboardingService` when the account/payment is finalized (the
   `markPaid` → account-created path and the guest `complete` path both seed it).
3. **Single property** per resident (bound via onboarding's `propertyId`).
   `My Properties` returns one property; the response is list-shaped so a future N is
   non-breaking.
4. **Access codes:** have a **default validity window (720 hours)** that `extend` adjusts;
   codes remain revocable (`code.deactivate`). Not persistent.

## Cross-cutting implementation notes

- Decision 2 (seed) touches S3: the seed logic lives in the onboarding service (which
  owns payment finalization) but writes to the new `Invoice`/`Payment`/`Transaction`
  tables. S3 must therefore also add a small `billing-seed` service that the onboarding
  service calls on the two finalization paths. Keep the seed idempotent (one
  registration invoice per user).
- Decision 4 (expiring codes) means `AccessCode` has `validUntil`; `extend` sets it to
  `max(now, validUntil) + requested days`; the UI shows the window and an "expired"
  tone when `validUntil < now` (the code still shows as ACTIVE until deactivated or
  expired — surface expiry visually, enforce on the gate side, not the list).
- All resident endpoints resolve the acting user via the session (never a path param for
  "whose data") and verify ownership of any `:id` resource with `userId === acting.id`.

## Open questions (resolved by user above)

- Permissions granularity → **All on by default.**
- Invoices seed → **Seed from registration fee.**
- Multi-property → **Single property (list-shaped response).**
- Access code expiry → **Expiring window (30-day default), extendable.**
- SOS alerting → estate-office side is out of scope for now (resident raises; office
  acknowledges later). Keep the resident `sos.create`/history self-scoped only.
