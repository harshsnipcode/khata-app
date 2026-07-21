import { normalizeProductName, quantityFromCell } from "./excelImport.js";

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
    const product = productMap.get(normalizeProductName(productName));
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

/**
 * Process Stock In table items: validate quantities and match products.
 * Uses the same normalization and product matching as customer import.
 */
export function collectStockInItems({ stockInData, productMap }) {
  const items = [];
  const unknownProducts = [];
  const errors = [];

  if (!stockInData || !stockInData.items) {
    return { items, unknownProducts, errors };
  }

  for (const stockItem of stockInData.items) {
    const quantityResult = stockItem.quantityResult;
    const productName = stockItem.productName;
    const normalizedName = normalizeProductName(productName);
    const product = productMap.get(normalizedName);

    if (quantityResult.kind === "invalid") {
      errors.push(`Row ${stockItem.rowNumber}, ${productName}: ${quantityResult.message}`);
      continue;
    }

    if (quantityResult.kind === "empty") {
      continue;
    }

    if (!product) {
      unknownProducts.push(productName);
      continue;
    }

    items.push({
      product,
      quantity: quantityResult.quantity,
      rowNumber: stockItem.rowNumber,
    });
  }

  // Remove duplicates from unknownProducts
  const uniqueUnknownProducts = [...new Set(unknownProducts)];

  return { items, unknownProducts: uniqueUnknownProducts, errors };
}
