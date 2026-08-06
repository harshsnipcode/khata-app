import assert from "node:assert/strict";
import test from "node:test";

import db, {
  moveToRecycleBin,
  getRecycleBin,
  restoreFromRecycleBin,
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
}

function seedPaymentEntry() {
  const paymentRow = {
    local_uuid: generateUUID(),
    id: 101,
    employee_id: 2,
    amount: 1500,
    notes: "Monthly",
    payment_date: "2026-08-01",
    created_at: "2026-08-01T10:00:00Z",
    synced: true,
  };
  return moveToRecycleBin("salary_payments", String(paymentRow.id), "Salary payment of ₹1,500", paymentRow, "admin");
}

test("restore salary_payments entry by its stored local_uuid", async () => {
  installLocalStorageMock();
  await seedPaymentEntry();

  const [entry] = await getRecycleBin();
  const step1 = await db.table("recycle_bin").get(entry.local_uuid);
  assert.ok(step1, "STEP 1 must find the raw entry");

  const result = await restoreFromRecycleBin(entry.local_uuid);
  assert.ok(result.success, "restore should succeed");
  assert.equal(result.entityType, "salary_payments");
  assert.equal(result.data.id, 101);
  assert.equal((await getRecycleBin()).length, 0, "entry should be removed from the bin");
});

test("restoreFromRecycleBin falls back to entity_id when local_uuid mismatch", async () => {
  installLocalStorageMock();
  await seedPaymentEntry();

  const result = await restoreFromRecycleBin("101");
  assert.ok(result.success, "restore should succeed via entity_id fallback");
  assert.equal(result.entityType, "salary_payments");
  assert.equal(result.data.id, 101);
});

test("double restore is idempotent: second call reports not-found without erroring", async () => {
  installLocalStorageMock();
  await seedPaymentEntry();

  const [entry] = await getRecycleBin();
  const first = await restoreFromRecycleBin(entry.local_uuid);
  assert.ok(first.success, "first restore succeeds");

  const second = await restoreFromRecycleBin(entry.local_uuid);
  assert.equal(second.success, false);
  assert.equal(second.error, "Item not found");
});
