-- Organization import batches belong to one organization and are removed with it.
ALTER TABLE "organization_import_batches"
    ADD CONSTRAINT "organization_import_batches_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
