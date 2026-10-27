-- Add resident_payment_submitted to the audit event type enum.
-- Written when a resident records an out-of-band payment reference; the draft
-- stays unpaid until an administrator confirms it.
ALTER TYPE "AuditEventType" ADD VALUE 'resident_payment_submitted';
