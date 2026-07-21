import test from "node:test";
import assert from "node:assert";
import { isStockInSectionHeader, parseStockInTable, quantityFromCell } from "../src/lib/excelImport.js";

test("detects STOCK IN header case-insensitively", () => {
  assert.strictEqual(isStockInSectionHeader("STOCK IN"), true);
  assert.strictEqual(isStockInSectionHeader("Stock In"), true);
  assert.strictEqual(isStockInSectionHeader("stock in"), true);
  assert.strictEqual(isStockInSectionHeader("STOCK"), false);
  assert.strictEqual(isStockInSectionHeader("IN"), false);
});

test("returns null when no STOCK IN table exists", () => {
  const matrix = [
    ["Customer", "Product A", "Product B"],
    ["John", 10, 20],
    ["Jane", 5, 15],
  ];
  const result = parseStockInTable(matrix);
  assert.strictEqual(result, null);
});

test("returns null when STOCK IN header exists but no QTY adjacent", () => {
  const matrix = [
    ["STOCK IN", "Price", "Notes"],
    ["SPJ", 100, "some notes"],
  ];
  const result = parseStockInTable(matrix);
  assert.strictEqual(result, null);
});

test("parses valid STOCK IN table with QTY column", () => {
  const matrix = [
    ["STOCK IN", "QTY"],
    ["SPJ", 880],
    ["SP 1/2", 200],
    ["SP 1", 610],
    ["", ""], // Empty row terminates
  ];
  const result = parseStockInTable(matrix);
  
  assert.ok(result !== null);
  assert.strictEqual(result.items.length, 3);
  assert.deepStrictEqual(result.items[0], {
    rowNumber: 2,
    productName: "SPJ",
    quantityResult: { kind: "quantity", quantity: 880 },
  });
  assert.deepStrictEqual(result.items[1], {
    rowNumber: 3,
    productName: "SP 1/2",
    quantityResult: { kind: "quantity", quantity: 200 },
  });
  assert.deepStrictEqual(result.items[2], {
    rowNumber: 4,
    productName: "SP 1",
    quantityResult: { kind: "quantity", quantity: 610 },
  });
});

test("handles variations of QTY column header", () => {
  const matrix = [
    ["STOCK IN", "Quantity"],
    ["SPJ", 880],
    ["", ""],
  ];
  const result = parseStockInTable(matrix);
  
  assert.ok(result !== null);
  assert.strictEqual(result.items.length, 1);
  assert.strictEqual(result.items[0].productName, "SPJ");
});

test("builds preview with header and data rows", () => {
  const matrix = [
    ["STOCK IN", "QTY"],
    ["SPJ", 880],
    ["SP 1/2", 200],
    ["", ""],
  ];
  const result = parseStockInTable(matrix);
  
  assert.ok(result !== null);
  assert.ok(Array.isArray(result.preview));
  assert.strictEqual(result.preview.length, 3);
  assert.deepStrictEqual(result.preview[0], { productName: "STOCK IN", quantity: "QTY" });
  assert.deepStrictEqual(result.preview[1], { productName: "SPJ", quantity: 880 });
  assert.deepStrictEqual(result.preview[2], { productName: "SP 1/2", quantity: 200 });
});

test("returns null when STOCK IN table is empty", () => {
  const matrix = [
    ["STOCK IN", "QTY"],
    ["", ""],
  ];
  const result = parseStockInTable(matrix);
  
  assert.strictEqual(result, null);
});

test("handles STOCK IN table placed anywhere on worksheet", () => {
  const matrix = [
    ["Unrelated", "Data"],
    ["More", "Stuff"],
    ["", ""],
    ["STOCK IN", "QTY"],
    ["SPJ", 100],
    ["FM 1", 50],
    ["", ""],
  ];
  const result = parseStockInTable(matrix);
  
  assert.ok(result !== null);
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.items[0].productName, "SPJ");
});

test("skips empty rows within STOCK IN table but stops at first fully empty row", () => {
  const matrix = [
    ["STOCK IN", "QTY"],
    ["SPJ", 880],
    [null, null], // Completely empty - should stop
    ["This should not parse", 999],
  ];
  const result = parseStockInTable(matrix);
  
  assert.ok(result !== null);
  assert.strictEqual(result.items.length, 1);
});

test("collects items with invalid quantities for downstream validation", () => {
  const matrix = [
    ["STOCK IN", "QTY"],
    ["SPJ", "not-a-number"],
    ["FM", -50],
    ["", ""],
  ];
  const result = parseStockInTable(matrix);
  
  assert.ok(result !== null);
  // parseStockInTable collects all items; collectStockInItems validates them
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.items[0].quantityResult.kind, "invalid");
  assert.strictEqual(result.items[1].quantityResult.kind, "invalid");
});

test("recognizes QTY header case-insensitively", () => {
  const matrix1 = [
    ["STOCK IN", "qty"],
    ["SPJ", 100],
    ["", ""],
  ];
  const result1 = parseStockInTable(matrix1);
  assert.ok(result1 !== null);

  const matrix2 = [
    ["STOCK IN", "QTY"],
    ["SPJ", 100],
    ["", ""],
  ];
  const result2 = parseStockInTable(matrix2);
  assert.ok(result2 !== null);

  const matrix3 = [
    ["STOCK IN", "Quantity"],
    ["SPJ", 100],
    ["", ""],
  ];
  const result3 = parseStockInTable(matrix3);
  assert.ok(result3 !== null);
});
