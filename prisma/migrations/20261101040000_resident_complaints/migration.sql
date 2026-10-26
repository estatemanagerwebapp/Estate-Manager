-- Phase 3 (S5): resident complaints + estate-office replies.
-- Additive only: two new tables, no changes to existing tables.
-- Complaints are self-scoped to the resident who filed them; replies are
-- authored by the estate office.

CREATE TABLE "complaints" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "property_id" UUID,
  "category" VARCHAR(48) NOT NULL,
  "subject" VARCHAR(160) NOT NULL,
  "description" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "resolved_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "complaint_replies" (
  "id" UUID NOT NULL,
  "complaint_id" UUID NOT NULL,
  "author_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "complaint_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "complaints_organization_id_user_id_status_idx" ON "complaints" ("organization_id", "user_id", "status");
CREATE INDEX "complaint_replies_complaint_id_idx" ON "complaint_replies" ("complaint_id");

ALTER TABLE "complaints" ADD CONSTRAINT "complaints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaint_replies" ADD CONSTRAINT "complaint_replies_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaint_replies" ADD CONSTRAINT "complaint_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
