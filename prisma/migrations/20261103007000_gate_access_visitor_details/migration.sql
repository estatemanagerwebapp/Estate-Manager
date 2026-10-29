-- Visitor credentials attached to a resident-issued gate access code.
-- Existing codes keep NULL values and continue to verify exactly as before.
ALTER TABLE "access_codes"
ADD COLUMN "visitor_name" VARCHAR(120),
ADD COLUMN "car_plate" VARCHAR(24),
ADD COLUMN "id_document_url" VARCHAR(255);
