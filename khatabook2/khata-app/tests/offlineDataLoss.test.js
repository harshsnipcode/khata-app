import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteLocalRows,
  getAll,
  getCache,
  replaceFetchedData,
  saveFetchedData,
  upsertLocalRows,
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

// Simulates an offline edit: the row was previously fetched from the server
// (synced: true) and is now mutated locally. The mutation MUST flag the row as
// unsynced so a later server refresh cannot silently discard it.
function editCustomerOffline(id, patch) {
  const current = (getCache().customers || []).find((row) => String(row.id) === String(id));
  upsertLocalRows("customers", [{ ...current, ...patch, synced: false }]);
}

test("offline customer edits survive a merge snapshot refresh (saveFetchedData)", async () => {
  installLocalStorageMock();

  // 70 customers already synced from the server.
  const serverCustomers = Array.from({ length: 70 }, (_, index) => ({
    id: index + 1,
    name: `Customer ${index + 1}`,
    phone: `000-${index + 1}`,
    synced: true,
  }));
  await saveFetchedData("customers", serverCustomers);

  // User goes offline and edits all 70 phone numbers.
  for (const customer of serverCustomers) {
    editCustomerOffline(customer.id, { phone: `EDITED-${customer.id}` });
  }

  // Only 32 of those edits have been confirmed to the server so far. The
  // background snapshot for customers still returns the STALE phone numbers for
  // the other 38. This is exactly the pipeline that previously wiped edits.
  const staleSnapshot = serverCustomers.map((customer) =>
    customer.id <= 32 ? { ...customer, phone: `EDITED-${customer.id}` } : { ...customer },
  );
  await saveFetchedData("customers", staleSnapshot, { protectUnsynced: true });

  const customers = await getAll("customers");
  assert.equal(customers.length, 70);
  for (const customer of customers) {
    assert.equal(
      customer.phone,
      `EDITED-${customer.id}`,
      `customer ${customer.id} lost its offline edit`,
    );
  }
});

test("offline edits survive a full replace snapshot (replaceFetchedData)", async () => {
  installLocalStorageMock();

  await saveFetchedData("products", [
    { id: 1, name: "Tea", price: 10, synced: true },
    { id: 2, name: "Coffee", price: 20, synced: true },
  ]);

  // Offline price change on product 2 that has not synced yet.
  upsertLocalRows("products", [{ id: 2, name: "Coffee", price: 999, synced: false }]);

  // Server replace snapshot still has the old price.
  await replaceFetchedData(
    "products",
    [
      { id: 1, name: "Tea", price: 10 },
      { id: 2, name: "Coffee", price: 20 },
    ],
    { protectUnsynced: true },
  );

  const products = await getAll("products");
  const coffee = products.find((row) => row.id === 2);
  assert.equal(coffee.price, 999, "unsynced offline price edit was overwritten by stale server data");
});

test("a confirmed server write clears the unsynced flag and becomes authoritative", async () => {
  installLocalStorageMock();

  await saveFetchedData("customers", [{ id: 1, name: "A", phone: "old", synced: true }]);
  editCustomerOffline(1, { phone: "new" });

  // After the queued update succeeds, executeOperation calls saveFetchedData
  // WITHOUT protectUnsynced (the server response is authoritative).
  await saveFetchedData("customers", [{ id: 1, name: "A", phone: "new" }]);

  const [customer] = await getAll("customers");
  assert.equal(customer.synced, true);
  assert.equal(customer.phone, "new");

  // A subsequent background refresh is now free to apply server data normally.
  await saveFetchedData("customers", [{ id: 1, name: "A", phone: "server-updated" }], {
    protectUnsynced: true,
  });
  const [refreshed] = await getAll("customers");
  assert.equal(refreshed.phone, "server-updated");
});

test("a pending offline delete is not resurrected by a server snapshot", async () => {
  installLocalStorageMock();

  await saveFetchedData("customers", [
    { id: 1, name: "Keep", synced: true },
    { id: 2, name: "Delete", synced: true },
  ]);

  // Offline delete of customer 2 (marks it unsynced so it cannot be resurrected).
  deleteLocalRows("customers", (row) => String(row.id) === "2", { markUnsynced: true });

  // Server snapshot still contains customer 2 because the delete has not synced.
  await saveFetchedData(
    "customers",
    [
      { id: 1, name: "Keep" },
      { id: 2, name: "Delete" },
    ],
    { protectUnsynced: true },
  );

  const visible = (await getAll("customers")).map((row) => row.id);
  assert.deepEqual(visible, [1], "pending offline delete was resurrected by the server snapshot");
});
