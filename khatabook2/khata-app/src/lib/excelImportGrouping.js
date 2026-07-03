import { normalizeImportName, quantityFromCell } from "./excelImport.js";

/**
 * Collect all valid product cells from one parsed Excel row. This deliberately
 * leaves parsing and matching semantics unchanged; it only prepares one
 * multi-item transaction payload instead of one payload per cell.
 */
export function collectExcelRowItems({ row, customer, productHeaders, productMap, priceMap }) {
  const items = [];
  const errors = [];
  let skipped = 0;

  for (let columnIndex = 0; columnIndex < row.values.length; columnIndex += 1) {
    const quantityResult = quantityFromCell(row.values[columnIndex]);
    if (quantityResult.kind === "empty") continue;

    const productName = productHeaders[columnIndex];
    const product = productMap.get(normalizeImportName(productName));
    if (quantityResult.kind === "invalid") {
      skipped += 1;
      errors.push(`Row ${row.rowNumber}, ${productName}: ${quantityResult.message}`);
      continue;
    }
    if (!row.customerName) {
      skipped += 1;
      errors.push(`Row ${row.rowNumber}: customer name is blank.`);
      continue;
    }
    if (!customer || !product) {
      skipped += 1;
      continue;
    }

    const price = priceMap.get(`${customer.id}:${product.id}`) ?? Number(product.sale_price);
    items.push({ product, quantity: quantityResult.quantity, price });
  }

  return { items, errors, skipped };
}

