ALTER TABLE "estates"
  ADD COLUMN "operational_settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "settings_version" INTEGER NOT NULL DEFAULT 0;
