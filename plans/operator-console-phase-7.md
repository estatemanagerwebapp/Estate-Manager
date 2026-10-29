# Operator Console — Phase 7: Facilities & Bookings

**Status:** Planned
**Scope:** Operator facility management, the resident booking queue, facility
usage fees, booking-payment verification and date/time-specific availability
alerts. No separate billing screens, gate, settings, SOS, audit-log, or
module-switch feature work in this step.

## Objective

Give the estate office a working facility register and booking queue. Staff can
create, edit and archive estate-scoped facilities, attach a flat usage fee,
review resident booking requests, confirm a manual payment, and confirm, cancel
or complete a booking. When staff verify a booking payment, the system creates
the paid invoice for that booking in the same step. The resident portal keeps
ownership of browsing facilities, requesting bookings, cancelling its own
bookings and asking to be notified when an occupied slot becomes free.

Phase 7 delivers:

- an operator `/app/facilities` register with create, edit and archive actions;
- an operator `/app/bookings` queue with status/facility/date filters and a
  detail drawer;
- a mandatory estate on every facility and a flat usage fee per booking;
- a booking fee snapshot so a later facility price change does not rewrite an
  existing booking;
- manual staff payment verification on a booking, which atomically creates a
  paid invoice, a payment row and the matching ledger entries;
- date/time-specific availability watches for occupied slots;
- in-app resident notifications when a watched slot becomes bookable;
- `REQUESTED → CONFIRMED → COMPLETED` plus `CANCELLED` transitions with
  conflict-safe updates;
- server-side `facility.read`, `facility.manage`, `booking.read`,
  `booking.manage` and `payment.verify` enforcement;
- audit events for facility creation, updates, archival, booking decisions,
  invoice creation and payment recording.

## Non-goals

- No resident page redesign and no duplicate resident-owned facility or booking
  query. The resident routes remain `/resident/facilities`,
  `/resident/bookings` and the new self-scoped `/resident/facility-watches`.
- No online payment, payment-provider integration, deposits, refunds or credit
  notes. Payment is received out of band and staff verify it manually. The
  booking invoice is created only at that verification step, as a paid invoice.
  Cancelling a paid booking does not automatically refund or void its invoice.
- No recurring bookings, capacity rules, waitlists with reserved places,
  blackout calendars, check-in/QR flows or calendar sync. An availability alert
  does not reserve the slot.
- No email, SMS, WhatsApp or push notification. Availability updates are
  written to the existing resident in-app notification inbox only.
- No hard deletion of facilities, bookings or availability watches.
- No module-level feature switch; that belongs to Phase 8.
- No change to the typed property model or the Estate → Property restructure.

## Existing foundation

The resident flow already provides:

- `Facility` and `Booking` tables in `prisma/schema.prisma`;
- `GET /api/v1/resident/facilities`, `POST /api/v1/resident/bookings` and
  `POST /api/v1/resident/bookings/:id/cancel` in
  `apps/api/src/modules/resident/resident.routes.ts`;
- `ResidentBookingsService` with the existing booking-window validation
  (future start, 24-hour maximum, 365-day advance limit, 1–500 attendees) and
  overlap rejection;
- resident pages `/resident/facilities` and `/resident/bookings`;
- the `facility.read`, `facility.manage`, `booking.read` and `booking.manage`
  permissions in `packages/shared/src/permissions.ts`;
- the audit events `facility.created`, `facility.updated`, `facility.archived`,
  `booking.confirmed`, `booking.cancelled`, `booking.completed`,
  `invoice.created` and `payment.recorded`, already mapped in the audit
  repository;
- the Phase 5 invoice/payment/transaction ledger, which the booking payment
  flow reuses instead of creating a second billing model.

Phase 7 adds the staff half over the same tables. It does not create a second
resident booking service.

## Decisions

### Facility scope and fee

- A facility belongs to exactly one estate. Organization-wide facilities are
  removed from the model. Residents see only facilities on their own estate.
- `estateId` becomes mandatory in the API, in the operator form and in the
  database. Any legacy row with a null estate must be assigned before the
  migration; the migration aborts rather than guessing. After it applies, no
  unscoped facility remains.
- A facility carries a flat `usageFeeKobo` for one booking. `0` means free.
  The fee is not hourly and is not multiplied by attendees.
