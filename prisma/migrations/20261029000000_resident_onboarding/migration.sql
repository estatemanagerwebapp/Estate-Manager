-- Phase 2: resident onboarding rework.
--
-- 1. The account row (`users`) is now created ONLY after verified payment.
--    Until then the resident's draft state lives in `resident_onboardings`
--    (admin-provided prefilled fields + resident-completed fields).
--
-- 2. `users` reverts to its Phase 1 shape: email and password_hash are
--    non-null again (the user row now always carries a real credential),
--    and `must_change_password` forces the first-login password change for
--    accounts created with the generated demo password.
--
-- 3. The old single-use, TTL-bound `user_onboarding_codes` table is dropped:
--    the new access code is persistent (no TTL, no attempt cap, resumable)
--    and belongs to the draft record, not to a pre-created user.
--
-- 4. `media_files`: local-disk upload storage (R2 will slot in later via
--    the same model).

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;

DROP TABLE IF EXISTS "user_onboarding_codes";

CREATE TABLE "resident_onboardings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "code_hash" VARCHAR(64) NOT NULL,
    "first_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(40),
    "gender" VARCHAR(16),
    "marital_status" VARCHAR(16),
    "property_type" VARCHAR(48),
    "next_of_kin_name" VARCHAR(160),
    "next_of_kin_phone" VARCHAR(40),
    "next_of_kin_email" VARCHAR(255),
    "id_type" VARCHAR(32),
    "id_document_url" VARCHAR(2048),
    "payment_status" VARCHAR(16) NOT NULL DEFAULT 'UNPAID',
    "payment_ref" VARCHAR(120),
    "paid_at" TIMESTAMPTZ(6),
    "user_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "estateId" UUID,

    CONSTRAINT "resident_onboardings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resident_onboardings_code_hash_key" ON "resident_onboardings"("code_hash");
CREATE UNIQUE INDEX "resident_onboardings_user_id_key" ON "resident_onboardings"("user_id");
CREATE INDEX "resident_onboardings_organization_id_status_idx" ON "resident_onboardings"("organization_id", "status");
CREATE INDEX "resident_onboardings_property_id_idx" ON "resident_onboardings"("property_id");

ALTER TABLE "resident_onboardings" ADD CONSTRAINT "resident_onboardings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resident_onboardings" ADD CONSTRAINT "resident_onboardings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resident_onboardings" ADD CONSTRAINT "resident_onboardings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resident_onboardings" ADD CONSTRAINT "resident_onboardings_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "estates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "media_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "relative_path" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" VARCHAR(255),
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_files_relative_path_key" ON "media_files"("relative_path");
CREATE INDEX "media_files_organization_id_idx" ON "media_files"("organization_id");

ALTER TABLE "media_files" ADD CONSTRAINT "media_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'resident_registered';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'resident_onboarding_completed';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'resident_payment_recorded';
