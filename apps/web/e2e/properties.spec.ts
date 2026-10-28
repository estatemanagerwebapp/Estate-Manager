import { expect, test } from '@playwright/test';
import { loginAs, notifications } from './support/auth';

/**
 * Property registration and identifier derivation.
 *
 * The identifier is derived by the API from the configured identifier
 * template — the browser never computes it. The scenario therefore asserts
 * that the identifier the server returns matches the estate slug, which is
 * what the seeded `{estate_slug}` template renders.
 */
test.describe('Properties', () => {
  test('registers a property and derives its identifier from the configured template', async ({
    page,
  }) => {
    await loginAs(page, 'admin');

    const estateName = 'E2E Rowan Estate';
    const estateSlug = 'e2e_rowan_estate';

    await page.goto('/app/estates/new');
    await page.getByLabel('Name').fill(estateName);
    await page.getByLabel('Slug').fill(estateSlug);
    await page.getByRole('button', { name: 'Create estate' }).click();
    await expect(page).toHaveURL(/\/app\/estates$/);

    await page
      .getByRole('row')
      .filter({ hasText: estateName })
      .getByRole('link', { name: estateName })
      .click();
    await expect(page.getByRole('tab', { name: /Properties \(0\)/ })).toBeVisible();

    // --- register -------------------------------------------------------------
    await page.getByRole('button', { name: 'Register property' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The explicit model offers the three kinds, then the house-type catalogue
    // drives which address fields are required.
    const typeSelect = dialog.getByLabel('Property type');
    await expect(typeSelect.locator('option')).toHaveText([
      'Select a property type…',
      'House',
      'Land',
      'Both',
    ]);

    await typeSelect.selectOption('HOUSE');
    await dialog.getByLabel('House type').selectOption('bungalow');
    await dialog.getByLabel('Street name (required)').fill('Main St');
    await dialog.getByLabel('House number (required)').fill('12');
    await dialog.getByRole('button', { name: 'Register property' }).click();

    // --- the server-derived identifier ---------------------------------------
    const identifier = `${estateSlug}-Main St-12`;
    await expect(notifications(page).getByText(`Property ${identifier} registered.`)).toBeVisible();

    const propertyRow = page.getByRole('row').filter({ hasText: identifier });
    await expect(propertyRow).toBeVisible();
    await expect(propertyRow.getByRole('link', { name: identifier })).toBeVisible();
    await expect(propertyRow.getByText('House')).toBeVisible();
    await expect(propertyRow.getByText('ACTIVE')).toBeVisible();

    // The estate tab counter reflects the new property.
    await expect(page.getByRole('tab', { name: /Properties \(1\)/ })).toBeVisible();

    // --- the property has its own detail screen -------------------------------
    await propertyRow.getByRole('link', { name: estateSlug }).click();
    await expect(page).toHaveURL(/\/app\/properties\/[0-9a-f-]{36}$/);
    await expect(page.getByText(estateSlug).first()).toBeVisible();
  });
});