- The fee is copied onto the booking at request time as `feeKobo`. Editing the
  facility later changes only future bookings. The resident's booking and the
  operator queue keep the agreed snapshot.
- A booking with `feeKobo > 0` starts `UNPAID`. A free booking (`feeKobo = 0`)
  starts `NOT_REQUIRED` and never creates an invoice.
- Payment is received out of band. Staff verify it from the booking queue and
  choose the method, optional reference and paid date.
- The required sequence is: resident requests → staff verifies payment →
  staff confirms booking. Payment verification does not itself confirm the
  booking.
- Verifying a booking payment is one atomic operation: it claims the unpaid,
  still-`REQUESTED` booking, creates a `PAID` invoice for the fee snapshot,
  creates the matching payment row, writes the payment/credit ledger entries,
  and links the invoice to the booking.
- No invoice exists before payment verification. The invoice is the record of
  the verified payment, not a bill issued earlier.
- Confirmation requires the booking to be settled (`PAID` or `NOT_REQUIRED`).
  An unpaid paid-fee booking returns `409` from the confirm action and remains
  `REQUESTED`.
- A free booking (`NOT_REQUIRED`) can be confirmed without a payment step.
- A booking cannot be completed until `paymentStatus` is `PAID` or
  `NOT_REQUIRED`.
- Verifying payment twice, or verifying a confirmed, cancelled, completed or
  free booking, returns `409`.
- Cancelling a paid booking leaves the paid invoice in place. Refunds, voids and
  credit notes are out of scope; staff handle those outside the system.
- If a request becomes unconfirmable after payment (for example the facility is
  suspended before the confirm action), confirmation returns `409` and the paid
  invoice remains. Any refund is handled outside the system.
- The payment route requires `payment.verify`, not merely `booking.manage`, so
  financial authority stays separate from booking authority.
- `bookable = false` is a temporary suspension: the facility stays visible on
  its estate but cannot accept new requests.
- Archiving is separate from suspension. A new nullable `archivedAt` marks a
  retired facility; archived facilities are hidden from the resident list and
  cannot accept requests or be edited.
- A facility cannot be archived while it has a live booking (`REQUESTED` or
  `CONFIRMED`). The operator must confirm, cancel or complete those bookings
  first. Archiving cancels outstanding availability watches for that facility;
  no "available" notification is sent for an archived facility.
- Changing a facility's estate is allowed. Existing bookings keep their
  facility reference and remain visible to the resident who made them.

### Booking dates and times

- A facility has no opening-hours calendar in this phase. The date and time
  live on the booking as `startsAt` and `endsAt`, and availability is derived
  from live bookings on that exact window.
- The resident booking form, operator queue, detail drawer and availability
  notification all show the full local date and time range, not only a date.
- The existing booking-window validation is reused: start in the future, end
  after start, at most 24 hours, at most 365 days ahead, 1–500 attendees.

### Booking transitions

- Booking statuses stay the existing string vocabulary:
  `REQUESTED | CONFIRMED | CANCELLED | COMPLETED`. No new status is added.
- Operator transitions:
  - `REQUESTED → CONFIRMED` — confirms a request;
  - `REQUESTED|CONFIRMED → CANCELLED` — declines or cancels;
  - `CONFIRMED → COMPLETED` — closes a booking after its window ends.
- `CANCELLED` and `COMPLETED` are terminal. Any other transition returns `409`.
- Confirmation requires a future `startsAt`, an active and bookable facility on
  the resident's estate, settled payment (`PAID` or `NOT_REQUIRED`), and no
  overlapping live booking. The resident create route already rejects an
  overlap with a `REQUESTED` or `CONFIRMED` booking, so the queue normally holds
  one live request per slot; the confirmation re-check still protects against
  races.
- Completion is only allowed once `endsAt <= now` and the booking is settled
  (`PAID` or `NOT_REQUIRED`). An early or unpaid completion returns `409`.
- Payment can only be verified while a booking is `REQUESTED`. The booking
  status itself is not changed by payment verification; a separate confirm
  action follows.
- Booking decisions use condition updates (`where id + organizationId + expected
status`) so two staff members cannot both confirm or complete the same row.
  A lost race returns `409`.
