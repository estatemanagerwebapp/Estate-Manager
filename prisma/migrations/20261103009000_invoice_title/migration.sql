-- Bill name shown alongside the period. Existing invoices keep the period as
-- their title so no list or receipt renders blank.
ALTER TABLE "invoices" ADD COLUMN "title" VARCHAR(160) NOT NULL DEFAULT '';

UPDATE "invoices" SET "title" = "period" WHERE "title" = '';
