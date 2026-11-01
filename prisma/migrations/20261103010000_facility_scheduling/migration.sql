ALTER TABLE "facilities"
  ADD COLUMN "opening_time" VARCHAR(5) NOT NULL DEFAULT '08:00',
  ADD COLUMN "closing_time" VARCHAR(5) NOT NULL DEFAULT '22:00',
  ADD COLUMN "booking_threshold_hours" INTEGER;