- Every facility and booking lookup is organization-scoped. A cross-organization
  id is indistinguishable from a missing one (`404`).

### Availability alerts

- When a resident's desired window overlaps a live booking, the resident can
  create an availability watch for that facility and exact `startsAt`/`endsAt`.
- A watch is self-scoped to the acting resident. It is not a reservation and
  does not queue the resident ahead of anyone else.
- Creating a watch when the exact window is already free returns `409` with
  "This slot is available — book it instead." This keeps watches tied to the
  occupied-slot use case.
- Duplicate `WAITING` watches for the same resident, facility and identical
  window return `409`. A `NOTIFIED` or `CANCELLED` watch does not block a new
  watch for the same window.
- Watches are `WAITING`, `NOTIFIED` or `CANCELLED` in storage. A watch whose
  `startsAt` is in the past is displayed as `EXPIRED` without mutating the row;
  no scheduler is added.
- A watch is fulfilled when its window has no remaining live booking. This is
  checked after a booking is cancelled, not merely when the cancelled booking
  overlaps it. If another `REQUESTED` or `CONFIRMED` booking still overlaps the
  watched window, the watch stays `WAITING`.
- Both operator cancellation and resident cancellation can free a slot and must
  run the same availability-notification path.
- Marking a facility `bookable = true` after a suspension also fulfils waiting
  watches whose windows are still in the future, using the same
  no-remaining-live-booking check.
- Fulfilment writes an in-app `BOOKING` notification with the facility name and
  the full desired date/time range, marks the watch `NOTIFIED`, and links to
  `/resident/app/facilities`. Notification failure leaves the watch `WAITING`
  so a later cancellation can retry.
- The notifying resident's own watch is skipped when that resident is the one
  cancelling the booking.
- React Query remains the only client cache. New screens use the existing
  `facilities` and `bookings` query-key families plus a resident-only watch key.
  Decisions invalidate `bookings.all`; facility edits invalidate both
  `facilities.all` and `bookings.all`, because the booking queue displays
  facility and estate names. No polling is added; staff use the header Refresh
  button or each page's Refresh action.
- Permissions already exist and no role baseline changes are required.
  `ESTATE_ADMIN` and `SUPER_ADMIN` manage; `AUDITOR` reads; `GUARD` and
  `RESIDENT` have neither operator permission. Residents use `facility.book`
  for watches.

## Database

Migration: `20261103006000_operator_facilities_bookings`

Additive changes:

- `facilities.archived_at` — nullable `TIMESTAMPTZ(6)`. `NULL` means active.
- `facilities.usage_fee_kobo` — `INTEGER NOT NULL DEFAULT 0`.
- `bookings.fee_kobo` — `INTEGER NOT NULL DEFAULT 0`, the fee snapshot taken at
  request time.
- `bookings.payment_status` — `VARCHAR(16) NOT NULL DEFAULT 'UNPAID'`, values
  `UNPAID | PAID | NOT_REQUIRED`.
- `bookings.invoice_id` — nullable `UUID`, unique, referencing `invoices(id)` on
  delete `SET NULL`. Existing rows are backfilled to `NOT_REQUIRED` because all
  existing bookings snapshot a zero fee.
- `invoices.booking` — the inverse optional one-to-one relation.
- New `facility_availability_watches` table:
  - `id`, `organization_id`, `facility_id`, `user_id`;
  - `starts_at`, `ends_at`;
  - `status` (`WAITING`/`NOTIFIED`/`CANCELLED`), `created_at`, `notified_at`,
    `cancelled_at`;
  - organization → `CASCADE`; facility → `CASCADE`; resident → `CASCADE`.
- Indexes:
  - `facilities(organization_id, estate_id, archived_at)`;
  - `bookings(organization_id, status, created_at DESC)`;
  - `bookings(organization_id, payment_status, created_at DESC)`;
  - `bookings(invoice_id)` unique;
  - `facility_availability_watches(organization_id, facility_id, starts_at,
ends_at)`;
  - `facility_availability_watches(organization_id, user_id, created_at DESC)`.

`estate_id` becomes `NOT NULL`:

- Pre-migration check:
  `SELECT id FROM facilities WHERE estate_id IS NULL;`
