-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'estate_created';
ALTER TYPE "AuditEventType" ADD VALUE 'estate_updated';
ALTER TYPE "AuditEventType" ADD VALUE 'estate_status_changed';
ALTER TYPE "AuditEventType" ADD VALUE 'property_created';
ALTER TYPE "AuditEventType" ADD VALUE 'property_updated';
ALTER TYPE "AuditEventType" ADD VALUE 'property_status_changed';
ALTER TYPE "AuditEventType" ADD VALUE 'import_previewed';
ALTER TYPE "AuditEventType" ADD VALUE 'import_completed';
ALTER TYPE "AuditEventType" ADD VALUE 'import_commit_failed';
ALTER TYPE "AuditEventType" ADD VALUE 'property_options_updated';

-- CreateTable
CREATE TABLE "estates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "estates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "estate_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "identifier" VARCHAR(200) NOT NULL,
    "type_key" VARCHAR(48) NOT NULL,
    "unit_type_key" VARCHAR(48),
    "parent_property_id" UUID,
    "address_components" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "estate_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PREVIEWED',
    "config_version" INTEGER NOT NULL,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(6),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'VALID',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "property_id" UUID,
    "row_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estates_organization_id_status_idx" ON "estates"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "estates_organization_id_slug_key" ON "estates"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "properties_organization_id_status_idx" ON "properties"("organization_id", "status");

-- CreateIndex
CREATE INDEX "properties_estate_id_type_key_idx" ON "properties"("estate_id", "type_key");

-- CreateIndex
CREATE INDEX "properties_parent_property_id_idx" ON "properties"("parent_property_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_estate_id_identifier_key" ON "properties"("estate_id", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_fingerprint_key" ON "import_batches"("fingerprint");

-- CreateIndex
CREATE INDEX "import_batches_estate_id_status_idx" ON "import_batches"("estate_id", "status");

-- CreateIndex
CREATE INDEX "import_rows_batch_id_status_idx" ON "import_rows"("batch_id", "status");

-- AddForeignKey
ALTER TABLE "estates" ADD CONSTRAINT "estates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_estate_id_fkey" FOREIGN KEY ("estate_id") REFERENCES "estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_parent_property_id_fkey" FOREIGN KEY ("parent_property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_estate_id_fkey" FOREIGN KEY ("estate_id") REFERENCES "estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
