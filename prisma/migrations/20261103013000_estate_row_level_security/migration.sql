-- Estate isolation is enforced from request-local settings that are set only
-- after the API verifies the session. Never set these values from request data.
CREATE OR REPLACE FUNCTION app_scope_organization_id() RETURNS UUID
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_scope_user_id() RETURNS UUID
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_scope_role() RETURNS TEXT
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.user_role', true), ''), '')
$$;

CREATE OR REPLACE FUNCTION app_scope_onboarding_code_hash() RETURNS TEXT
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.onboarding_code_hash', true), ''), '')
$$;

CREATE OR REPLACE FUNCTION app_scope_has_estate(candidate UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
  SELECT candidate IS NOT NULL AND (
    app_scope_role() = 'SUPER_ADMIN'
    OR candidate = ANY(COALESCE(
      string_to_array(NULLIF(current_setting('app.estate_ids', true), ''), ',')::uuid[],
      ARRAY[]::uuid[]
    ))
  )
$$;

CREATE OR REPLACE FUNCTION app_scope_has_property(candidate UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT app_scope_role() = 'SUPER_ADMIN' OR (candidate IS NOT NULL AND (
    candidate = ANY(COALESCE(
      string_to_array(NULLIF(current_setting('app.property_ids', true), ''), ',')::uuid[],
      ARRAY[]::uuid[]
    ))
    OR (
      app_scope_role() <> 'ONBOARDING'
      AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = candidate
        AND p.organization_id = app_scope_organization_id()
        AND app_scope_has_estate(p.estate_id)
      )
    )
  ))
$$;

CREATE OR REPLACE FUNCTION app_scope_resident_estate(candidate UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT app_scope_role() = 'RESIDENT' AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.organization_id = app_scope_organization_id()
      AND p.id = ANY(COALESCE(
        string_to_array(NULLIF(current_setting('app.property_ids', true), ''), ',')::uuid[],
        ARRAY[]::uuid[]
      ))
      AND p.estate_id = candidate
  )
$$;

CREATE OR REPLACE FUNCTION app_scope_has_resident(candidate UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT candidate IS NOT NULL AND (
    candidate = app_scope_user_id()
    OR app_scope_role() = 'SUPER_ADMIN'
    OR EXISTS (
      SELECT 1 FROM resident_onboardings ro
      WHERE ro.user_id = candidate
        AND ro.organization_id = app_scope_organization_id()
        AND app_scope_has_property(ro.property_id)
    )
  )
$$;

-- Estate directory and core property data.
ALTER TABLE estates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estates FORCE ROW LEVEL SECURITY;
CREATE POLICY estate_scope ON estates
  USING (organization_id = app_scope_organization_id() AND app_scope_has_estate(id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_estate(id));
CREATE POLICY estate_resident_read_scope ON estates FOR SELECT
  USING (
    organization_id = app_scope_organization_id()
    AND app_scope_role() IN ('RESIDENT', 'ONBOARDING')
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.estate_id = estates.id
        AND p.id = ANY(COALESCE(string_to_array(NULLIF(current_setting('app.property_ids', true), ''), ',')::uuid[], ARRAY[]::uuid[]))
    )
  );

ALTER TABLE user_estate_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_estate_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY user_estate_assignment_scope ON user_estate_assignments
  USING (
    organization_id = app_scope_organization_id()
    AND (
      app_scope_role() = 'SUPER_ADMIN'
      OR user_id = app_scope_user_id()
      OR app_scope_has_estate(estate_id)
    )
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND app_scope_role() = 'SUPER_ADMIN'
  );

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties FORCE ROW LEVEL SECURITY;
CREATE POLICY property_staff_scope ON properties
  USING (organization_id = app_scope_organization_id() AND app_scope_has_estate(estate_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_estate(estate_id));
CREATE POLICY property_resident_read_scope ON properties FOR SELECT
  USING (organization_id = app_scope_organization_id() AND id = ANY(COALESCE(
    string_to_array(NULLIF(current_setting('app.property_ids', true), ''), ',')::uuid[],
    ARRAY[]::uuid[]
  )));

ALTER TABLE resident_onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE resident_onboardings FORCE ROW LEVEL SECURITY;
CREATE POLICY resident_onboarding_scope ON resident_onboardings
  USING (
    organization_id = app_scope_organization_id()
    AND (
      (app_scope_role() = 'ONBOARDING' AND code_hash = app_scope_onboarding_code_hash())
      OR user_id = app_scope_user_id()
      OR app_scope_has_property(property_id)
    )
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND app_scope_has_property(property_id)
  );

-- Estate imports; organization-wide imports are reserved for super admins.
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY import_batch_scope ON import_batches
  USING (organization_id = app_scope_organization_id() AND app_scope_has_estate(estate_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_estate(estate_id));

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY import_row_scope ON import_rows
  USING (EXISTS (
    SELECT 1 FROM import_batches b
    WHERE b.id = import_rows.batch_id
      AND b.organization_id = app_scope_organization_id()
      AND app_scope_has_estate(b.estate_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM import_batches b
    WHERE b.id = import_rows.batch_id
      AND b.organization_id = app_scope_organization_id()
      AND app_scope_has_estate(b.estate_id)
  ));

ALTER TABLE organization_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_import_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_import_batch_super_admin ON organization_import_batches
  USING (organization_id = app_scope_organization_id() AND app_scope_role() = 'SUPER_ADMIN')
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_role() = 'SUPER_ADMIN');

ALTER TABLE organization_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_import_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_import_row_super_admin ON organization_import_rows
  USING (EXISTS (
    SELECT 1 FROM organization_import_batches b
    WHERE b.id = organization_import_rows.batch_id
      AND b.organization_id = app_scope_organization_id()
      AND app_scope_role() = 'SUPER_ADMIN'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM organization_import_batches b
    WHERE b.id = organization_import_rows.batch_id
      AND b.organization_id = app_scope_organization_id()
      AND app_scope_role() = 'SUPER_ADMIN'
  ));

-- Estate operations: facilities, bookings, broadcasts, gate, SOS and complaints.
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities FORCE ROW LEVEL SECURITY;
CREATE POLICY facility_scope ON facilities
  USING (organization_id = app_scope_organization_id() AND app_scope_has_estate(estate_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_estate(estate_id));
CREATE POLICY facility_resident_read_scope ON facilities FOR SELECT
  USING (organization_id = app_scope_organization_id() AND app_scope_role() = 'RESIDENT' AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = ANY(COALESCE(string_to_array(NULLIF(current_setting('app.property_ids', true), ''), ',')::uuid[], ARRAY[]::uuid[]))
      AND p.estate_id = facilities.estate_id
  ));

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_staff_scope ON bookings
  USING (
    organization_id = app_scope_organization_id()
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = bookings.facility_id AND app_scope_has_estate(f.estate_id))
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = bookings.facility_id AND app_scope_has_estate(f.estate_id))
  );
CREATE POLICY booking_resident_scope ON bookings FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = bookings.facility_id AND app_scope_resident_estate(f.estate_id))
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = bookings.facility_id AND app_scope_resident_estate(f.estate_id))
  );

