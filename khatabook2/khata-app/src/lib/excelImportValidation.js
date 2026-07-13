import { isCustomerSectionHeader, normalizeImportName } from "./excelImport.js";

export function isTotalSummaryLabel(value) {
  return normalizeImportName(value) === "total";
}

function isCompletelyEmptyPreviewRow(row) {
  return (row || []).every((cell) => String(cell ?? "").trim() === "");
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
  let firstBlockDataRowSkipped = false;

  return {
    productHeaders: includedColumnIndexes.map(({ header }) => header),
    rows: parsed.rows
      .filter((row) => {
        if (isCustomerSectionHeader(row.customerName)) return false;
        if (!firstBlockDataRowSkipped) {
          firstBlockDataRowSkipped = true;
          return false;
        }
        if (isTotalSummaryLabel(row.customerName)) return false;
        return true;
      })
      .map((row) => ({
        ...row,
        values: includedColumnIndexes.map(({ index }) => row.values[index]),
      })),
  };
}

export function buildPreviewSections(preview) {
  const sections = [];
  let currentSection = null;

  for (const row of preview || []) {
    if (isCompletelyEmptyPreviewRow(row)) continue;
    const isHeader = isCustomerSectionHeader(row?.[0]);
    if (isHeader || !currentSection) {
      currentSection = { rows: [] };
      sections.push(currentSection);
    }
    currentSection.rows.push(row);
  }

  return sections.filter((section) => section.rows.length > 0);
}