- Expected production count is zero. If any rows exist, assign the correct
  estate before deploying. The migration deliberately fails rather than
  silently guessing an estate for a facility.
- After the check is clear, the migration sets `facilities.estate_id NOT NULL`.
- Existing facilities keep their current estate. Existing bookings keep their
  `fee_kobo` at `0`; only bookings created after Phase 7 snapshot the current
  facility fee.

The migration leaves existing booking windows, facilities and statuses
unchanged. It only initialises the new fee/payment columns and links no invoice
for historical rows.

## API

Mounted at `/api/v1/facilities` and `/api/v1/bookings`, organization-scoped:

| Method  | Route                             | Permission        | Behavior                          |
| ------- | --------------------------------- | ----------------- | --------------------------------- |
| `GET`   | `/facilities`                     | `facility.read`   | Facility register                 |
| `POST`  | `/facilities`                     | `facility.manage` | Create an estate-scoped facility  |
| `PATCH` | `/facilities/:facilityId`         | `facility.manage` | Edit fields, estate or fee        |
| `POST`  | `/facilities/:facilityId/archive` | `facility.manage` | Archive a facility                |
| `GET`   | `/bookings`                       | `booking.read`    | Booking queue                     |
| `POST`  | `/bookings/:bookingId/confirm`    | `booking.manage`  | Confirm a request                 |
| `POST`  | `/bookings/:bookingId/payment`    | `payment.verify`  | Verify payment and create invoice |
| `POST`  | `/bookings/:bookingId/cancel`     | `booking.manage`  | Decline or cancel                 |
| `POST`  | `/bookings/:bookingId/complete`   | `booking.manage`  | Complete an ended booking         |

Resident watch routes, mounted under the existing self-scoped resident mount:

| Method | Route                                   | Permission      | Behavior                                 |
| ------ | --------------------------------------- | --------------- | ---------------------------------------- |
| `GET`  | `/resident/facility-watches`            | `facility.book` | The resident's own watches               |
| `POST` | `/resident/facility-watches`            | `facility.book` | Watch an occupied window                 |
| `POST` | `/resident/facility-watches/:id/cancel` | `facility.book` | Cancel one of the resident's own watches |

Facility filters:

- `status=ACTIVE|ARCHIVED`, optional (omitted returns both);
- `estateId=<uuid>`, optional;
- `limit=1..200` (default 100).

Booking filters:

- `status=REQUESTED|CONFIRMED|CANCELLED|COMPLETED`, optional;
- `paymentStatus=UNPAID|PAID|NOT_REQUIRED`, optional;
- `facilityId=<uuid>`, optional;
- `from` / `to` ISO timestamps, optional, filter on `startsAt`;
- `limit=1..200` (default 100).

Behavior details:

- `POST /facilities` accepts `name` (1–160), `description` (1–2000), required
  `estateId`, `usageFeeKobo` (integer `>= 0`, default `0`) and `bookable`
  (default `true`). An `estateId` outside the organization returns `404`.
- `PATCH /facilities/:facilityId` accepts any subset of the create fields.
  Editing an archived facility returns `409`.
- `POST /facilities/:facilityId/archive` sets `archivedAt` and `bookable =
false`. Archiving an already archived facility or one with a live booking
  returns `409`.
- `GET /facilities` returns the estate context, active/archived state, bookable
  flag, usage fee, live-booking count and waiting-watch count.
- `GET /bookings` returns newest requests first with resident contact, assigned
  property, facility, estate, window, attendees, fee snapshot, payment status,
  invoice id and booking status.
- `POST /bookings/:bookingId/payment` accepts `method` (the existing operator
  payment methods), optional `reference` (max 120) and optional `paidAt`. It
  claims a `REQUESTED`, `UNPAID` booking with `feeKobo > 0`, creates the paid
  invoice, payment and ledger entries atomically, links `invoiceId`, and returns
  the updated booking plus the created invoice and payment. The booking stays
  `REQUESTED` until the separate confirm action.
- Payment verification first re-checks that the request can still be confirmed:
  future `startsAt`, active and bookable facility on the resident's estate, and
  no overlapping live booking. If not, it returns `409` and creates no invoice.
