-- Phase 3 (S6): resident ↔ estate-office message threads.
-- Additive only: two new tables, no changes to existing tables.
-- Threads are owned by the resident who started them; the estate office
-- replies into the same thread.

CREATE TABLE "message_threads" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "resident_user_id" UUID NOT NULL,
  "subject" VARCHAR(160) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "sender_role" VARCHAR(16) NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_threads_organization_id_resident_user_id_idx" ON "message_threads" ("organization_id", "resident_user_id");
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages" ("thread_id", "created_at");

ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_resident_user_id_fkey" FOREIGN KEY ("resident_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
