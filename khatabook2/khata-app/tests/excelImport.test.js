import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { normalizeImportName, parseExcelWorkbook, parseImportMatrix, quantityFromCell } from "../src/lib/excelImport.js";

test("parses the documented customer/product matrix", () => {
  const parsed = parseImportMatrix([
    ["Customer", "P-1", "P-2", "P-3"],
    ["Cust-1", 20, 50, 0],
    ["Cust-2", 10, "", 15],
  ]);

  assert.deepEqual(parsed.headers, ["Customer", "P-1", "P-2", "P-3"]);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[1].values, [10, "", 15]);
});

test("blank, null, empty string, and zero produce no transaction", () => {
  for (const value of [undefined, null, "", "   ", 0, "0"]) {
    assert.equal(quantityFromCell(value).kind, "empty");
  }
});

test("positive numeric cells become quantities and invalid cells are rejected", () => {
  assert.deepEqual(quantityFromCell("1,250.5"), { kind: "quantity", quantity: 1250.5 });
  assert.equal(quantityFromCell(-1).kind, "invalid");
  assert.equal(quantityFromCell("many").kind, "invalid");
});

test("validates headers without making matching case-sensitive", () => {
  assert.equal(normalizeImportName("  Rahul   Dairy "), "rahul dairy");
  assert.throws(() => parseImportMatrix([]), /Header row missing/);
  assert.throws(() => parseImportMatrix([["Party", "P-1"]]), /First column/);
  assert.throws(() => parseImportMatrix([["Customer"]]), /product column/);
  assert.throws(() => parseImportMatrix([["Customer", "P-1", " p-1 "]]), /unique/);
});

test("detects a catalogue-backed header and crops preview to the table bounds", () => {
  const matrix = [
    ["Shiv Shankar Dairy"],
    ["Morning Delivery Sheet"],
    ["01 July 2026"],
    [null, null, "  CUSTOMER  ", "Aamras", "Paneer", "TOTAL"],
    [null, null, "Harsh Sharma", 2, null, 3],
    [null, null, "TOTAL", 2, 1, 3],
    [null, null, null, null, null, null],
  ];
  const parsed = parseImportMatrix(matrix, "Transactions", ["Aamras", "Paneer"]);

  assert.deepEqual(parsed.headers, ["CUSTOMER", "Aamras", "Paneer", "TOTAL"]);
  assert.equal(parsed.rows[0].rowNumber, 5);
  assert.deepEqual(parsed.rows[0].values, [2, null, 3]);
  assert.deepEqual(parsed.preview, [
    ["  CUSTOMER  ", "Aamras", "Paneer", "TOTAL"],
    ["Harsh Sharma", 2, null, 3],
    ["TOTAL", 2, 1, 3],
  ]);
});

test("requires Customer and two known catalogue products on the same row", () => {
  assert.throws(
    () => parseImportMatrix([
      ["Customer", "Aamras", "Unknown"],
      ["Customer", "Aamras", "Paneer"],
    ], "Sheet1", ["Aamras"]),
    /Header row missing/,
  );
});

for (const bookType of ["xlsx", "biff8"]) {
  test(`reads a real ${bookType === "biff8" ? ".xls" : ".xlsx"} workbook`, async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Customer", "P-1"],
      ["Cust-1", 12],
    ]), "Transactions");
    const bytes = XLSX.write(workbook, { type: "array", bookType });
    const parsed = await parseExcelWorkbook(bytes);
    assert.equal(parsed.sheetName, "Transactions");
    assert.equal(parsed.rows[0].values[0], 12);
  });
}
