-- Soft archive for resident onboarding records. The row and its history stay
-- in place; the onboarding code lookup excludes archived rows.
ALTER TABLE "resident_onboardings"
  ADD COLUMN "archived_at" TIMESTAMPTZ(6);

CREATE INDEX "resident_onboardings_organization_id_archived_at_idx"
  ON "resident_onboardings"("organization_id", "archived_at");
