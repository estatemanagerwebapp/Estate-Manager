-- Phase 6 — operator gate access: access-code lookup and verification history.
--
-- Adds an organization-scoped hash lookup for access codes and an append-only
-- verification log. The full code and its hash are never copied into the log;
-- only a short prefix is retained for display. Historical rows survive removal
-- of the code, resident, property or guard through nullable SetNull references.

CREATE INDEX "access_codes_organization_id_code_hash_idx"
  ON "access_codes"("organization_id", "code_hash");

CREATE TABLE "access_verifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "access_code_id" UUID,
  "resident_id" UUID,
  "property_id" UUID,
  "verified_by_id" UUID,
  "gate" VARCHAR(16) NOT NULL,
  "outcome" VARCHAR(16) NOT NULL,
  "reason" VARCHAR(32),
  "code_prefix" VARCHAR(8),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "access_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_verifications_organization_id_occurred_at_idx"
  ON "access_verifications"("organization_id", "occurred_at" DESC);
CREATE INDEX "access_verifications_access_code_id_idx"
  ON "access_verifications"("access_code_id");
CREATE INDEX "access_verifications_resident_id_idx"
  ON "access_verifications"("resident_id");
CREATE INDEX "access_verifications_verified_by_id_idx"
  ON "access_verifications"("verified_by_id");

ALTER TABLE "access_verifications"
  ADD CONSTRAINT "access_verifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "access_verifications"
  ADD CONSTRAINT "access_verifications_access_code_id_fkey"
  FOREIGN KEY ("access_code_id") REFERENCES "access_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "access_verifications"
  ADD CONSTRAINT "access_verifications_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "access_verifications"
  ADD CONSTRAINT "access_verifications_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "access_verifications"
  ADD CONSTRAINT "access_verifications_verified_by_id_fkey"
  FOREIGN KEY ("verified_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