- The invoice period is a compact facility label such as
  `Facility: {facility name} — {YYYY-MM-DD}`, truncated to the existing
  48-character period limit. Its amount is the booking's `feeKobo` snapshot,
  its status is `PAID`, its `createdById` and payment `recordedById` are the
  verifying staff member, and its `propertyId` is the resident's assigned
  property when one exists.
- Payment verification on a free, already paid, confirmed, cancelled or
  completed booking returns `409`. A race that loses the claim also returns
  `409`.
- Confirming a paid-fee booking that is still `UNPAID` returns `409` with a
  message that payment must be verified first.
- `POST /resident/facility-watches` accepts `facilityId`, `startsAt` and
  `endsAt`. The facility must be on the resident's estate, active and bookable.
  The window must follow the booking-window rules, must overlap a live booking,
  and must still be in the future.
- `GET /resident/facility-watches` returns the resident's watches newest first
  with the facility name, full date/time range, stored or derived status, and
  notification time.
- `POST /resident/facility-watches/:id/cancel` cancels only the resident's own
  `WAITING` watch and is a no-op for an already cancelled watch. A `NOTIFIED`
  watch cannot be cancelled.
- Confirm/cancel/complete return the updated booking. Malformed ids, bodies and
  filters return `400`; invalid transitions and conflicts return `409`.
- Resident sessions receive `403` on all operator routes. Auditors read both
  lists but cannot mutate. Cross-organization rows return `404`.

## Contracts and UI

Shared contracts in `packages/shared/src/resident-contract.ts`:

- `FacilityDto` gains `usageFeeKobo`;
- `BookingDto` gains `feeKobo` and `paymentStatus`
  (`BOOKING_PAYMENT_STATUSES` = `UNPAID | PAID | NOT_REQUIRED`);
- `OperatorFacilityDto`, `OperatorFacilitiesResponse`;
- `OperatorCreateFacilityInput`, `OperatorUpdateFacilityInput`,
  `OperatorFacilityResponse`;
- `OperatorBookingDto`, `OperatorBookingsResponse`, `OperatorBookingResponse`;
- `OperatorConfirmBookingPaymentInput` (method, optional reference and paidAt);
- `OperatorConfirmBookingPaymentResponse` (updated booking, created invoice and
  created payment);
- `ResidentFacilityWatchDto`, `ResidentFacilityWatchesResponse`,
  `ResidentCreateFacilityWatchInput`, `ResidentCreateFacilityWatchResponse`,
  `ResidentCancelFacilityWatchResponse`;
- `OperatorFacilityFilter`, `OperatorBookingFilter` in the web client (matching
  the existing filter-type convention).

`OperatorFacilityDto` carries id, name, description, required estate summary,
`bookable`, `usageFeeKobo`, `archivedAt`, `liveBookingCount`,
`waitingWatchCount` and `createdAt`.

`OperatorBookingDto` carries id, facility name/id, estate summary, resident
summary, assigned property summary, `startsAt`, `endsAt`, `attendees`,
`feeKobo`, `paymentStatus`, `invoiceId`, `status`, `createdAt` and `updatedAt`.

Facilities screen:

- Sidebar item "Facilities" gated on `facility.read`; route protected on the
  same permission.
- Summary cards for active facilities, suspended facilities, facilities with
  waiting alerts and archived facilities.
- Table with facility, estate, usage fee, bookable state, live bookings,
  waiting alerts, status and created date.
- Status and estate filters plus search across name, estate, fee and status.
- "New facility" and row Edit actions for `facility.manage`.
- Facility form in a modal: name, description, required estate select, usage fee
  in naira and a "Bookable" checkbox. The fee uses the existing `parseNaira`
  helper and stores kobo; `0` renders as "Free".
- Archive action with confirmation. It is disabled with an explanatory message
  when the facility has live bookings.
- Read-only users see the register and lose only the mutation actions.

Bookings screen:

- Sidebar item "Bookings" gated on `booking.read`; route protected on the same
  permission.
- Summary cards for pending requests, confirmed upcoming, bookings awaiting
  payment and completed bookings.
- Status tabs (All, Requested, Confirmed, Completed, Cancelled), payment-status
  filter, facility filter and date range filter.
- Table with resident, facility, estate, full date/time window, attendees, fee,
  payment status, booking status and requested date.
