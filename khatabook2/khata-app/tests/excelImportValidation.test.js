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
