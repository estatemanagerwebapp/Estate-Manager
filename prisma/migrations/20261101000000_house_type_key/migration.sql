-- Add the nested house type key to properties. Set when typeKey = 'house';
-- null for land properties and for legacy rows created before this field.
ALTER TABLE "properties" ADD COLUMN "house_type_key" VARCHAR(48);
