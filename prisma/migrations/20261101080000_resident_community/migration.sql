-- Phase 3 (S7): community feed for residents.
-- Additive only: two new tables, no changes to existing tables.
-- Announcements are organization-wide; broadcasts are estate-scoped and
-- carry a priority plus an optional expiry. Both are read-only for
-- residents — they are written by the estate office.

CREATE TABLE "announcements" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "author_id" UUID,
  "published_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "estate_broadcasts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "estate_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "priority" VARCHAR(16) NOT NULL DEFAULT 'INFO',
  "issued_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "estate_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_organization_id_published_at_idx" ON "announcements" ("organization_id", "published_at");
CREATE INDEX "estate_broadcasts_organization_id_estate_id_issued_at_idx" ON "estate_broadcasts" ("organization_id", "estate_id", "issued_at");

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "estate_broadcasts" ADD CONSTRAINT "estate_broadcasts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estate_broadcasts" ADD CONSTRAINT "estate_broadcasts_estate_id_fkey" FOREIGN KEY ("estate_id") REFERENCES "estates" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
