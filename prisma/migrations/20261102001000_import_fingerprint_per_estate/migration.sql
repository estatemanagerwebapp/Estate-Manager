-- Scope import idempotency to the estate.
--
-- The file fingerprint used to be globally unique per database. Two estates
-- can legitimately receive the same workbook (for example, a copy of a
-- template with the same rows), and the second upload must not reuse or
-- block on the first estate's batch.

DROP INDEX "import_batches_fingerprint_key";

CREATE UNIQUE INDEX "import_batches_estate_id_fingerprint_key"
  ON "import_batches" ("estate_id", "fingerprint");
