-- Phase 7 — operator facilities and bookings.
--
-- Facilities become estate-scoped (no organization-wide rows), gain an
-- archive marker and a flat usage fee. Bookings snapshot the fee, track
-- manual payment verification and link the paid invoice created at that
-- step. Availability watches store the exact occupied window a resident is
-- waiting on.
--
-- The migration deliberately aborts instead of guessing an estate for a
-- legacy facility. Assign those rows before deploying:
--   SELECT id FROM facilities WHERE estate_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "facilities" WHERE "estate_id" IS NULL) THEN
    RAISE EXCEPTION
      'Phase 7 migration aborted: facilities with null estate_id exist. Assign an estate before deploying.';
  END IF;
END
$$;

ALTER TABLE "facilities"
  ADD COLUMN "usage_fee_kobo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "archived_at" TIMESTAMPTZ(6);

ALTER TABLE "bookings"
  ADD COLUMN "fee_kobo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "payment_status" VARCHAR(16) NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN "invoice_id" UUID;

-- Existing bookings predate usage fees, so every historical booking is a
-- free booking. Only bookings created after this migration snapshot a fee.
UPDATE "bookings" SET "payment_status" = 'NOT_REQUIRED';

CREATE INDEX "facilities_organization_id_estate_id_archived_at_idx"
  ON "facilities"("organization_id", "estate_id", "archived_at");

CREATE INDEX "bookings_organization_id_status_created_at_idx"
  ON "bookings"("organization_id", "status", "created_at" DESC);

CREATE INDEX "bookings_organization_id_payment_status_created_at_idx"
  ON "bookings"("organization_id", "payment_status", "created_at" DESC);

CREATE UNIQUE INDEX "bookings_invoice_id_key"
  ON "bookings"("invoice_id");

ALTER TABLE "facilities"
  ALTER COLUMN "estate_id" SET NOT NULL;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "facility_availability_watches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "facility_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'WAITING',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notified_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),

  CONSTRAINT "facility_availability_watches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "facility_availability_watches_organization_id_facility_id_starts_at_ends_at_idx"
  ON "facility_availability_watches"("organization_id", "facility_id", "starts_at", "ends_at");

CREATE INDEX "facility_availability_watches_organization_id_user_id_created_at_idx"
  ON "facility_availability_watches"("organization_id", "user_id", "created_at" DESC);

ALTER TABLE "facility_availability_watches"
  ADD CONSTRAINT "facility_availability_watches_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facility_availability_watches"
  ADD CONSTRAINT "facility_availability_watches_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "facilities"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facility_availability_watches"
  ADD CONSTRAINT "facility_availability_watches_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
