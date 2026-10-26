-- Phase 3 (S9): add the resident SOS audit event type.
-- Written when a resident raises an emergency / SOS alert.
ALTER TYPE "AuditEventType" ADD VALUE 'resident_sos_raised';
