-- Phase 3 (S5): add the resident complaint audit event types.
-- Written when a resident files a complaint on their property.
ALTER TYPE "AuditEventType" ADD VALUE 'resident_complaint_created';
