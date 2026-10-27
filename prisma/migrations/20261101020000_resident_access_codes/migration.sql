-- Phase 3 (S4): resident access codes.
-- Additive only: one new table, no changes to existing tables.
-- The full code is never stored: only its SHA-256 hash and a short display
-- prefix. Codes are persistent (no TTL) but can be extended or revoked.

CREATE TABLE "access_codes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "property_id" UUID,
  "kind" VARCHAR(16) NOT NULL,
  "code_hash" VARCHAR(64) NOT NULL,
  "code_prefix" VARCHAR(8) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "valid_until" TIMESTAMP(6),
  "issued_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "revoked_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "access_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_codes_organization_id_user_id_status_idx" ON "access_codes" ("organization_id", "user_id", "status");

ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
