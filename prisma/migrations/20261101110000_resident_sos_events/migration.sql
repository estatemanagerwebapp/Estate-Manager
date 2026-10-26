-- Phase 3 (S9): resident emergency / SOS events.
-- Additive only: one new table, no changes to existing tables.
-- An SOS event is raised by a resident against their assigned property
-- (nullable: a resident may not have a property yet) and is worked by the
-- estate office.

CREATE TABLE "sos_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "property_id" UUID,
  "note" VARCHAR(500),
  "status" VARCHAR(16) NOT NULL DEFAULT 'RAISED',
  "raised_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "acknowledged_at" TIMESTAMP(6),
  "resolved_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "sos_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sos_events_organization_id_user_id_raised_at_idx" ON "sos_events" ("organization_id", "user_id", "raised_at");
CREATE INDEX "sos_events_organization_id_status_idx" ON "sos_events" ("organization_id", "status");

ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
