import { expect, test } from '@playwright/test';
import { loginAs, notifications } from './support/auth';

/**
 * Estate lifecycle: create → list → detail → archive.
 *
 * Every assertion here is against what the operator sees; the API stays the
 * authority for what is actually persisted.
 */
test.describe('Estates', () => {
  test('creates an estate, lists it, opens its detail and archives it', async ({ page }) => {
    await loginAs(page, 'admin');

    // --- create ---------------------------------------------------------------
    await page.goto('/app/estates');
    await expect(page.getByRole('heading', { name: 'Estates' })).toBeVisible();

    // The header action and the empty-state action are both called
    // "New estate"; the header one is the canonical entry point.
    await page.locator('header').getByRole('link', { name: 'New estate' }).click();
    await expect(page).toHaveURL(/\/app\/estates\/new$/);

    const estateName = 'E2E Cypress Gardens';
    const estateSlug = 'e2e_cypress_gardens';

    await page.getByLabel('Name').fill(estateName);
    await page.getByLabel('Slug').fill(estateSlug);
    await page.getByLabel('Address').fill('12 Test Row');
    await page.getByRole('button', { name: 'Create estate' }).click();

    // --- list -----------------------------------------------------------------
    await expect(page).toHaveURL(/\/app\/estates$/);
    const row = page.getByRole('row').filter({ hasText: estateName });
    await expect(row).toBeVisible();
    await expect(row.getByText(estateSlug)).toBeVisible();
    await expect(row.getByText('ACTIVE')).toBeVisible();

    // --- detail ---------------------------------------------------------------
    await row.getByRole('link', { name: estateName }).click();
    await expect(page).toHaveURL(/\/app\/estates\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: new RegExp(estateName) })).toBeVisible();
    await expect(page.getByText(`slug: ${estateSlug}`)).toBeVisible();
    await expect(page.getByRole('tab', { name: /Properties \(0\)/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Imports' })).toBeVisible();

    // --- archive --------------------------------------------------------------
    await page.getByRole('button', { name: 'Archive' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    await expect(notifications(page).getByText('Estate archived.')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: new RegExp(estateName) }).getByText('ARCHIVED'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reactivate' })).toBeVisible();

    // The archived estate no longer accepts new properties.
    await expect(
      page.getByText('This estate is archived — new properties can no longer be registered here.'),
    ).toBeVisible();

    // --- the archived estate is still listed, and filterable by status --------
    await page.getByRole('link', { name: 'Back to estates' }).click();
    await expect(page).toHaveURL(/\/app\/estates$/);

    await page.getByLabel('Filter by status').selectOption('ARCHIVED');
    const archivedRow = page.getByRole('row').filter({ hasText: estateName });
    await expect(archivedRow).toBeVisible();
    await expect(archivedRow.getByText('ARCHIVED')).toBeVisible();
  });
});
