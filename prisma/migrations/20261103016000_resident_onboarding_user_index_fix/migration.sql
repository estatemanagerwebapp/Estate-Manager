-- `resident_onboardings_user_id_key` was created with CREATE UNIQUE INDEX in
-- the original onboarding migration, so `DROP CONSTRAINT` in
-- 20261103015000 was a no-op. Remove the unique index so a resident account
-- can own several property rows (household accounts).
DROP INDEX IF EXISTS "resident_onboardings_user_id_key";
CREATE INDEX IF NOT EXISTS "resident_onboardings_user_id_idx"
  ON "resident_onboardings"("user_id");
