-- Add the human-facing property name (Option A). Nullable: legacy and
-- import-created records keep name = null; the identifier remains the
-- canonical registration code.
ALTER TABLE "properties" ADD COLUMN "name" VARCHAR(120);
