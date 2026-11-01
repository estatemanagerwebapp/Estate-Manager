CREATE TABLE "user_estate_assignments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "estate_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_estate_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_estate_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_estate_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_estate_assignments_estate_id_fkey" FOREIGN KEY ("estate_id") REFERENCES "estates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "user_estate_assignments_user_id_estate_id_key" ON "user_estate_assignments"("user_id", "estate_id");
CREATE INDEX "user_estate_assignments_organization_id_estate_id_idx" ON "user_estate_assignments"("organization_id", "estate_id");
CREATE INDEX "user_estate_assignments_organization_id_user_id_idx" ON "user_estate_assignments"("organization_id", "user_id");
