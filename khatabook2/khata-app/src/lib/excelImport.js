export function normalizeImportName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function serializableCell(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return String(value ?? "");
}

export function parseImportMatrix(inputMatrix, sheetName = "Sheet1") {
  const matrix = (inputMatrix || []).map((row) => (row || []).map(serializableCell));
  while (matrix.length && matrix[matrix.length - 1].every(isEmpty)) matrix.pop();

  if (matrix.length === 0 || matrix[0].every(isEmpty)) {
    throw new Error("Header row missing.");
  }

  const lastHeaderIndex = matrix[0].reduce(
    (last, value, index) => (isEmpty(value) ? last : index),
    -1,
  );
  const headers = matrix[0].slice(0, lastHeaderIndex + 1).map((value) => String(value ?? "").trim());

  if (normalizeImportName(headers[0]) !== "customer") {
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
  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index].slice(0, headers.length);
    if (source.every(isEmpty)) continue;
    rows.push({
      rowNumber: index + 1,
      customerName: String(source[0] ?? "").trim(),
      values: headers.slice(1).map((_, productIndex) => source[productIndex + 1] ?? null),
    });
  }

  return {
    sheetName,
    headers,
    rows,
    preview: [headers, ...rows.map((row) => [row.customerName, ...row.values])],
  };
}

export async function parseExcelWorkbook(arrayBuffer) {
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
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });
  return parseImportMatrix(matrix, sheetName);
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
