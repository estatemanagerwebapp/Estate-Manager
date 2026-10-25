import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { createEstateViaApi, loginApiAsAdmin, loginAs, notifications } from './support/auth';

/**
 * Bulk import: upload → preview → explicit commit → row results.
 *
 * The workbook used here is the template the API itself generates for the
 * estate, so the scenario exercises the real round trip (download the
 * template, upload it again) instead of a fixture that could drift away from
 * the server's expected columns.
 *
 * The generated template's first worksheet is deliberately header-only: it
 * carries no importable sample row, so downloading and re-uploading the
 * unchanged template must create no properties. The second scenario adds one
 * deliberate, valid data row to that same server-generated template and checks
 * that it previews as one valid row at worksheet row 2 and commits as exactly
 * one property.
 *
 * `exceljs` is the repository's existing Excel library — declared by the API
 * workspace and hoisted into the root `node_modules`. The browser suite reuses
 * it here to inspect and extend the workbook the server produced, rather than
 * checking in a second copy of the template as a binary fixture.
 */
test.describe('Imports', () => {
  test('downloading and re-uploading the unchanged template creates no properties', async ({
    page,
    request,
  }) => {
    const estateName = 'E2E Import Estate 1';
    const estateSlug = 'e2e_import_estate_1';

    // The API session must exist before the estate is created: the estate
    // endpoint is authenticated, and an anonymous call is refused with 401.
    await loginApiAsAdmin(request);
    const estateId = await createEstateViaApi(request, {
      name: estateName,
      slug: estateSlug,
    });

    await loginAs(page, 'admin');
    await page.goto(`/app/estates/${estateId}`);

    await page.getByRole('tab', { name: 'Imports' }).click();
    await expect(page.getByText('No import batches yet')).toBeVisible();

    // --- download the server-generated template ------------------------------
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Template' }).click();
    const download = await downloadPromise;
    const templatePath = await download.path();
    expect(templatePath).not.toBeNull();

    // --- the template carries headers only, no importable sample row --------
    const template = await loadWorkbook(templatePath as string);
    const propertiesSheet = template.worksheets[0];
    expect(propertiesSheet).toBeDefined();
    expect(propertiesSheet?.name).toBe('Properties');
    // Exactly one populated row: the header. Nothing to import yet.
    expect(propertiesSheet?.actualRowCount).toBe(1);
    expect(headersOf(propertiesSheet)).toEqual(['type']);

    // --- upload the unchanged template --------------------------------------
    await page.getByLabel('Upload import workbook').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await readFile(templatePath as string),
    });

    // The preview reports zero rows: a header-only workbook imports nothing.
    await expect(
      notifications(page).getByText('Upload previewed — 0 valid, 0 errors.'),
    ).toBeVisible();

    const batchRow = page.getByRole('row').filter({ hasText: 'properties-' });
    await expect(batchRow.getByText('PREVIEWED', { exact: true })).toBeVisible();

    await expect(page.getByText('0 rows · 0 valid · 0 errors')).toBeVisible();

    // Nothing was written: the properties tab is still empty.
    await page.getByRole('tab', { name: /Properties \(0\)/ }).click();
    await expect(page.getByText('No properties yet')).toBeVisible();
  });

  test('a template with one deliberate row creates exactly one property', async ({
    page,
    request,
  }) => {
    const estateName = 'E2E Import Estate 2';
    const estateSlug = 'e2e_import_estate_2';

    await loginApiAsAdmin(request);
    const estateId = await createEstateViaApi(request, {
      name: estateName,
      slug: estateSlug,
    });

    await loginAs(page, 'admin');
    await page.goto(`/app/estates/${estateId}`);

    await page.getByRole('tab', { name: 'Imports' }).click();
    await expect(page.getByText('No import batches yet')).toBeVisible();

    // --- download the server-generated template ------------------------------
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Template' }).click();
    const download = await downloadPromise;
    const templatePath = await download.path();
    expect(templatePath).not.toBeNull();

    // --- add one deliberate, valid property row ------------------------------
    const workbook = await loadWorkbook(templatePath as string);
    const sheet = workbook.worksheets[0];
    expect(sheet).toBeDefined();
    const headers = headersOf(sheet);
    expect(headers).toEqual(['type']);

    // The row lands directly beneath the header, so it is worksheet row 2.
    sheet?.addRow(['house']);
    expect(sheet?.actualRowCount).toBe(2);

    const populated = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

    // --- upload the populated template ---------------------------------------
    await page.getByLabel('Upload import workbook').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: populated,
    });

    // --- preview: one valid row, reported at worksheet row 2 -----------------
    await expect(
      notifications(page).getByText('Upload previewed — 1 valid, 0 errors.'),
    ).toBeVisible();

    const batchRow = page.getByRole('row').filter({ hasText: 'properties-' });
    await expect(batchRow.getByText('PREVIEWED', { exact: true })).toBeVisible();
    await expect(page.getByText('1 rows · 1 valid · 0 errors')).toBeVisible();

    // The row-results table is keyed on the physical worksheet row number:
    // row 1 is the header, so the first data row is row 2.
    const rowResults = page.locator('table').filter({ hasText: 'Worksheet row' });
    await expect(rowResults.getByRole('columnheader', { name: 'Worksheet row' })).toBeVisible();
    const firstDataRow = rowResults.getByRole('row').nth(1);
    await expect(firstDataRow.getByRole('cell').first()).toHaveText('2');
    await expect(firstDataRow.getByText('VALID', { exact: true })).toBeVisible();

    // --- preview wrote nothing yet -------------------------------------------
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

    // --- exactly one property now exists -------------------------------------
    await page.getByRole('tab', { name: /Properties \(1\)/ }).click();
    const propertyRow = page.getByRole('row').filter({ hasText: estateSlug });
    await expect(propertyRow).toHaveCount(1);
    await expect(propertyRow.getByText('House')).toBeVisible();
  });
});

/** Load an `.xlsx` workbook from disk. */
async function loadWorkbook(path: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

/** The header labels of a worksheet, in column order. */
function headersOf(sheet: ExcelJS.Worksheet | undefined): string[] {
  if (!sheet) return [];
  const values = sheet.getRow(1).values as unknown[];
  return values.slice(1).map((value) => String(value ?? ''));
}
