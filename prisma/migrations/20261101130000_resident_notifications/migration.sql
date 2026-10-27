-- Phase 3 (S10): per-resident notification inbox.
-- Additive only: one new table, no changes to existing tables.
-- A notification belongs to one resident and carries a kind, a title, a
-- body, an optional in-app link and a read flag.

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "link_to" VARCHAR(200),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_organization_id_user_id_created_at_idx" ON "notifications" ("organization_id", "user_id", "created_at");
CREATE INDEX "notifications_organization_id_user_id_is_read_idx" ON "notifications" ("organization_id", "user_id", "is_read");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
