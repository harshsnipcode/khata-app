import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeTablePayload, TABLE_COLUMNS } from "../src/lib/offline/tableSchemas.js";

test("transaction sync payload strips every local and unknown field", () => {
  const payload = sanitizeTablePayload("transactions", {
    id: -7,
    customer_id: 12,
    type: "gave",
    amount: 250,
    created_at: "2026-07-12T10:00:00.000Z",
    updated_at: "not-in-the-checked-in-table",
    recycle_bin: true,
    local_uuid: "local-only",
    synced: false,
    deleted_locally: false,
    __local_updated_at: "cache-only",
  });

  assert.deepEqual(payload, {
    id: -7,
    customer_id: 12,
    type: "gave",
    amount: 250,
    created_at: "2026-07-12T10:00:00.000Z",
  });
});

test("transaction item payload strips hydrated products and cache metadata", () => {
  const payload = sanitizeTablePayload("transaction_items", {
    id: 4,
    transaction_id: 8,
    product_id: 3,
    quantity: 2,
    price: 99,
    products: { id: 3, name: "Tea" },
    local_uuid: "cache-row",
  });

  assert.deepEqual(payload, {
    id: 4,
    transaction_id: 8,
    product_id: 3,
    quantity: 2,
    price: 99,
  });
});

test("all offline sync tables have explicit checked-in schema allowlists", () => {
  const expectedTables = [
    "customers",
    "products",
    "transactions",
    "transaction_items",
    "customer_product_prices",
    "product_transactions",
    "employees",
    "employee_attendance",
    "salary_payments",
    "business_settings",
    "import_history",
    "import_batch_recycle_bin",
  ];

  assert.deepEqual(Object.keys(TABLE_COLUMNS).sort(), expectedTables.sort());
  assert.throws(
    () => sanitizeTablePayload("unknown_table", { id: 1 }),
    /no checked-in schema allowlist/,
  );
});
