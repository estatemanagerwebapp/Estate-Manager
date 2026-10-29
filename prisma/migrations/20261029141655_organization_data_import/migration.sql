-- Organization-level, multi-sheet import batches.
CREATE TABLE "organization_import_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PREVIEWED',
    "counts" JSONB NOT NULL DEFAULT '{}',
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_import_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "sheet" VARCHAR(24) NOT NULL,
    "row_number" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'VALID',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "data" JSONB NOT NULL DEFAULT '{}',
    "reference" VARCHAR(255) NOT NULL,
    "entity_type" VARCHAR(24),
    "entity_id" UUID,

    CONSTRAINT "organization_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_import_batches_organization_id_uploaded_at_idx"
    ON "organization_import_batches"("organization_id", "uploaded_at" DESC);

CREATE UNIQUE INDEX "organization_import_batches_organization_id_fingerprint_key"
    ON "organization_import_batches"("organization_id", "fingerprint");

CREATE INDEX "organization_import_rows_batch_id_sheet_status_idx"
    ON "organization_import_rows"("batch_id", "sheet", "status");

CREATE UNIQUE INDEX "organization_import_rows_batch_id_sheet_row_number_key"
    ON "organization_import_rows"("batch_id", "sheet", "row_number");

ALTER TABLE "organization_import_rows"
    ADD CONSTRAINT "organization_import_rows_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "organization_import_batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