ALTER TABLE facility_availability_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_availability_watches FORCE ROW LEVEL SECURITY;
CREATE POLICY facility_watch_staff_scope ON facility_availability_watches
  USING (
    organization_id = app_scope_organization_id()
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_availability_watches.facility_id AND app_scope_has_estate(f.estate_id))
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_availability_watches.facility_id AND app_scope_has_estate(f.estate_id))
  );
CREATE POLICY facility_watch_resident_scope ON facility_availability_watches FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_availability_watches.facility_id AND app_scope_resident_estate(f.estate_id))
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_availability_watches.facility_id AND app_scope_resident_estate(f.estate_id))
  );

ALTER TABLE estate_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE estate_broadcasts FORCE ROW LEVEL SECURITY;
CREATE POLICY estate_broadcast_scope ON estate_broadcasts
  USING (organization_id = app_scope_organization_id() AND app_scope_has_estate(estate_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_estate(estate_id));
CREATE POLICY estate_broadcast_resident_read_scope ON estate_broadcasts FOR SELECT
  USING (organization_id = app_scope_organization_id() AND app_scope_resident_estate(estate_id));

ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY access_code_staff_scope ON access_codes
  USING (organization_id = app_scope_organization_id() AND app_scope_has_property(property_id))
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND (
      (property_id IS NULL AND user_id = app_scope_user_id())
      OR app_scope_has_property(property_id)
    )
  );
