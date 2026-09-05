import assert from "node:assert/strict";
import { test, mock } from "node:test";

const serverData = {
  transactions: [],
  transaction_items: [],
  customers: [],
  products: [],
  recycle_bin: [],
  import_batch_recycle_bin: [],
};

let nextId = 1000;

function matchesFilter(row, filter) {
  const v = row?.[filter.column];
  const t = filter.value;
  if (filter.operator === "eq") return String(v) === String(t);
  if (filter.operator === "neq") return String(v) !== String(t);
  if (filter.operator === "in") return (t || []).map(String).includes(String(v));
  if (filter.operator === "is") return v === t;
  if (filter.operator === "like" || filter.operator === "ilike") return String(v || "").includes(String(t || "").replaceAll("%", ""));
  return v === t;
}

function applyFilters(rows, filters) {
  return rows.filter((row) => filters.every((f) => matchesFilter(row, f)));
}

function pick(rows, cols) {
  if (!cols || cols === "*" || cols.includes("(")) return rows;
  const fields = cols.split(",").map((s) => s.trim()).filter(Boolean);
  return rows.map((row) => Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])));
}

function builderSpec(table, method, payload, options) {
  const ops = { table, method, payload, options, filters: [], selectColumns: null, order: null, range: null, limit: null, single: false, maybeSingle: false };
  const builder = {
    select: (cols) => { ops.selectColumns = cols; return builder; },
    eq: (c, v) => { ops.filters.push({ column: c, operator: "eq", value: v }); return builder; },
    neq: (c, v) => { ops.filters.push({ column: c, operator: "neq", value: v }); return builder; },
    in: (c, v) => { ops.filters.push({ column: c, operator: "in", value: v }); return builder; },
    is: (c, v) => { ops.filters.push({ column: c, operator: "is", value: v }); return builder; },
    like: (c, v) => { ops.filters.push({ column: c, operator: "like", value: v }); return builder; },
    ilike: (c, v) => { ops.filters.push({ column: c, operator: "ilike", value: v }); return builder; },
    order: (c, { ascending = true } = {}) => { ops.order = { column: c, ascending }; return builder; },
    limit: (n) => { ops.limit = n; return builder; },
    range: (from, to) => { ops.range = { from, to }; return builder; },
    single: () => { ops.single = true; return builder; },
    maybeSingle: () => { ops.maybeSingle = true; return builder; },
    then: async (res, rej) => { try { return res(await builder.execute()); } catch (e) { return rej ? rej(e) : Promise.reject(e); } },
    execute: async () => {
      const tableRows = serverData[ops.table] || (serverData[ops.table] = []);
      if (ops.method === "select") {
        let rows = applyFilters(tableRows, ops.filters).map((r) => ({ ...r }));
        if (ops.order) rows.sort((a, b) => { const av = a[ops.order.column], bv = b[ops.order.column]; if (av === bv) return 0; if (av == null) return ops.order.ascending ? -1 : 1; if (bv == null) return ops.order.ascending ? 1 : -1; return ops.order.ascending ? String(av).localeCompare(String(bv), undefined, { numeric: true }) : String(bv).localeCompare(String(av), undefined, { numeric: true }); });
        if (ops.range) rows = rows.slice(ops.range.from, ops.range.to + 1);
        if (ops.limit != null) rows = rows.slice(0, ops.limit);
        const selected = pick(rows, ops.selectColumns);
        const data = ops.single ? selected[0] || null : ops.maybeSingle ? selected[0] || null : selected;
        return { data, error: ops.single && !selected[0] ? { message: "No rows" } : null };
      }
      if (ops.method === "delete") {
        const before = tableRows.length;
        const toDelete = applyFilters(tableRows, ops.filters);
        serverData[ops.table] = tableRows.filter((row) => !toDelete.includes(row));
        return { data: toDelete.map((r) => ({ ...r })), error: null, _affected: tableRows.length - before };
      }
      if (ops.method === "insert" || ops.method === "upsert") {
        const rows = Array.isArray(ops.payload) ? ops.payload : [ops.payload];
        const conflictCol = ops.options?.onConflict;
        const inserted = [];
        for (const row of rows) {
          if (conflictCol && row[conflictCol] !== undefined && row[conflictCol] !== null && row[conflictCol] !== "") {
            const conflictVal = String(row[conflictCol]);
            const idx = tableRows.findIndex((r) => String(r[conflictCol] || "") === conflictVal);
            if (idx >= 0) { tableRows[idx] = { ...tableRows[idx], ...row }; inserted.push(tableRows[idx]); continue; }
          }
          const next = { ...row };
          if (next.id === undefined || next.id === null) next.id = nextId++;
          tableRows.push(next);
          inserted.push(next);
        }
        return { data: inserted.map((r) => ({ ...r })), error: null };
      }
      if (ops.method === "update") {
        const targets = applyFilters(tableRows, ops.filters);
        for (const target of targets) Object.assign(target, ops.payload);
        return { data: targets.map((r) => ({ ...r })), error: null };
      }
      return { data: null, error: { message: `unsupported ${ops.method}` } };
    },
  };
  return builder;
}