- Detail drawer with resident contact, assigned property, facility/estate, full
  date/time window, attendee count, fee snapshot, payment status, linked invoice
  and status timestamps.
- Confirm, Cancel and Complete actions for `booking.manage`, each guarded by a
  confirmation dialog. Buttons are shown only for valid current transitions.
- "Confirm payment" for `payment.verify` when the booking is `REQUESTED`, has a
  fee above zero and is `UNPAID`. The modal captures method, optional reference
  and paid date, then shows the created invoice reference.
- Confirm booking stays disabled for an `UNPAID` paid-fee request and explains
  "Verify payment before confirming." It becomes available once
  `paymentStatus` is `PAID`; free bookings are immediately confirmable.
- The linked invoice opens `/app/billing?invoice={invoiceId}`; `BillingPage`
  selects that invoice from the query string when present.
- Read-only users see the queue and detail drawer without actions.

Resident facility screen:

- Facility cards show the estate, description, usage fee (or "Free") and
  bookable state.
- The booking modal keeps the existing date and time inputs and now shows the
  fee for the selected facility before submission.
- If booking creation returns the overlap `409`, the modal offers "Notify me
  when this slot is free" with the same date/time window. The action creates an
  availability watch and confirms it with a toast.
- A compact "Availability alerts" section lists the resident's watches, their
  date/time range and status, with a cancel action for waiting watches.
- Resident bookings show the fee and payment state (`Payment pending`, `Paid`,
  or `No payment required`). After staff verification, the paid invoice appears
  in the existing resident invoices screen with no extra resident billing
  route.

Availability notification:

- Title: `Facility available — {facility name}`.
- Body: `{facility name} is now free on {date}, {start time}–{end time}. Book it before someone else does.`
- Link: `/resident/app/facilities`.
- The notification is created only after a re-check confirms no live booking
  still overlaps the watched window.

Navigation and routes:

- add `Building`/`CalendarDays` icons to `apps/web/src/navigation.ts`;
- add "Facilities" (`/app/facilities`, `facility.read`) and "Bookings"
  (`/app/bookings`, `booking.read`) to `PRIMARY_NAV`;
- add both prefixes to `sectionLabelForPath()`;
- add both protected routes in `apps/web/src/main.tsx`.

## Audit

All event types and target types already exist; no catalogue change is needed.

- `facility.created` — target `facility`, metadata: facility id, estate id,
  name, usageFeeKobo, bookable.
- `facility.updated` — target `facility`, metadata: facility id, changed fields,
  estate id, usageFeeKobo, bookable.
- `facility.archived` — target `facility`, metadata: facility id, name, estate
  id.
- `booking.confirmed` — target `booking`, metadata: booking id, facility id,
  resident id, startsAt, endsAt, feeKobo, paymentStatus.
- `invoice.created` — target `invoice`, metadata: invoice id, booking id,
  resident id, facility id, amountKobo and `source: "facility_booking"`.
- `payment.recorded` — target `payment`, metadata: payment id, invoice id,
  booking id, resident id, method, amountKobo and paidAt.
- `booking.cancelled` — target `booking`, same metadata plus previous status and
  the number of availability watches notified.
- `booking.completed` — target `booking`, same metadata.

The authenticated staff member is the audit actor. Resident cancellations keep
the resident actor already recorded by the resident booking path. Metadata never
contains passwords, session values or full request bodies. Resident contact
details stay out of audit metadata.

## Files

- `plans/operator-console-phase-7.md`
- `prisma/schema.prisma`
- `prisma/migrations/20261103006000_operator_facilities_bookings/migration.sql`
- `packages/shared/src/resident-contract.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/modules/resident/bookings-repository.ts`
- `apps/api/src/modules/resident/bookings.service.ts`
- `apps/api/src/modules/resident/resident.routes.ts`
- `apps/api/src/modules/resident/finance-repository.ts`
- `apps/api/src/modules/facilities/facilities-repository.ts`
- `apps/api/src/modules/facilities/facilities.service.ts`
- `apps/api/src/modules/facilities/facilities.routes.ts`
- `apps/api/src/modules/facilities/availability.service.ts`
- `apps/api/src/modules/facilities/booking-payment.service.ts`
- `apps/api/src/dependencies.ts`
- `apps/api/src/application.ts`
- `apps/api/src/main.ts`
- `apps/api/src/server.ts`
- `apps/api/src/facilities-bookings.test.ts`
- `apps/web/src/api/client.ts`
- `apps/web/src/api/query-keys.ts`
- `apps/web/src/pages/FacilitiesPage.tsx`
- `apps/web/src/pages/FacilitiesPage.test.ts`
- `apps/web/src/pages/BookingsPage.tsx`
- `apps/web/src/pages/BookingsPage.test.ts`
- `apps/web/src/pages/BillingPage.tsx` (query-string invoice selection)
- `apps/web/src/pages/resident/ResidentFacilitiesPage.tsx`
- `apps/web/src/pages/resident/ResidentBookingsPage.tsx`
- `apps/web/src/navigation.ts`
- `apps/web/src/main.tsx`

