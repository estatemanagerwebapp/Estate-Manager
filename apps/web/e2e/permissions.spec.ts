import { expect, test } from '@playwright/test';
import { createEstateViaApi, loginApiAsAdmin, loginAs } from './support/auth';

/**
 * Permission gating for a read-only operator.
 *
 * The AUDITOR role carries `estate.read`, `property.read` and `audit.read`,
 * but no management capability. The console therefore shows the read-only
 * surfaces and hides the write affordances — and the route guards bounce a
 * direct visit to a management route back to the overview.
 *
 * Hiding a control is a usability measure only; the API remains the
 * authority, and the scenario proves the UI does not offer the action in the
 * first place.
 */
test.describe('Permissions', () => {
  test('an auditor can read estates and properties but cannot change them', async ({
    page,
    request,
  }) => {
    // Set up the estate through the API as the administrator, so this
    // scenario does not depend on another scenario having run first.
    await loginApiAsAdmin(request);
    const estateId = await createEstateViaApi(request, {
      name: 'E2E Audit Estate',
      slug: 'e2e_audit_estate',
    });

    await loginAs(page, 'auditor');

    // --- navigation reflects the read-only capability set ---------------------
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Estates' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Properties' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Property options' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);

    // --- estates: readable, not writable --------------------------------------
    await page.goto('/app/estates');
    await expect(page.getByRole('heading', { name: 'Estates' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'E2E Audit Estate' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New estate' })).toHaveCount(0);

    // The create route is guarded by the capability, not merely hidden.
    await page.goto('/app/estates/new');
    await expect(page).toHaveURL(/\/app$/);

    // --- estate detail: no management actions ---------------------------------
    await page.goto(`/app/estates/${estateId}`);
    await expect(page.getByRole('heading', { name: /E2E Audit Estate/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Register property' })).toHaveCount(0);

    // --- imports: readable, uploading is not offered --------------------------
    await page.getByRole('tab', { name: 'Imports' }).click();
    await expect(page.getByLabel('Upload import workbook')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Commit batch' })).toHaveCount(0);

    // --- property options: read-only ------------------------------------------
    await page.goto('/app/property-options');
    await expect(page.getByText('You can view the configuration but not edit it')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save configuration' })).toHaveCount(0);
  });
});
