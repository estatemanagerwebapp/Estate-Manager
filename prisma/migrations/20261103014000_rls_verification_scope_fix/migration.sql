-- A guard's own verification row can have no property context (an unknown or
-- property-less code). The INSERT check already allowed it, but the SELECT
-- policy must allow the same row so INSERT ... RETURNING (used by Prisma)
-- succeeds and the guard can read their own attempt back.
DROP POLICY IF EXISTS access_verification_staff_scope ON access_verifications;
CREATE POLICY access_verification_staff_scope ON access_verifications
  USING (
    organization_id = app_scope_organization_id()
    AND (
      (property_id IS NULL AND verified_by_id = app_scope_user_id())
      OR app_scope_has_property(property_id)
      OR EXISTS (
        SELECT 1 FROM access_codes c
        WHERE c.id = access_verifications.access_code_id
          AND app_scope_has_property(c.property_id)
      )
    )
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND (
      (property_id IS NULL AND verified_by_id = app_scope_user_id())
      OR app_scope_has_property(property_id)
    )
  );
