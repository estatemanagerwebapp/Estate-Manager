-- Phase 3 (S3): add resident_invoice_created to the audit event type enum.
-- Written when a new resident invoice is created (e.g. the registration-fee
-- seed at account creation, or a later recurring billing cycle).
ALTER TYPE "AuditEventType" ADD VALUE 'resident_invoice_created';
