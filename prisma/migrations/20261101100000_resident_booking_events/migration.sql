-- Phase 3 (S8): add the resident booking audit event types.
-- Written when a resident requests a booking and when they cancel one.
ALTER TYPE "AuditEventType" ADD VALUE 'resident_booking_created';
ALTER TYPE "AuditEventType" ADD VALUE 'resident_booking_cancelled';
