import { normalizeImportName } from "./excelImport.js";

export function isTotalSummaryLabel(value) {
  return normalizeImportName(value) === "total";
}

/**
 * Create a processing-only view that excludes spreadsheet summary data.
 * The parsed workbook and its preview are never mutated.
 */
export function excludeTotalSummaries(parsed) {
  const sourceProductHeaders = parsed.headers.slice(1);
  const includedColumnIndexes = sourceProductHeaders
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => !isTotalSummaryLabel(header));

  return {
    productHeaders: includedColumnIndexes.map(({ header }) => header),
    rows: parsed.rows
      .filter((row) => !isTotalSummaryLabel(row.customerName))
      .map((row) => ({
        ...row,
        values: includedColumnIndexes.map(({ index }) => row.values[index]),
      })),
  };
}

