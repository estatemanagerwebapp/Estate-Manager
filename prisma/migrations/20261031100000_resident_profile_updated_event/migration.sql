-- Add resident_profile_updated to the audit event type enum.
-- Written when a resident updates their own profile details (phone on the user
-- row, next-of-kin / id type on the onboarding draft row).
ALTER TYPE "AuditEventType" ADD VALUE 'resident_profile_updated';
