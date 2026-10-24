import ExcelJS from 'exceljs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Write a workbook with a header + 3 data rows, round-trip read.
const dir = mkdtempSync(path.join(tmpdir(), 'silverstone-exceljs-'));
const file = path.join(dir, 'test.xlsx');

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Properties');
ws.addRow(['type', 'block', 'unit']);
ws.addRow(['apartment_block', '001', '01']);
ws.addRow(['apartment_block', '001', '02']);
ws.addRow(['apartment_block', '002', '01']);
await wb.xlsx.writeFile(file);
console.log('write OK:', file);

// Read back with header mapping.
const read = new ExcelJS.Workbook();
await read.xlsx.readFile(file);
const sheet = read.worksheets[0];
const headers = {};
sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
  headers[col] = String(cell.value);
});
const rows = [];
sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const mapped = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = headers[col];
    if (key) mapped[key] = cellToString(cell.value);
  });
  rows.push({ rowNumber, ...mapped });
});
console.log('read back:', JSON.stringify(rows, null, 2));

function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return String(value);
  return String(value);
}
