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

    // Every *active* configured asset type is offered — including kinds that
    // are not `detailKind === 'PROPERTY'` (the API accepts any active type).
    // The assertion auto-retries while the options are still loading.
    const typeSelect = dialog.getByLabel('Property type');
    await expect(typeSelect.locator('option')).toHaveText([
      'Select a type…',
      'House',
      'Apartment block',
      'Land plot',
    ]);

    await typeSelect.selectOption('house');
    await dialog.getByRole('button', { name: 'Register property' }).click();

    // --- the server-derived identifier ---------------------------------------
    await expect(notifications(page).getByText(`Property ${estateSlug} registered.`)).toBeVisible();

    const propertyRow = page.getByRole('row').filter({ hasText: estateSlug });
    await expect(propertyRow).toBeVisible();
    await expect(propertyRow.getByRole('link', { name: estateSlug })).toBeVisible();
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
