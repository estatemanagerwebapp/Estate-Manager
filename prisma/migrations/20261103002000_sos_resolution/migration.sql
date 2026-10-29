-- Operator SOS handling: record who acknowledged/resolved an alert and the
-- internal closing note. Existing events stay valid with null actor/note.
ALTER TABLE "sos_events"
  ADD COLUMN "acknowledged_by_id" UUID,
  ADD COLUMN "resolved_by_id" UUID,
  ADD COLUMN "resolution_note" VARCHAR(500);

CREATE INDEX "sos_events_acknowledged_by_id_idx"
  ON "sos_events"("acknowledged_by_id");

CREATE INDEX "sos_events_resolved_by_id_idx"
  ON "sos_events"("resolved_by_id");

ALTER TABLE "sos_events"
  ADD CONSTRAINT "sos_events_acknowledged_by_id_fkey"
  FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sos_events"
  ADD CONSTRAINT "sos_events_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
