-- Phase 3 (S4): add the resident access-code audit event types.
-- Written when a resident generates, extends or deactivates an access code.
ALTER TYPE "AuditEventType" ADD VALUE 'resident_code_generated';
ALTER TYPE "AuditEventType" ADD VALUE 'resident_code_extended';
ALTER TYPE "AuditEventType" ADD VALUE 'resident_code_deactivated';
