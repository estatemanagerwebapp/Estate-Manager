-- Row numbers identify a single physical worksheet row within an import batch.
CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key"
ON "import_rows"("batch_id", "row_number");
