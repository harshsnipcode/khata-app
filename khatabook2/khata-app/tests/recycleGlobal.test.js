import assert from "node:assert/strict";
import test from "node:test";

import {
  moveToRecycleBin,
  getRecycleBin,
  restoreFromRecycleBin,
  permanentlyDeleteFromRecycleBin,
  getPendingQueue,
  replaceFetchedData,
  generateUUID,
} from "../src/lib/offline/db.js";

function installLocalStorageMock() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  delete globalThis.window;
  delete globalThis.navigator;
}

function seedEntry(entityType, entityId, amount) {
  const row = { local_uuid: generateUUID(), id: Number(entityId), amount };
  return moveToRecycleBin(entityType, String(entityId), `Entry ${entityId}`, row, "admin");
}

test("moveToRecycleBin enqueues a global idempotent recycle_bin upsert", async () => {
  installLocalStorageMock();
  await seedEntry("transactions", 1, 100);

  const queue = await getPendingQueue();
  const rbOps = queue.filter((op) => op.table === "recycle_bin");
  assert.equal(rbOps.length, 1, "one global recycle_bin op is queued");
  assert.equal(rbOps[0].method, "upsert");
  assert.deepEqual(rbOps[0].options, { onConflict: "id" });
  assert.ok(rbOps[0].payload.id, "uses local_uuid as the idempotent primary key");
  assert.equal(rbOps[0].payload.entity_type, "transactions");
});

test("restore and permanent delete enqueue global recycle_bin deletes", async () => {
  installLocalStorageMock();
  await seedEntry("customers", 7, 0);
  const [entry] = await getRecycleBin();

  const restored = await restoreFromRecycleBin(entry.local_uuid);
  assert.ok(restored.success);

  let rbOps = (await getPendingQueue()).filter((op) => op.table === "recycle_bin");
  assert.equal(rbOps.length, 2, "upsert + one delete");
  assert.equal(rbOps[0].method, "upsert");
  assert.equal(rbOps[1].method, "delete");
  assert.equal(rbOps[1].filters[0].column, "id");
  assert.equal(rbOps[1].filters[0].value, entry.local_uuid);

  await seedEntry("products", 5, 0);
  const [prodEntry] = await getRecycleBin();
  const result = await permanentlyDeleteFromRecycleBin(prodEntry.local_uuid);
  assert.ok(result.success);

  rbOps = (await getPendingQueue()).filter((op) => op.table === "recycle_bin");
  assert.equal(rbOps.length, 4, "two upserts + two deletes");
  assert.equal(rbOps[3].method, "delete");
  assert.equal(rbOps[3].filters[0].value, prodEntry.local_uuid);
});

test("server snapshot is the source of truth and overrides the local mirror", async () => {
  installLocalStorageMock();
  await seedEntry("salary_payments", 9, 500);

  // Simulate a server snapshot: three records deleted by different devices.
  const serverRows = [
    { id: "A", entity_type: "transactions", entity_id: "1", entity_name: "Txn A", deleted_at: "2026-08-01T00:00:00Z", deleted_by: "device-a", original_data: { id: 1 }, restore_deadline: "2026-11-01T00:00:00Z" },
    { id: "B", entity_type: "customers", entity_id: "2", entity_name: "Cust B", deleted_at: "2026-08-02T00:00:00Z", deleted_by: "device-b", original_data: { id: 2 }, restore_deadline: "2026-11-01T00:00:00Z" },
    { id: "C", entity_type: "products", entity_id: "3", entity_name: "Prod C", deleted_at: "2026-08-03T00:00:00Z", deleted_by: "device-c", original_data: { id: 3 }, restore_deadline: "2026-11-01T00:00:00Z" },
  ];
  await replaceFetchedData("recycle_bin", serverRows);

  const all = await getRecycleBin();
  assert.equal(all.length, 3, "all three globally-deleted records are visible");
  assert.deepEqual(all.map((e) => e.local_uuid).sort(), ["A", "B", "C"]);
});

test("restore can use data supplied from a global row (device without local copy)", async () => {
  installLocalStorageMock();
  const globalRow = {
    local_uuid: "GLOBAL-1",
    entity_type: "transactions",
    entity_id: "55",
    entity_name: "Remote txn",
    deleted_at: "2026-08-01T00:00:00Z",
    deleted_by: "device-b",
    restore_deadline: "2026-11-01T00:00:00Z",
    original_data: { transaction: { id: 55, customer_id: 3, type: "gave", amount: 200 }, transaction_items: [] },
  };

  const result = await restoreFromRecycleBin("GLOBAL-1", globalRow);
  assert.ok(result.success, "restore succeeds against a global-only record");
  assert.equal(result.entityType, "transactions");
  assert.equal(result.data.id, 55);

  const rbOps = (await getPendingQueue()).filter((op) => op.table === "recycle_bin");
  assert.equal(rbOps.some((op) => op.method === "delete" && op.filters[0].value === "GLOBAL-1"), true);
});