CREATE POLICY access_code_resident_scope ON access_codes FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND app_scope_has_property(property_id)
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND app_scope_has_property(property_id)
  );

ALTER TABLE access_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_verifications FORCE ROW LEVEL SECURITY;
CREATE POLICY access_verification_staff_scope ON access_verifications
  USING (
    organization_id = app_scope_organization_id()
    AND (
      app_scope_has_property(property_id)
      OR EXISTS (SELECT 1 FROM access_codes c WHERE c.id = access_verifications.access_code_id AND app_scope_has_property(c.property_id))
    )
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND (
      (property_id IS NULL AND verified_by_id = app_scope_user_id())
      OR app_scope_has_property(property_id)
    )
  );

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints FORCE ROW LEVEL SECURITY;
CREATE POLICY complaint_staff_scope ON complaints
  USING (organization_id = app_scope_organization_id() AND app_scope_has_property(property_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_property(property_id));
CREATE POLICY complaint_resident_scope ON complaints FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND app_scope_has_property(property_id)
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND app_scope_has_property(property_id)
  );

ALTER TABLE complaint_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_replies FORCE ROW LEVEL SECURITY;
CREATE POLICY complaint_reply_scope ON complaint_replies
  USING (EXISTS (
    SELECT 1 FROM complaints c
    WHERE c.id = complaint_replies.complaint_id
      AND c.organization_id = app_scope_organization_id()
      AND (app_scope_has_property(c.property_id) OR c.user_id = app_scope_user_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM complaints c
    WHERE c.id = complaint_replies.complaint_id
      AND c.organization_id = app_scope_organization_id()
      AND (app_scope_has_property(c.property_id) OR c.user_id = app_scope_user_id())
  ));

ALTER TABLE sos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_events FORCE ROW LEVEL SECURITY;
CREATE POLICY sos_event_staff_scope ON sos_events
  USING (organization_id = app_scope_organization_id() AND app_scope_has_property(property_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_property(property_id));
CREATE POLICY sos_event_resident_scope ON sos_events FOR ALL
  USING (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND app_scope_has_property(property_id)
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND user_id = app_scope_user_id()
    AND app_scope_has_property(property_id)
  );

-- Estate-aware finance and resident-owned ledgers.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_staff_scope ON invoices
  USING (organization_id = app_scope_organization_id() AND app_scope_has_property(property_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_property(property_id));
CREATE POLICY invoice_resident_scope ON invoices FOR ALL
  USING (organization_id = app_scope_organization_id() AND user_id = app_scope_user_id())
  WITH CHECK (organization_id = app_scope_organization_id() AND user_id = app_scope_user_id());

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_staff_scope ON payments
  USING (
    organization_id = app_scope_organization_id()
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id AND app_scope_has_property(i.property_id))
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id AND app_scope_has_property(i.property_id))
  );
CREATE POLICY payment_resident_scope ON payments FOR ALL
  USING (organization_id = app_scope_organization_id() AND user_id = app_scope_user_id())
  WITH CHECK (organization_id = app_scope_organization_id() AND user_id = app_scope_user_id());

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY transaction_scope ON transactions
  USING (organization_id = app_scope_organization_id() AND app_scope_has_resident(user_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_resident(user_id));

-- Estate staff may view activity for assigned estates; users retain their own
-- event history; only SUPER_ADMIN receives organization-wide audit access.
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_event_scope ON audit_events
  USING (
    organization_id = app_scope_organization_id()
    AND (
      app_scope_role() = 'SUPER_ADMIN'
      OR actor_id = app_scope_user_id()
      OR (
        metadata ? 'estateId'
        AND EXISTS (
          SELECT 1 FROM estates e
          WHERE e.organization_id = app_scope_organization_id()
            AND e.id::text = metadata->>'estateId'
            AND app_scope_has_estate(e.id)
        )
      )
      OR (target_type = 'estate' AND app_scope_has_estate(target_id))
      OR (target_type = 'property' AND app_scope_has_property(target_id))
      OR (target_type = 'facility' AND EXISTS (
        SELECT 1 FROM facilities f
        WHERE f.id = audit_events.target_id
          AND f.organization_id = app_scope_organization_id()
          AND app_scope_has_estate(f.estate_id)
      ))
      OR (target_type = 'booking' AND EXISTS (
        SELECT 1 FROM bookings b JOIN facilities f ON f.id = b.facility_id
        WHERE b.id = audit_events.target_id
          AND b.organization_id = app_scope_organization_id()
          AND app_scope_has_estate(f.estate_id)
      ))
    )
  )
  WITH CHECK (organization_id = app_scope_organization_id());

-- Conversations/notifications are scoped by the estate attached to the
-- resident, or by the resident's own account identity.
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY message_thread_scope ON message_threads
  USING (organization_id = app_scope_organization_id() AND app_scope_has_resident(resident_user_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_resident(resident_user_id));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY message_scope ON messages
  USING (EXISTS (
    SELECT 1 FROM message_threads t
    WHERE t.id = messages.thread_id
      AND t.organization_id = app_scope_organization_id()
      AND app_scope_has_resident(t.resident_user_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM message_threads t
    WHERE t.id = messages.thread_id
      AND t.organization_id = app_scope_organization_id()
      AND app_scope_has_resident(t.resident_user_id)
  ));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_scope ON notifications
  USING (organization_id = app_scope_organization_id() AND app_scope_has_resident(user_id))
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_has_resident(user_id));

-- Announcements are organization-wide by design. Restrict writes to super
-- admins; estate-specific communication uses estate_broadcasts above.
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
CREATE POLICY announcement_read_scope ON announcements FOR SELECT
  USING (organization_id = app_scope_organization_id());
CREATE POLICY announcement_insert_super_admin ON announcements FOR INSERT
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_role() = 'SUPER_ADMIN');
CREATE POLICY announcement_update_super_admin ON announcements FOR UPDATE
  USING (organization_id = app_scope_organization_id() AND app_scope_role() = 'SUPER_ADMIN')
  WITH CHECK (organization_id = app_scope_organization_id() AND app_scope_role() = 'SUPER_ADMIN');
CREATE POLICY announcement_delete_super_admin ON announcements FOR DELETE
  USING (organization_id = app_scope_organization_id() AND app_scope_role() = 'SUPER_ADMIN');

-- File metadata is only visible to its uploader or the super admin. Estate
-- documents should be served through an authenticated route that first
-- authorizes the associated onboarding/property record.
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files FORCE ROW LEVEL SECURITY;
CREATE POLICY media_file_scope ON media_files
  USING (
    organization_id = app_scope_organization_id()
    AND (
      uploaded_by_id = app_scope_user_id()
      OR app_scope_role() = 'SUPER_ADMIN'
      OR EXISTS (
        SELECT 1 FROM resident_onboardings ro
        WHERE ro.organization_id = app_scope_organization_id()
          AND ro.id_document_url LIKE '%' || media_files.relative_path
          AND app_scope_has_property(ro.property_id)
      )
    )
  )
  WITH CHECK (
    organization_id = app_scope_organization_id()
    AND (
      uploaded_by_id = app_scope_user_id()
      OR app_scope_role() IN ('SUPER_ADMIN', 'ONBOARDING')
    )
  );

-- The DB runtime role must be a non-owner role without BYPASSRLS. FORCE ROW
-- LEVEL SECURITY does not constrain PostgreSQL superusers or BYPASSRLS roles.
