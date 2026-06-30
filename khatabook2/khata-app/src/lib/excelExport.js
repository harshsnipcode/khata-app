import { normalizeImportName } from "./excelImport.js";

function assertUniqueNames(records, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const record of records) {
    const name = normalizeImportName(record.name);
    if (!name) throw new Error(`A ${label} has a blank name and cannot be exported for re-import.`);
    if (seen.has(name)) duplicates.add(record.name);
    seen.add(name);
  }
  if (duplicates.size > 0) {
    throw new Error(`Duplicate ${label} names cannot be exported for re-import: ${[...duplicates].join(", ")}.`);
  }
}

/** Build the exact Customer × Product matrix accepted by Bulk Excel Import. */
export function buildTransactionExportMatrix(customers, products, transactions) {
  assertUniqueNames(customers, "customer");
  assertUniqueNames(products, "product");

  const customerRow = new Map(customers.map((customer, index) => [Number(customer.id), index + 1]));
  const productColumn = new Map(products.map((product, index) => [Number(product.id), index + 1]));
  const matrix = [
    ["Customer", ...products.map((product) => product.name)],
    ...customers.map((customer) => [customer.name, ...products.map(() => 0)]),
  ];

  for (const transaction of transactions) {
    if (transaction.type !== "gave") continue;
    const rowIndex = customerRow.get(Number(transaction.customer_id));
    if (rowIndex === undefined) continue;
    for (const item of transaction.transaction_items || []) {
      const columnIndex = productColumn.get(Number(item.product_id));
      if (columnIndex === undefined) continue;
      const quantity = Number(item.quantity);
      if (Number.isFinite(quantity)) matrix[rowIndex][columnIndex] += quantity;
    }
  }

  return matrix;
}

export async function createTransactionWorkbookBytes(matrix) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  worksheet["!cols"] = matrix[0].map((_, columnIndex) => ({
    wch: Math.min(40, Math.max(12, ...matrix.map((row) => String(row[columnIndex] ?? "").length + 2))),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

export async function downloadTransactionWorkbook(matrix, filename) {
  const bytes = await createTransactionWorkbookBytes(matrix);
  const url = URL.createObjectURL(new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function toInclusiveDateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const endExclusive = new Date(`${endDate}T00:00:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { start: start.toISOString(), endExclusive: endExclusive.toISOString() };
}

export function toLocalDateInput(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
