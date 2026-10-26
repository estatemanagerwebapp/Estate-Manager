-- Add resident_deleted to the audit event type enum.
-- Written when an administrator deletes a resident onboarding draft.
ALTER TYPE "AuditEventType" ADD VALUE 'resident_deleted';
