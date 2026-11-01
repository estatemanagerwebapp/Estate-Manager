# Estate isolation deployment

This change enforces estate scope in the authenticated API transaction and in PostgreSQL for estate-owned operational tables. The API derives estate IDs from `user_estate_assignments` after validating the session; it does not accept estate scope from request parameters. Resident scope is derived from the resident's property. The public onboarding flow receives only the property referenced by the hashed onboarding code.

## Database operator steps

1. Back up the database and confirm the target environment and migration status.
2. Apply all pending migrations, including `20261103013000_estate_row_level_security`, using the schema migration owner (for example, `npm run db:deploy`). Do not use the API runtime role for migrations.
3. Provision a dedicated API database role with `NOSUPERUSER NOBYPASSRLS`, and ensure it does not own any RLS-protected tables. Grant it only the schema/table/function privileges the application needs. `FORCE ROW LEVEL SECURITY` does not constrain table owners, superusers, or `BYPASSRLS` roles.
4. Configure the API's `DATABASE_URL` to use that runtime role, restart the API, and check readiness. Startup fails closed if any protected table lacks both `relrowsecurity` and `relforcerowsecurity`, or if the connected role can bypass RLS.
5. Verify with two estate-admin accounts assigned to different estates: each must be unable to list, read, mutate, export, or infer the other's properties, residents, facilities, bookings, gate records, SOS, complaints, invoices, messages, notifications, or estate activity. Verify that super-admin access remains organization-wide and resident access remains limited to the resident's property/estate.

## Operational notes

- The protected table list and startup checks live in `apps/api/src/lib/prisma.ts`; row policies and helper functions are in the migration above.
- Public onboarding code access is intentionally narrow and uses a SHA-256 code hash as a transaction-local scope. Never set the scope GUCs from client-provided estate or property IDs.
- This migration deliberately does not enable RLS on authentication/session, organization configuration, or global house-type catalogue tables because login and organization configuration currently run before or outside an authenticated estate scope. Those tables remain organization-wide and must stay behind their existing authentication/permission checks. A future change can add RLS after introducing dedicated pre-authentication and system scopes.
- Applying the migration alone is insufficient if the API continues connecting as the migration owner or a role with `BYPASSRLS`; readiness will reject that setup.
