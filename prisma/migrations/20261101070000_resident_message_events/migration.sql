-- Phase 3 (S6): add the resident message audit event type.
-- Written when a resident starts or replies to a message thread.
ALTER TYPE "AuditEventType" ADD VALUE 'resident_message_sent';
