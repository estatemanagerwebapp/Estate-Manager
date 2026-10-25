import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createEstateViaApi, loginApiAsAdmin, loginAs, notifications } from './support/auth';

/**
 * Bulk import: upload → preview → explicit commit → row results.
 *
 * The workbook used here is the template the API itself generates for the
 * estate, so the scenario exercises the real round trip (download the
 * template, upload it again) instead of a fixture that could drift away from
 * the server's expected columns.
 */
test.describe('Imports', () => {
  test('previews an uploaded workbook, commits it explicitly and reports the row results', async ({
    page,
    request,
  }) => {
    await loginApiAsAdmin(request);

    const estateName = 'E2E Import Estate';
    const estateSlug = 'e2e_import_estate';
    const estateId = await createEstateViaApi(request, {
      name: estateName,
      slug: estateSlug,
    });

    await loginAs(page, 'admin');
    await page.goto(`/app/estates/${estateId}`);

    // --- the imports tab lives on the estate detail screen --------------------
    await page.getByRole('tab', { name: 'Imports' }).click();
    await expect(page.getByText('No import batches yet')).toBeVisible();

    // --- download the server-generated template ------------------------------
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Template' }).click();
    const download = await downloadPromise;
    const templatePath = await download.path();
    expect(templatePath).not.toBeNull();

    // --- upload it: this previews, it does not write -------------------------
    // The download is re-attached with its original filename: the API accepts
    // only `.xlsx` workbooks, and Playwright's temporary download path carries
    // no extension.
    await page.getByLabel('Upload import workbook').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await readFile(templatePath as string),
    });

    await expect(
      notifications(page).getByText('Upload previewed — 1 valid, 0 errors.'),
    ).toBeVisible();

    const batchRow = page.getByRole('row').filter({ hasText: 'properties-' });
    await expect(batchRow.getByText('PREVIEWED', { exact: true })).toBeVisible();

    // The preview shows the validation result for every row.
    await expect(page.getByText('1 rows · 1 valid · 0 errors')).toBeVisible();
    await expect(page.getByText('VALID', { exact: true })).toBeVisible();

    // Nothing was written yet: the properties tab is still empty.
    await page.getByRole('tab', { name: /Properties \(0\)/ }).click();
    await expect(page.getByText('No properties yet')).toBeVisible();

    // --- commit explicitly ----------------------------------------------------
    await page.getByRole('tab', { name: 'Imports' }).click();
    await page.getByRole('row').filter({ hasText: 'properties-' }).click();

    await page.getByRole('button', { name: 'Commit batch' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    await expect(notifications(page).getByText('Committed 1 properties.')).toBeVisible();

    const committedRow = page.getByRole('row').filter({ hasText: 'properties-' });
    await expect(committedRow.getByText('COMMITTED', { exact: true })).toBeVisible();
    await expect(committedRow.getByText('1 created')).toBeVisible();

    // --- row results ----------------------------------------------------------
    await committedRow.click();
    await expect(page.getByText('CREATED', { exact: true })).toBeVisible();

    // --- the committed property now exists ------------------------------------
    await page.getByRole('tab', { name: /Properties \(1\)/ }).click();
    const propertyRow = page.getByRole('row').filter({ hasText: estateSlug });
    await expect(propertyRow).toHaveCount(1);
    await expect(propertyRow.getByText('House')).toBeVisible();
  });
});
