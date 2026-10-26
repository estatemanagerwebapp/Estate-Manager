-- Phase 3 (S3): resident finance models — invoices, payments, transactions.
-- Additive only: three new tables, no changes to existing tables.
-- The registration fee seeds the first invoice + payment + transaction when
-- the resident account is created (config-driven amount).

CREATE TABLE "invoices" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "property_id" UUID,
  "period" VARCHAR(48) NOT NULL,
  "amount_kobo" INTEGER NOT NULL,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'NGN',
  "status" VARCHAR(16) NOT NULL DEFAULT 'UNPAID',
  "due_at" TIMESTAMP(6) NOT NULL,
  "issued_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "amount_kobo" INTEGER NOT NULL,
  "method" VARCHAR(32) NOT NULL,
  "reference" VARCHAR(120),
  "paid_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transactions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "amount_kobo" INTEGER NOT NULL,
  "signed" INTEGER NOT NULL,
  "memo" VARCHAR(255),
  "reference" VARCHAR(120),
  "occurred_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoices_organization_id_user_id_status_idx" ON "invoices" ("organization_id", "user_id", "status");
CREATE INDEX "payments_user_id_idx" ON "payments" ("user_id");
CREATE INDEX "payments_invoice_id_idx" ON "payments" ("invoice_id");
CREATE INDEX "transactions_organization_id_user_id_occurred_at_idx" ON "transactions" ("organization_id", "user_id", "occurred_at" DESC);

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
