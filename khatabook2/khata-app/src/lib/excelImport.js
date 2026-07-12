export function normalizeImportName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function isCustomerSectionHeader(value) {
  const normalized = normalizeImportName(value);
  return normalized === "customer" || normalized === "customers";
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function serializableCell(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return String(value ?? "");
}

export function parseImportMatrix(inputMatrix, sheetName = "Sheet1", catalogueProductNames = null) {
  const matrix = (inputMatrix || []).map((row) => (row || []).map(serializableCell));

  if (matrix.length === 0 || matrix.every((row) => row.every(isEmpty))) {
    throw new Error("Header row missing.");
  }

  let headerRowIndex = 0;
  let customerColumnIndex = 0;

  if (Array.isArray(catalogueProductNames)) {
    const catalogueNames = new Set(catalogueProductNames.map(normalizeImportName).filter(Boolean));
    let detected = null;

    for (let rowIndex = 0; rowIndex < matrix.length && !detected; rowIndex += 1) {
      const row = matrix[rowIndex];
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        if (!isCustomerSectionHeader(row[columnIndex])) continue;
        let matchingProducts = 0;
        for (let scanIndex = 0; scanIndex < row.length; scanIndex += 1) {
          if (scanIndex !== columnIndex && catalogueNames.has(normalizeImportName(row[scanIndex]))) {
            matchingProducts += 1;
            if (matchingProducts >= 2) break;
          }
        }
        if (matchingProducts >= 2) {
          detected = { rowIndex, columnIndex };
          break;
        }
      }
    }

    if (!detected) throw new Error("Header row missing.");
    headerRowIndex = detected.rowIndex;
    customerColumnIndex = detected.columnIndex;
  }

  const headerRow = matrix[headerRowIndex] || [];
  const lastHeaderIndex = headerRow.reduce(
    (last, value, index) => (isEmpty(value) ? last : index),
    -1,
  );
  const headers = headerRow
    .slice(customerColumnIndex, lastHeaderIndex + 1)
    .map((value) => String(value ?? "").trim());

  if (!isCustomerSectionHeader(headers[0])) {
    throw new Error('First column must contain customer names and be headed "Customer".');
  }
  if (headers.length < 2) {
    throw new Error("At least one product column is required.");
  }
  if (headers.slice(1).some((header) => !header)) {
    throw new Error("Product column names cannot be blank.");
  }

  const normalizedHeaders = headers.slice(1).map(normalizeImportName);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error("Product column names must be unique.");
  }

  const rows = [];
  let lastPreviewRowIndex = headerRowIndex;
  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const source = matrix[index].slice(customerColumnIndex, customerColumnIndex + headers.length);
    if (source.some((value) => !isEmpty(value))) lastPreviewRowIndex = index;
    if (source.every(isEmpty)) continue;
    rows.push({
      rowNumber: index + 1,
      customerName: String(source[0] ?? "").trim(),
      values: headers.slice(1).map((_, productIndex) => source[productIndex + 1] ?? null),
    });
  }

  const preview = matrix
    .slice(headerRowIndex, lastPreviewRowIndex + 1)
    .map((row) => Array.from(
      { length: headers.length },
      (_, columnOffset) => row[customerColumnIndex + columnOffset] ?? null,
    ));

  return {
    sheetName,
    headers,
    rows,
    preview,
  };
}

export async function parseExcelWorkbook(arrayBuffer, catalogueProductNames = null) {
  let workbook;
  let XLSX;
  try {
    XLSX = await import("xlsx");
    workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  } catch {
    throw new Error("The selected file is not a readable Excel workbook.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Header row missing.");
  const worksheet = workbook.Sheets[sheetName];
  const usedRange = worksheet["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
  if (!usedRange) throw new Error("Header row missing.");
  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: true,
    range: { s: { r: 0, c: 0 }, e: usedRange.e },
  });
  return parseImportMatrix(matrix, sheetName, catalogueProductNames);
}

export async function hashFile(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function quantityFromCell(value) {
  if (isEmpty(value)) return { kind: "empty" };
  const quantity = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(quantity)) return { kind: "invalid", message: "Quantity must be a number." };
  if (quantity === 0) return { kind: "empty" };
  if (quantity < 0) return { kind: "invalid", message: "Quantity cannot be negative." };
  return { kind: "quantity", quantity };
}
