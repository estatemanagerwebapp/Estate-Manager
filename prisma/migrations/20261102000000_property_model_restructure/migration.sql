-- Property model restructure.
--
-- The property registry no longer reads a runtime JSON property-options block.
-- A property is explicitly a HOUSE, LAND, or BOTH record, and its address
-- shape lives in typed columns backed by a real house-type catalogue.
--
-- This migration is intentionally data-preserving: it adds the new columns,
-- backfills them from the old `address_components` JSON and `type_key`, then
-- removes the old columns only after the new shape is populated.

-- 1. New domain types ---------------------------------------------------------
CREATE TYPE "PropertyKind" AS ENUM ('HOUSE', 'LAND', 'BOTH');

CREATE TABLE "house_types" (
    "key" VARCHAR(48) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "requires_unit_fields" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "house_types_pkey" PRIMARY KEY ("key")
);

-- Silverstone's house-type catalogue. Other deployments insert their own rows
-- in a follow-up migration; the property module reads this table directly.
INSERT INTO "house_types" (
    "key", "label", "requires_unit_fields", "active", "sort_order", "updated_at"
) VALUES
    ('bungalow', 'Bungalow', false, true, 10, CURRENT_TIMESTAMP),
    ('terrace', 'Terrace', false, true, 20, CURRENT_TIMESTAMP),
    ('duplex', 'Duplex', false, true, 30, CURRENT_TIMESTAMP),
    ('apartment', 'Apartment', true, true, 40, CURRENT_TIMESTAMP),
    ('flat', 'Flat', true, true, 50, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- 2. New typed columns --------------------------------------------------------
ALTER TABLE "properties" ADD COLUMN "kind" "PropertyKind";
ALTER TABLE "properties" ADD COLUMN "street_name" VARCHAR(120);
ALTER TABLE "properties" ADD COLUMN "house_number" VARCHAR(32);
ALTER TABLE "properties" ADD COLUMN "block_name" VARCHAR(64);
ALTER TABLE "properties" ADD COLUMN "floor_number" VARCHAR(16);
ALTER TABLE "properties" ADD COLUMN "unit_number" VARCHAR(32);
ALTER TABLE "properties" ADD COLUMN "plot_number" VARCHAR(32);
ALTER TABLE "properties" ADD COLUMN "plot_name" VARCHAR(64);

-- 3. Backfill from the old JSON shape ----------------------------------------
UPDATE "properties"
SET
    "kind" = CASE
        WHEN "type_key" = 'land' THEN 'LAND'::"PropertyKind"
        WHEN "type_key" = 'both' THEN 'BOTH'::"PropertyKind"
        ELSE 'HOUSE'::"PropertyKind"
    END,
    "street_name" = COALESCE(
        NULLIF("address_components"->>'street_name', ''),
        NULLIF("address_components"->>'street', ''),
        ''
    ),
    "house_number" = NULLIF("address_components"->>'house_number', ''),
    "block_name" = NULLIF("address_components"->>'block_name', ''),
    "floor_number" = NULLIF("address_components"->>'floor_number', ''),
    "unit_number" = NULLIF("address_components"->>'unit_number', ''),
    "plot_number" = COALESCE(
        NULLIF("address_components"->>'plot_number', ''),
        NULLIF("address_components"->>'number_of_plots', ''),
        NULLIF("address_components"->>'plot', '')
    ),
    "plot_name" = NULLIF("address_components"->>'plot_name', '');

-- Any house type already stored in properties must exist in the catalogue
-- before the foreign key is added. Known Silverstone rows are already present;
-- this keeps unknown deployment-specific rows from blocking the migration.
INSERT INTO "house_types" (
    "key", "label", "requires_unit_fields", "active", "sort_order", "updated_at"
)
SELECT DISTINCT
    "house_type_key",
    initcap(replace("house_type_key", '_', ' ')),
    false,
    true,
    1000,
    CURRENT_TIMESTAMP
FROM "properties"
WHERE "house_type_key" IS NOT NULL
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "properties" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "street_name" SET NOT NULL;

-- 4. Remove the old configuration-shaped columns -----------------------------
ALTER TABLE "properties" DROP CONSTRAINT "properties_parent_property_id_fkey";
DROP INDEX "properties_estate_id_type_key_idx";
DROP INDEX "properties_parent_property_id_idx";

ALTER TABLE "properties" DROP COLUMN "type_key";
ALTER TABLE "properties" DROP COLUMN "unit_type_key";
ALTER TABLE "properties" DROP COLUMN "parent_property_id";
ALTER TABLE "properties" DROP COLUMN "address_components";

-- 5. New indexes and the house-type foreign key ------------------------------
CREATE INDEX "properties_estate_id_kind_idx" ON "properties"("estate_id", "kind");
CREATE INDEX "properties_house_type_key_idx" ON "properties"("house_type_key");

ALTER TABLE "properties"
    ADD CONSTRAINT "properties_house_type_key_fkey"
    FOREIGN KEY ("house_type_key") REFERENCES "house_types"("key")
    ON DELETE RESTRICT ON UPDATE CASCADE;
