import assert from "node:assert/strict";
import test from "node:test";
import { excludeTotalSummaries, isTotalSummaryLabel } from "../src/lib/excelImportValidation.js";

test("recognizes TOTAL labels case-insensitively", () => {
  for (const value of ["TOTAL", "Total", "total", "  ToTaL  "]) {
    assert.equal(isTotalSummaryLabel(value), true);
  }
  assert.equal(isTotalSummaryLabel("Grand Total"), false);
});

test("excludes TOTAL rows and columns only from the processing view", () => {
  const parsed = {
    headers: ["CUSTOMER", "Aamras", "Paneer", "TOTAL"],
    rows: [
      { rowNumber: 2, customerName: "Harsh Sharma", values: [2, 1, 3] },
      { rowNumber: 3, customerName: "Rahul Sharma", values: [5, 2, 7] },
      { rowNumber: 4, customerName: "TOTAL", values: [7, 3, 10] },
    ],
    preview: [
      ["CUSTOMER", "Aamras", "Paneer", "TOTAL"],
      ["Harsh Sharma", 2, 1, 3],
      ["Rahul Sharma", 5, 2, 7],
      ["TOTAL", 7, 3, 10],
    ],
  };

  const processing = excludeTotalSummaries(parsed);
  assert.deepEqual(processing.productHeaders, ["Aamras", "Paneer"]);
  assert.deepEqual(processing.rows.map((row) => [row.customerName, ...row.values]), [
    ["Harsh Sharma", 2, 1],
    ["Rahul Sharma", 5, 2],
  ]);

  // Audit preview remains byte-for-byte structurally unchanged.
  assert.deepEqual(parsed.preview[0], ["CUSTOMER", "Aamras", "Paneer", "TOTAL"]);
  assert.deepEqual(parsed.preview[3], ["TOTAL", 7, 3, 10]);
  assert.equal(parsed.rows.length, 3);
});

test("excludes repeated customer section header rows from the processing view", () => {
  const parsed = {
    headers: ["CUSTOMERS", "Aamras", "Paneer", "TOTAL"],
    rows: [
      { rowNumber: 2, customerName: "Harsh Sharma", values: [2, 1, 3] },
      { rowNumber: 3, customerName: "TOTAL", values: [2, 1, 3] },
      { rowNumber: 5, customerName: "CUSTOMER", values: ["Aamras", "Paneer", "TOTAL"] },
      { rowNumber: 6, customerName: "Rahul Sharma", values: [5, 2, 7] },
      { rowNumber: 7, customerName: "TOTAL", values: [5, 2, 7] },
      { rowNumber: 9, customerName: "customers", values: ["Aamras", "Paneer", "TOTAL"] },
      { rowNumber: 10, customerName: "Priya Shah", values: [1, "", 1] },
    ],
    preview: [
      ["CUSTOMERS", "Aamras", "Paneer", "TOTAL"],
      ["Harsh Sharma", 2, 1, 3],
      ["TOTAL", 2, 1, 3],
      [null, null, null, null],
      ["CUSTOMER", "Aamras", "Paneer", "TOTAL"],
      ["Rahul Sharma", 5, 2, 7],
      ["TOTAL", 5, 2, 7],
      [null, null, null, null],
      ["customers", "Aamras", "Paneer", "TOTAL"],
      ["Priya Shah", 1, "", 1],
    ],
  };

  const processing = excludeTotalSummaries(parsed);
  assert.deepEqual(processing.productHeaders, ["Aamras", "Paneer"]);
  assert.deepEqual(processing.rows.map((row) => [row.customerName, ...row.values]), [
    ["Harsh Sharma", 2, 1],
    ["Rahul Sharma", 5, 2],
    ["Priya Shah", 1, ""],
  ]);

  assert.deepEqual(parsed.preview[4], ["CUSTOMER", "Aamras", "Paneer", "TOTAL"]);
  assert.deepEqual(parsed.preview[8], ["customers", "Aamras", "Paneer", "TOTAL"]);
});
