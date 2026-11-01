-- Store which identity check the guard should request for each visitor code.
-- Existing codes default to the former ID image verification behavior.
ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS authentication_type VARCHAR(24) NOT NULL DEFAULT 'ID_IMAGE';

ALTER TABLE access_codes
  ADD CONSTRAINT access_codes_authentication_type_check
  CHECK (authentication_type IN ('ID_IMAGE', 'CAR_PLATE', 'VISITOR_IMAGE'));
