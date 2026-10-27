-- Phase 3 (S8): facilities and bookings.
-- Additive only: two new tables, no changes to existing tables.
-- A facility belongs to an estate (or is organization-wide when
-- estate_id is null) and may be bookable. A booking is owned by the
-- resident who made it.

CREATE TABLE "facilities" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "estate_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT NOT NULL,
  "bookable" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bookings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "facility_id" UUID NOT NULL,
  "starts_at" TIMESTAMP(6) NOT NULL,
  "ends_at" TIMESTAMP(6) NOT NULL,
  "attendees" INTEGER,
  "status" VARCHAR(16) NOT NULL DEFAULT 'REQUESTED',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "facilities_organization_id_estate_id_idx" ON "facilities" ("organization_id", "estate_id");
CREATE INDEX "bookings_organization_id_user_id_starts_at_idx" ON "bookings" ("organization_id", "user_id", "starts_at");
CREATE INDEX "bookings_facility_id_starts_at_ends_at_idx" ON "bookings" ("facility_id", "starts_at", "ends_at");

ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_estate_id_fkey" FOREIGN KEY ("estate_id") REFERENCES "estates" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
