// Keep this allowlist aligned with the checked-in SQL files in /db.
// Sync must never send cache metadata or an unrecognized column to Supabase.
export const TABLE_COLUMNS = Object.freeze({
  customers: ["id", "name", "phone", "type", "created_by", "created_at", "updated_at", "address", "gstin", "photo_url", "auto_sms_enabled", "matrix_position", "collection_position"],
  product_groups: ["id", "name", "created_at", "updated_at"],
  products: ["id", "name", "group_id", "sale_price", "purchase_price", "stock_quantity", "low_stock_limit", "unit", "image_url", "created_by", "created_at", "updated_at"],
  transactions: ["id", "customer_id", "type", "amount", "description", "payment_mode", "date", "created_by", "created_at", "import_history_id"],
  transaction_items: ["id", "transaction_id", "product_id", "quantity", "price", "created_at"],
  customer_product_prices: ["id", "customer_id", "product_id", "custom_price", "created_at", "updated_at"],
  product_transactions: ["id", "product_id", "type", "quantity", "price", "notes", "created_by", "created_at"],
  employees: ["id", "username", "auth_id", "created_by", "created_at", "attendance_enabled", "permissions_enabled", "salary_type", "salary_amount", "salary_start_date", "permission_level"],
  employee_attendance: ["id", "employee_id", "date", "status", "created_at"],
  salary_payments: ["id", "employee_id", "amount", "notes", "payment_date", "created_at"],
  business_settings: ["id", "settings", "updated_at"],
  import_history: ["id", "filename", "uploaded_at", "uploader", "file_hash", "sheet_name", "parsed_preview", "import_statistics", "validation_report", "status", "is_reimport", "source_import_id"],
  import_batch_recycle_bin: ["id", "import_history_id", "filename", "transaction_count", "deleted_at", "deleted_by", "restore_deadline"],
});

export function sanitizeTablePayload(table, payload) {
  const allowedColumns = TABLE_COLUMNS[table];
  if (!allowedColumns) {
    throw new Error(`Offline sync is blocked because ${table} has no checked-in schema allowlist.`);
  }

  if (Array.isArray(payload)) {
    return payload.map((row) => sanitizeTablePayload(table, row));
  }
  if (!payload || typeof payload !== "object") return payload;

  const allowed = new Set(allowedColumns);
  return Object.fromEntries(
    Object.entries(payload).filter(([column, value]) => allowed.has(column) && value !== undefined),
  );
}
