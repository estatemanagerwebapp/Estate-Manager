-- Phase 5 — manual operator billing.
--
-- Additive provenance for invoices issued and voided by staff, and for
-- manually recorded payments. Existing rows keep null actor columns and the
-- resident-facing finance code continues to ignore them.

ALTER TABLE "invoices"
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "voided_at" TIMESTAMPTZ(6),
  ADD COLUMN "voided_by_id" UUID;

ALTER TABLE "payments"
  ADD COLUMN "recorded_by_id" UUID;

CREATE INDEX "invoices_created_by_id_idx" ON "invoices"("created_by_id");
CREATE INDEX "invoices_voided_by_id_idx" ON "invoices"("voided_by_id");
CREATE INDEX "payments_recorded_by_id_idx" ON "payments"("recorded_by_id");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_voided_by_id_fkey"
  FOREIGN KEY ("voided_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
