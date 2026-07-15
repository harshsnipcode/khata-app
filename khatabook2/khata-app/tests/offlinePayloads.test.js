import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeTablePayload, TABLE_COLUMNS } from "../src/lib/offline/tableSchemas.js";
import { getAll, getRecycleBin, moveToRecycleBin, replaceFetchedData, upsertLocalRows } from "../src/lib/offline/db.js";

function installLocalStorageMock() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

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
    "product_groups",
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

test("server-empty transaction snapshot clears stale synced transaction cache", async () => {
  installLocalStorageMock();
  upsertLocalRows("transactions", [
    { id: 1, customer_id: 10, type: "gave", amount: 100, synced: true },
    { id: -1, customer_id: 11, type: "got", amount: 50 },
  ]);
  upsertLocalRows("transaction_items", [
    { id: 1, transaction_id: 1, product_id: 2, quantity: 1, price: 100, synced: true },
    { id: -1, transaction_id: -1, product_id: 3, quantity: 1, price: 50 },
  ]);

  await replaceFetchedData("transactions", []);
  await replaceFetchedData("transaction_items", []);

  assert.deepEqual((await getAll("transactions")).map((row) => row.id), [-1]);
  assert.deepEqual((await getAll("transaction_items")).map((row) => row.id), [-1]);
});

test("server-empty staff and excel snapshots clear stale synced cache", async () => {
  installLocalStorageMock();
  upsertLocalRows("employees", [
    { id: 1, username: "testing-staff", synced: true },
    { id: -1, username: "offline-staff" },
  ]);
  upsertLocalRows("employee_attendance", [
    { id: "att-1", employee_id: 1, date: "2026-07-01", status: "present", synced: true },
  ]);
  upsertLocalRows("salary_payments", [
    { id: "pay-1", employee_id: 1, amount: 500, payment_date: "2026-07-01", synced: true },
  ]);
  upsertLocalRows("import_history", [
    { id: "import-1", filename: "testing.xlsx", uploader: "admin", file_hash: "abc", parsed_preview: [], synced: true },
  ]);
  upsertLocalRows("import_batch_recycle_bin", [
    { id: "bin-1", import_history_id: "import-1", filename: "testing.xlsx", transaction_count: 2, synced: true },
  ]);

  await replaceFetchedData("employees", []);
  await replaceFetchedData("employee_attendance", []);
  await replaceFetchedData("salary_payments", []);
  await replaceFetchedData("import_history", []);
  await replaceFetchedData("import_batch_recycle_bin", []);

  assert.deepEqual((await getAll("employees")).map((row) => row.id), [-1]);
  assert.deepEqual(await getAll("employee_attendance"), []);
  assert.deepEqual(await getAll("salary_payments"), []);
  assert.deepEqual(await getAll("import_history"), []);
  assert.deepEqual(await getAll("import_batch_recycle_bin"), []);
});

test("server-empty catalogue snapshots clear stale synced catalogue cache", async () => {
  installLocalStorageMock();
  upsertLocalRows("product_groups", [
    { id: 1, name: "Testing Group", synced: true },
  ]);
  upsertLocalRows("products", [
    { id: 1, name: "Testing Product", synced: true },
    { id: -1, name: "Offline Product" },
  ]);
  upsertLocalRows("customer_product_prices", [
    { id: 1, customer_id: 2, product_id: 1, custom_price: 99, synced: true },
  ]);
  upsertLocalRows("product_transactions", [
    { id: 1, product_id: 1, type: "stock_in", quantity: 10, synced: true },
  ]);

  await replaceFetchedData("product_groups", []);
  await replaceFetchedData("products", []);
  await replaceFetchedData("customer_product_prices", []);
  await replaceFetchedData("product_transactions", []);

  assert.deepEqual(await getAll("product_groups"), []);
  assert.deepEqual((await getAll("products")).map((row) => row.id), [-1]);
  assert.deepEqual(await getAll("customer_product_prices"), []);
  assert.deepEqual(await getAll("product_transactions"), []);
});

test("server-empty import recycle snapshot clears local recycle bin cache", async () => {
  installLocalStorageMock();
  await moveToRecycleBin("transactions", 1, "Testing transaction", { id: 1 }, "admin");

  await replaceFetchedData("import_batch_recycle_bin", []);

  assert.deepEqual(await getRecycleBin(), []);
});
