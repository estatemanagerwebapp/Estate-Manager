-- Operator Messages & Complaints: identify message authors and give the
-- estate office a shared read marker. Complaint replies already carry authorId.
ALTER TABLE "messages"
  ADD COLUMN "author_id" UUID;

ALTER TABLE "message_threads"
  ADD COLUMN "staff_last_read_at" TIMESTAMPTZ(6);

CREATE INDEX "messages_author_id_idx"
  ON "messages"("author_id");

CREATE INDEX "message_threads_organization_id_status_updated_at_idx"
  ON "message_threads"("organization_id", "status", "updated_at");

CREATE INDEX "complaints_organization_id_status_created_at_idx"
  ON "complaints"("organization_id", "status", "created_at");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