## Verification

- `npx prisma validate --schema prisma/schema.prisma`
- `npx prisma generate --schema prisma/schema.prisma`
- `npm run build:packages`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test` with
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/silverstone_test`
  and
  `SILVERSTONE_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/silverstone_test`
- `npm run build`

API integration coverage:

- unauthenticated `401`, resident `403`, auditor read-only, administrator
  mutation;
- create/edit/archive estate-scoped facilities, including mandatory estate and
  fee validation;
- invalid/cross-organization estate `404` and facility `404`;
- archive blocked with a live booking and allowed after the queue is clear;
- archived or suspended facilities hidden from booking, and archived facilities
  hidden from the resident list;
- booking queue organization scoping, status/payment/facility/date filters and
  invalid filter `400`;
- confirm, cancel and complete transitions, duplicate/conflicting decisions and
  early completion;
- confirmation is rejected while a paid-fee request is `UNPAID`, succeeds after
  payment verification, and free bookings confirm without an invoice;
- overlap rejection on confirm;
- fee snapshot survives a later facility fee change and cannot be supplied by
  the resident;
- a paid-fee booking starts `UNPAID`, cannot be confirmed or completed, and a
  free booking starts `NOT_REQUIRED` with no invoice;
- payment verification creates exactly one paid invoice, one payment and two
  ledger entries, links the invoice to the booking, uses the fee snapshot and
  leaves the booking `REQUESTED`;
- duplicate payment verification, payment on a confirmed/cancelled/completed
  booking and payment on a free booking return `409`; cross-organization booking
  returns `404`;
- payment verification on an unconfirmable request (archived/suspended facility
  or overlapping live booking) returns `409` and creates no invoice;
- payment verification requires `payment.verify`, not just `booking.manage`;
- audit actor, event, target and fee metadata assertions, including
  `invoice.created` and `payment.recorded`;
- watch creation for an occupied window, rejection for a free window, duplicate
  rejection, self-scoping and cancellation;
- operator cancellation and resident cancellation notify overlapping watchers
  only when no live booking remains, with facility and full date/time in the
  notification;
- facility re-enabled notifies future waiting watches;
- archive cancels waiting watches without sending an availability notification;
- the existing resident create/cancel routes remain self-scoped.

Web helper coverage:

- facility state labels/tones, fee formatting and search;
- booking state labels/tones, payment-state labels/tones, fee and date/time
  formatting, search;
- valid confirmation rules per booking status and payment status.

Deployment checks after the production migration:

- run the null-estate pre-check before `npm run db:deploy`;
- `/api/v1/health` returns `200`;
- `/api/v1/facilities` and `/api/v1/bookings` return `401` without a session;
- `/app/facilities` and `/app/bookings` serve the SPA (`200`);
- `prisma migrate status` reports the new migration applied.

The untracked `Untitled-design-8-scaled.avif` file is not committed.

## Rollback

- Revert the API, shared-contract, web and navigation changes.
- Leave the additive columns, watch table and indexes in place, or add a later
  migration that drops them. Do not delete facility, booking, watch or audit
  history.
- The reverted resident code ignores `usage_fee_kobo`, `fee_kobo`,
  `payment_status`, `invoice_id`, `archived_at` and the watch table; existing
  rows remain valid.
- Do not delete invoices or payments created by verified booking payments; they
  are financial records.
- The `estate_id NOT NULL` constraint is intentionally not reverted, because
  restoring nullable estates would reintroduce unscoped facilities.
