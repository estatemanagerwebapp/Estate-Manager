-- Phase 2: user registration + onboarding codes.
-- 1. Users may be registered without an email (full name is the only
--    required field); email/phone complete during onboarding.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
-- PostgreSQL treats each NULL as distinct in unique constraints, so a
-- NULL-able email does not break the per-organization email uniqueness.

-- 2. Onboarding codes: hashed, single-use, TTL-bound, attempt-capped.
CREATE TABLE "user_onboarding_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(40),
    "full_name" VARCHAR(160),
    "expires_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(6) WITH TIME ZONE,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_onboarding_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_onboarding_codes_code_hash_key" ON "user_onboarding_codes"("code_hash");
CREATE INDEX "user_onboarding_codes_user_id_idx" ON "user_onboarding_codes"("user_id");

ALTER TABLE "user_onboarding_codes" ADD CONSTRAINT "user_onboarding_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_onboarding_codes" ADD CONSTRAINT "user_onboarding_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Audit event type.
ALTER TYPE "AuditEventType" ADD VALUE 'user_registered';
ALTER TYPE "AuditEventType" ADD VALUE 'user_onboarding_completed';

-- 4. New user profile columns: full_name (required at registration) and
--    phone (optional, completed during onboarding).
ALTER TABLE "users" ADD COLUMN "full_name" VARCHAR(160);
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(40);
