import assert from "node:assert/strict";
import test from "node:test";
import { buildTransactionExportMatrix, createTransactionWorkbookBytes } from "../src/lib/excelExport.js";
import { parseExcelWorkbook, quantityFromCell } from "../src/lib/excelImport.js";

const customers = [{ id: 2, name: "Harsh Sharma" }, { id: 1, name: "Sneha Patel" }];
const products = [{ id: 20, name: "Jumbo" }, { id: 10, name: "Falooda" }];

test("aggregates repeated gave quantities while preserving supplied row and column order", () => {
  const matrix = buildTransactionExportMatrix(customers, products, [
    { customer_id: 2, type: "gave", transaction_items: [{ product_id: 20, quantity: 2 }] },
    { customer_id: 2, type: "gave", transaction_items: [{ product_id: 20, quantity: 3 }, { product_id: 10, quantity: 1 }] },
    { customer_id: 1, type: "gave", transaction_items: [{ product_id: 10, quantity: 4 }] },
    { customer_id: 2, type: "got", transaction_items: [{ product_id: 20, quantity: 99 }] },
  ]);

  assert.deepEqual(matrix, [
    ["Customer", "Jumbo", "Falooda"],
    ["Harsh Sharma", 5, 1],
    ["Sneha Patel", 0, 4],
  ]);
});

test("generated workbook is directly readable by the import parser", async () => {
  const matrix = buildTransactionExportMatrix(customers, products, [
    { customer_id: 2, type: "gave", transaction_items: [{ product_id: 20, quantity: 6 }] },
  ]);
  const bytes = await createTransactionWorkbookBytes(matrix);
  const parsed = await parseExcelWorkbook(bytes);

  assert.equal(parsed.sheetName, "Transactions");
  assert.deepEqual(parsed.headers, ["Customer", "Jumbo", "Falooda"]);
  assert.deepEqual(parsed.rows[0].values, [6, 0]);
  assert.equal(quantityFromCell(parsed.rows[0].values[1]).kind, "empty");
});

test("rejects duplicate names because they cannot round-trip through name matching", () => {
  assert.throws(
    () => buildTransactionExportMatrix([{ id: 1, name: "Same" }, { id: 2, name: " same " }], products, []),
    /Duplicate customer names/,
  );
});
