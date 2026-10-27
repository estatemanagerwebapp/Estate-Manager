-- Add onboarding_code column to resident_onboardings so the admin can
-- re-share the persistent access code from the Residents screen.
ALTER TABLE "resident_onboardings" ADD COLUMN "onboarding_code" VARCHAR(32);
