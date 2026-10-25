import { expect, test, type Page } from '@playwright/test';
import type { PropertyOptionsView } from '@silverstone/shared';
import { loginAs, notifications } from './support/auth';

/**
 * Optimistic concurrency on the property-options screen.
 *
 * The screen sends the configuration version it was loaded with as
 * `baseVersion`. When the active configuration has moved on, the API refuses
 * the write with 409 and the screen must:
 *
 *   - keep the operator's unsaved edits,
 *   - fetch the latest configuration so a decision can be made,
 *   - offer "re-apply my changes" (write the preserved edits against the
 *     latest version) or "reload & discard" (throw the edits away).
 *
 * The scenario drives the conflict from the same session the UI uses, so the
 * 409 comes from a genuine version mismatch rather than a mocked response.
 */
test.describe('Property options', () => {
  test('preserves unsaved edits on a stale version and re-applies them on the latest one', async ({
    page,
  }) => {
    await loginAs(page, 'admin');
    await page.goto('/app/property-options');

    const template = page.getByLabel('Identifier template');
    await expect(template).toHaveValue('{estate_slug}');

    // --- edit the form -------------------------------------------------------
    const editedTemplate = '{estate_slug}-e2e';
    await template.fill(editedTemplate);

    // --- the configuration advances underneath the form -----------------------
    await advanceConfiguration(page, '{estate_slug}-concurrent');

    // --- save with the stale base version ------------------------------------
    await page.getByRole('button', { name: 'Save configuration' }).click();

    await expect(page.getByText('Configuration changed while you were editing.')).toBeVisible();
    // The operator's edits are preserved, and the conflict is explained.
    await expect(template).toHaveValue(editedTemplate);
    await expect(page.getByText('the configuration may have changed underneath')).toBeVisible();

    // --- "reload & discard" throws the edits away ----------------------------
    await page.getByRole('button', { name: 'Reload & discard' }).click();
    await expect(template).toHaveValue('{estate_slug}-concurrent');
    await expect(page.getByText('Configuration changed while you were editing.')).toHaveCount(0);

    // --- a second conflict, resolved by re-applying --------------------------
    const reappliedTemplate = '{estate_slug}-reapplied';
    await template.fill(reappliedTemplate);
    await advanceConfiguration(page, '{estate_slug}-concurrent-2');

    await page.getByRole('button', { name: 'Save configuration' }).click();
    await expect(page.getByText('Configuration changed while you were editing.')).toBeVisible();
    await expect(template).toHaveValue(reappliedTemplate);

    await page.getByRole('button', { name: 'Re-apply my changes' }).click();
    await expect(
      notifications(page).getByText('Re-applied your changes on the latest configuration.'),
    ).toBeVisible();
    await expect(template).toHaveValue(reappliedTemplate);

    // The write landed on the latest version, not the stale one.
    const view = await readOptions(page);
    expect(view.identifierTemplate).toBe(reappliedTemplate);
  });
});

/**
 * Read the current property-options view through the API, using the page's
 * own session.
 */
async function readOptions(page: Page): Promise<PropertyOptionsView> {
  const response = await page.request.get('/api/v1/property-options');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: PropertyOptionsView };
  return body.data;
}

/**
 * Publish a new configuration version through the API, using the same session
 * as the page. The form in the browser still holds the previous version, so
 * its next write is stale by construction.
 */
async function advanceConfiguration(page: Page, identifierTemplate: string): Promise<void> {
  const view = await readOptions(page);
  const labelToKey = new Map(view.assetTypes.map((type) => [type.label, type.key]));

  const response = await page.request.put('/api/v1/property-options', {
    data: {
      baseVersion: view.configVersion,
      propertyOptions: {
        addressComponents: view.addressComponents.map((component) => ({
          key: component.key,
          label: component.label,
          requiredFor: component.requiredForLabels.map((label) => labelToKey.get(label) ?? label),
          notApplicableFor: [],
          maxLength: 64,
        })),
        identifierTemplate,
        identifierMax: 120,
      },
    },
  });

  expect(response.ok()).toBeTruthy();
}