const fakeSupabase = {
  from(table) {
    return {
      select: (cols) => builderSpec(table, "select", null).select(cols),
      insert: (p, o) => builderSpec(table, "insert", p, o),
      update: (p, o) => builderSpec(table, "update", p, o),
      upsert: (p, o) => builderSpec(table, "upsert", p, o),
      delete: (p, o) => builderSpec(table, "delete", p, o),
    };
  },
  auth: {},
  storage: {},
  rpc: () => Promise.resolve({ data: null, error: null }),
  channel: () => ({ on: () => ({}), subscribe: () => ({}), unsubscribe: () => Promise.resolve("ok") }),
  removeChannel: () => Promise.resolve("ok"),
};

mock.module("../src/lib/supabase", { namedExports: { supabase: fakeSupabase } });
mock.module("../src/lib/perf", {
  namedExports: { recordQueryTiming: () => {}, recordRouteChange: () => {} },
});

const db = await import("../src/lib/offline/db.js");
const offlineSupabase = (await import("../src/lib/offline/offlineSupabase.js")).default;
const sync = await import("../src/lib/offline/sync.js");

function installLocalStorageMock() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  delete globalThis.window;
  try {
    Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
  } catch {
    Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  }
}

function seedServerTransactions(rows) {
  serverData.transactions = rows.map((r) => ({ ...r }));
  for (const r of rows) {
    if (r.transaction_items) for (const it of r.transaction_items) serverData.transaction_items.push({ ...it });
  }
}

test("OFFLINE DELETE of existing synced transaction is not resurrected after reconnect", async () => {
  installLocalStorageMock();
  serverData.transactions = [];
  serverData.recycle_bin = [];
  serverData.transaction_items = [];

  seedServerTransactions([
    { id: 123, customer_id: 7, type: "gave", amount: 500, created_at: "2026-08-01T00:00:00Z", description: "existing txn" },
  ]);
  seedServerTransactions([
    { id: 7, customer_id: undefined },
  ].filter((r) => r.customer_id !== undefined));
  serverData.customers = [{ id: 7, name: "Customer 7" }];

  // Initial snapshot into the local cache (as a fresh app would do).
  await db.replaceFetchedData("transactions", [{ id: 123, customer_id: 7, type: "gave", amount: 500, created_at: "2026-08-01T00:00:00Z", description: "existing txn" }]);
  await db.replaceFetchedData("customers", [{ id: 7, name: "Customer 7" }]);
  await db.saveFetchedData("transaction_items", []);
  await db.replaceFetchedData("import_batch_recycle_bin", []);

  assert.deepEqual((await db.getAll("transactions")).map((r) => r.id), [123]);

  // GO OFFLINE.
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });

  const transactionToStore = {
    transaction: { id: 123, customer_id: 7, type: "gave", amount: 500 },
    transaction_items: [],
  };
  await db.moveToRecycleBin("transactions", "123", "Transaction #123", transactionToStore, "admin");
  await offlineSupabase.from("transactions").delete({ id: 123 }).eq("id", 123);

  // Immediately hidden locally, present in local recycle bin, ops persistent.
  assert.deepEqual((await db.getAll("transactions")).map((r) => r.id), [], "transaction hidden locally");
  assert.equal((await db.getRecycleBin()).length, 1, "in local recycle bin");
  const queue = await db.getPendingQueue();
  assert.deepEqual(queue.map((op) => `${op.table}:${op.method}`), ["recycle_bin:upsert", "transactions:delete"], "persistent delete op enqueued");

  // Simulate app reload while offline: localStorage persists.
  const queueAfterReload = db.readQueue ? db.readQueue() : (await db.getPendingQueue());
  assert.equal(queueAfterReload.length, 2, "delete op survives reload");

  // RECONNECT → run the real sync pipeline.
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  await sync.syncPendingData();

  // Server state.
  assert.deepEqual(serverData.transactions.map((r) => r.id), [], "server transaction deleted");
  assert.equal(serverData.recycle_bin.length, 1, "server has recycle bin record");

  // Local state after sync: still deleted, still in local recycle bin.
  assert.deepEqual((await db.getAll("transactions")).map((r) => r.id), [], "transaction stays deleted locally");
  assert.equal((await db.getRecycleBin()).length, 1, "recycle bin entry remains");

  // An ONLINE-FIRST read right after reconnect must NOT resurrect the delete
  // even though the server delete took a moment to commit.
  const { data: readAfterSync } = await offlineSupabase.from("transactions").select("*").eq("customer_id", 7);
  assert.deepEqual((readAfterSync || []).map((r) => r.id), [], "online-first read stays deleted");

  // Background snapshot refresh after the queue drained must not resurrect it.
  await sync.refreshOfflineSnapshot();
  assert.deepEqual((await db.getAll("transactions")).map((r) => r.id), [], "not resurrected by snapshot");
});

