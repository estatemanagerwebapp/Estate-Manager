-- A resident may own several property onboarding records; all records point
-- to the same canonical resident user. Dependants have separate logins linked
-- to that owner so their actions remain individually attributable.
ALTER TABLE resident_onboardings DROP CONSTRAINT IF EXISTS resident_onboardings_user_id_key;
-- The original unique rule was created as a standalone unique index, not a
-- table constraint, so dropping the constraint alone leaves it in place.
DROP INDEX IF EXISTS resident_onboardings_user_id_key;
CREATE INDEX IF NOT EXISTS resident_onboardings_user_id_idx ON resident_onboardings(user_id);

CREATE TABLE resident_account_members (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  member_user_id UUID NOT NULL,
  relationship VARCHAR(32) NOT NULL DEFAULT 'DEPENDANT',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT resident_account_members_pkey PRIMARY KEY (id),
  CONSTRAINT resident_account_members_member_user_id_key UNIQUE (member_user_id),
  CONSTRAINT resident_account_members_not_self CHECK (owner_user_id <> member_user_id),
  CONSTRAINT resident_account_members_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT resident_account_members_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT resident_account_members_member_user_id_fkey
    FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX resident_account_members_organization_id_owner_user_id_idx
  ON resident_account_members(organization_id, owner_user_id);

CREATE OR REPLACE FUNCTION app_scope_account_user_ids() RETURNS UUID[]
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    string_to_array(NULLIF(current_setting('app.resident_account_user_ids', true), ''), ',')::uuid[],
    ARRAY[]::uuid[]
  )
$$;

CREATE OR REPLACE FUNCTION app_scope_has_resident(candidate UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT candidate IS NOT NULL AND (
    candidate = app_scope_user_id()
    OR candidate = ANY(app_scope_account_user_ids())
    OR app_scope_role() = 'SUPER_ADMIN'
    OR EXISTS (
      SELECT 1 FROM resident_onboardings ro
      WHERE ro.user_id = candidate
        AND ro.organization_id = app_scope_organization_id()
        AND app_scope_has_property(ro.property_id)
    )
  )
$$;

ALTER TABLE resident_account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE resident_account_members FORCE ROW LEVEL SECURITY;
CREATE POLICY resident_account_member_scope ON resident_account_members
  USING (
    organization_id = app_scope_organization_id()
    AND (
      owner_user_id = app_scope_user_id()
      OR member_user_id = app_scope_user_id()
      OR owner_user_id = ANY(app_scope_account_user_ids())
      OR app_scope_role() = 'SUPER_ADMIN'
      OR EXISTS (
        SELECT 1 FROM resident_onboardings ro
        WHERE ro.user_id = resident_account_members.owner_user_id
          AND ro.organization_id = app_scope_organization_id()
          AND app_scope_has_property(ro.property_id)
      )
    )
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND (
      owner_user_id = app_scope_user_id()
      OR app_scope_role() = 'SUPER_ADMIN'
      OR EXISTS (
        SELECT 1 FROM resident_onboardings ro
        WHERE ro.user_id = resident_account_members.owner_user_id
          AND ro.organization_id = app_scope_organization_id()
          AND app_scope_has_property(ro.property_id)
      )
      OR (
        app_scope_role() = 'ONBOARDING'
        AND EXISTS (
          SELECT 1 FROM resident_onboardings ro
          WHERE ro.user_id = resident_account_members.owner_user_id
            AND ro.organization_id = app_scope_organization_id()
            AND ro.code_hash = app_scope_onboarding_code_hash()
        )
      )
    )
  );

DROP POLICY IF EXISTS resident_onboarding_scope ON resident_onboardings;
CREATE POLICY resident_onboarding_scope ON resident_onboardings
  USING (
    organization_id = app_scope_organization_id()
    AND (
      (app_scope_role() = 'ONBOARDING' AND code_hash = app_scope_onboarding_code_hash())
      OR user_id = app_scope_user_id()
      OR user_id = ANY(app_scope_account_user_ids())
      OR app_scope_has_property(property_id)
    )
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND app_scope_has_property(property_id)
  );

-- The RLS startup guard also requires the membership table to be protected.

-- Resident-facing records belong to the household account. The individual
-- `user_id` on newly-created activity rows remains the actual actor.
DROP POLICY IF EXISTS access_code_resident_scope ON access_codes;
CREATE POLICY access_code_resident_scope ON access_codes FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND app_scope_has_property(property_id)
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND app_scope_has_property(property_id)
  );

DROP POLICY IF EXISTS booking_resident_scope ON bookings;
CREATE POLICY booking_resident_scope ON bookings FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = bookings.facility_id AND app_scope_resident_estate(f.estate_id))
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = bookings.facility_id AND app_scope_resident_estate(f.estate_id))
  );

DROP POLICY IF EXISTS facility_watch_resident_scope ON facility_availability_watches;
CREATE POLICY facility_watch_resident_scope ON facility_availability_watches FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_availability_watches.facility_id AND app_scope_resident_estate(f.estate_id))
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_availability_watches.facility_id AND app_scope_resident_estate(f.estate_id))
  );

DROP POLICY IF EXISTS complaint_resident_scope ON complaints;
CREATE POLICY complaint_resident_scope ON complaints FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND app_scope_has_property(property_id)
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND app_scope_has_property(property_id)
  );

DROP POLICY IF EXISTS sos_event_resident_scope ON sos_events;
CREATE POLICY sos_event_resident_scope ON sos_events FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND app_scope_has_property(property_id)
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND app_scope_has_resident(user_id)
    AND app_scope_has_property(property_id)
  );

DROP POLICY IF EXISTS invoice_resident_scope ON invoices;
CREATE POLICY invoice_resident_scope ON invoices FOR ALL
  USING (organization_id = app_scope_organization_id() AND app_scope_has_resident(user_id) AND app_scope_has_property(property_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_resident(user_id) AND app_scope_has_property(property_id));

DROP POLICY IF EXISTS payment_resident_scope ON payments;
CREATE POLICY payment_resident_scope ON payments FOR ALL
  USING (organization_id = app_scope_organization_id() AND app_scope_has_resident(user_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_resident(user_id));