test("OFFLINE CREATE then OFFLINE DELETE before sync: only one transaction on server", async () => {
  installLocalStorageMock();
  serverData.transactions = [];
  serverData.recycle_bin = [];
  serverData.transaction_items = [];

  globalThis.navigator = { onLine: false };

  // Offline create.
  await offlineSupabase.from("transactions").insert([
    { id: -1, customer_id: 7, type: "got", amount: 200, created_at: "2026-08-02T00:00:00Z" },
  ]).select("*");
  // Offline delete of that same transaction.
  await offlineSupabase.from("transactions").delete({ id: -1 }).eq("id", -1);

  const localBefore = await db.getAll("transactions");
  assert.deepEqual(localBefore, [], "deleted locally");

  globalThis.navigator = { onLine: true };
  await sync.syncPendingData();

  const serverTxns = serverData.transactions;
  assert.equal(serverTxns.length, 0, "no orphan transaction created on the server");

  const localAfter = await db.getAll("transactions");
  assert.deepEqual(localAfter.map((r) => r.id), [], "still deleted locally");
});

test("HYPOTHESIS: online-first SELECT resurrects a pending offline delete when local cache is empty", async () => {
  installLocalStorageMock();
  serverData.transactions = [];
  serverData.recycle_bin = [];
  serverData.customers = [{ id: 7, name: "Customer 7" }];

  // Server still has transaction #123; the offline delete has NOT synced yet.
  seedServerTransactions([{ id: 123, customer_id: 7, type: "gave", amount: 500, created_at: "2026-08-01T00:00:00Z" }]);
  await db.replaceFetchedData("transactions", [{ id: 123, customer_id: 7, type: "gave", amount: 500, created_at: "2026-08-01T00:00:00Z" }]);
  await db.replaceFetchedData("customers", [{ id: 7, name: "Customer 7" }]);
  await db.saveFetchedData("transaction_items", []);
  await db.replaceFetchedData("import_batch_recycle_bin", []);

  // GO OFFLINE and delete the ONLY transaction of this customer.
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  await offlineSupabase.from("transactions").delete({ id: 123 }).eq("id", 123);
  assert.deepEqual((await db.getAll("transactions")).map((r) => r.id), [], "hidden locally");

  // RECONNECT. The pending delete is still in the queue (not yet synced).
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  assert.equal((await db.getPendingQueue()).filter((op) => op.table === "transactions" && op.method === "delete").length, 1);

  // NOW simulate the customer page opening right after reconnect: it performs an
  // ONLINE-FIRST SELECT of that customer's transactions.
  const { data } = await offlineSupabase.from("transactions").select("*").eq("customer_id", 7);

  const returnedIds = (Array.isArray(data) ? data : data ? [data] : []).map((r) => r.id);
  assert.deepEqual(returnedIds, [], "the pending offline delete must NOT be returned by an online-first read");
});
