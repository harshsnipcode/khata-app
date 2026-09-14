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

const hooks = { failureBudget: 0, onWriteAfter: null, requestLog: [] };

function comparable(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function compare(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const pa = comparable(a);
  const pb = comparable(b);
  if (typeof pa === "number" && typeof pb === "number") return pa - pb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function matchesFilter(row, filter) {
  const v = row?.[filter.column];
  switch (filter.operator) {
    case "eq": return String(v) === String(filter.value);
    case "neq": return String(v) !== String(filter.value);
    case "gt": return compare(v, filter.value) > 0;
    case "gte": return compare(v, filter.value) >= 0;
    case "lt": return compare(v, filter.value) < 0;
    case "lte": return compare(v, filter.value) <= 0;
    case "in": return (filter.value || []).map(String).includes(String(v));
    case "is": return v === filter.value;
    case "like":
    case "ilike": {
      const text = String(v || "");
      const pattern = String(filter.value || "").replaceAll("%", "");
      return filter.operator === "ilike"
        ? text.toLowerCase().includes(pattern.toLowerCase())
        : text.includes(pattern);
    }
    default: return v === filter.value;
  }
}

function parseOrClause(clause) {
  const firstDot = clause.indexOf(".");
  const secondDot = clause.indexOf(".", firstDot + 1);
  if (firstDot < 0 || secondDot < 0) return null;
  return {
    column: clause.slice(0, firstDot),
    operator: clause.slice(firstDot + 1, secondDot),
    value: clause.slice(secondDot + 1),
  };
}

function applyFilters(rows, filters) {
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

function applyOr(rows, clauses) {
  if (!clauses || clauses.length === 0) return rows;
  return rows.filter((row) => clauses.some((clause) => matchesFilter(row, clause)));
}

function pick(rows, cols) {
  if (!cols || cols === "*" || cols.includes("(")) return rows;
  const fields = cols.split(",").map((s) => s.trim()).filter(Boolean);
  return rows.map((row) => (
    Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]]))
  ));
}

function builderSpec(table, method, payload, options) {
  const ops = {
    table, method, payload, options,
    filters: [], orClauses: [], selectColumns: null, order: null, range: null,
    limit: null, single: false, maybeSingle: false, headCount: false,
  };
  const builder = {
    select: (cols, opts) => { ops.selectColumns = cols; if (opts?.count === "exact") ops.headCount = true; return builder; },
    eq: (c, v) => { ops.filters.push({ column: c, operator: "eq", value: v }); return builder; },
    neq: (c, v) => { ops.filters.push({ column: c, operator: "neq", value: v }); return builder; },
    gt: (c, v) => { ops.filters.push({ column: c, operator: "gt", value: v }); return builder; },
    gte: (c, v) => { ops.filters.push({ column: c, operator: "gte", value: v }); return builder; },
    lt: (c, v) => { ops.filters.push({ column: c, operator: "lt", value: v }); return builder; },
    lte: (c, v) => { ops.filters.push({ column: c, operator: "lte", value: v }); return builder; },
    in: (c, v) => { ops.filters.push({ column: c, operator: "in", value: v }); return builder; },
    is: (c, v) => { ops.filters.push({ column: c, operator: "is", value: v }); return builder; },
    like: (c, v) => { ops.filters.push({ column: c, operator: "like", value: v }); return builder; },
    ilike: (c, v) => { ops.filters.push({ column: c, operator: "ilike", value: v }); return builder; },
    or: (clauseStr) => { ops.orClauses.push(...String(clauseStr).split(",").map(parseOrClause).filter(Boolean)); return builder; },
    order: (c, { ascending = true } = {}) => { ops.order = { column: c, ascending }; return builder; },
    limit: (n) => { ops.limit = n; return builder; },
    range: (from, to) => { ops.range = { from, to }; return builder; },
    single: () => { ops.single = true; return builder; },
    maybeSingle: () => { ops.maybeSingle = true; return builder; },
    then: async (res, rej) => {
      try { return res(await builder.execute()); } catch (e) { return rej ? rej(e) : Promise.reject(e); }
    },
    execute: async () => {
      const tableRows = serverData[ops.table] || (serverData[ops.table] = []);
      const isWrite = ops.method === "insert" || ops.method === "upsert" || ops.method === "update" || ops.method === "delete";
      hooks.requestLog.push({ table: ops.table, method: ops.method });
      if (isWrite && hooks.failureBudget > 0) {
        hooks.failureBudget -= 1;
        return { data: null, error: { message: "simulated network failure", code: "E-SIM" } };
      }
      if (ops.method === "select") {
        let rows = applyFilters(tableRows, ops.filters);
        rows = applyOr(rows, ops.orClauses);
        if (ops.order) {
          rows.sort((a, b) => {
            const av = a[ops.order.column]; const bv = b[ops.order.column];
            if (av === bv) return 0;
            if (av == null) return ops.order.ascending ? -1 : 1;
            if (bv == null) return ops.order.ascending ? 1 : -1;
            return ops.order.ascending ? compare(av, bv) : compare(bv, av);
          });
        }
        if (ops.range) rows = rows.slice(ops.range.from, ops.range.to + 1);
        if (ops.limit != null) rows = rows.slice(0, ops.limit);
        if (ops.headCount) {
          return { data: pick(rows, ops.selectColumns || "id"), count: rows.length, error: null };
        }
        const selected = pick(rows, ops.selectColumns);
        const data = ops.single ? selected[0] || null : ops.maybeSingle ? selected[0] || null : selected;
        return { data, error: ops.single && !selected[0] ? { message: "No rows" } : null };
      }
      if (ops.method === "delete") {
        const toDelete = applyFilters(tableRows, ops.filters);
        serverData[ops.table] = tableRows.filter((row) => !toDelete.includes(row));
        if (hooks.onWriteAfter) hooks.onWriteAfter(ops);
        return { data: toDelete.map((r) => ({ ...r })), error: null };
      }
      if (ops.method === "insert" || ops.method === "upsert") {
        const rows = Array.isArray(ops.payload) ? ops.payload : [ops.payload];
        const conflictCol = ops.options?.onConflict;
        const inserted = [];
        for (const prow of rows) {
          if (conflictCol && prow[conflictCol] !== undefined && prow[conflictCol] !== null && prow[conflictCol] !== "") {
            const conflictVal = String(prow[conflictCol]);
            const idx = tableRows.findIndex((r) => String(r[conflictCol] || "") === conflictVal);
            if (idx >= 0) { tableRows[idx] = { ...tableRows[idx], ...prow }; inserted.push(tableRows[idx]); continue; }
          }
          const next = { ...prow };
          if (next.id === undefined || next.id === null) next.id = nextId++;
          tableRows.push(next);
          inserted.push(next);
        }
        if (hooks.onWriteAfter) hooks.onWriteAfter(ops);
        return { data: inserted.map((r) => ({ ...r })), error: null };
      }
      if (ops.method === "update") {
        const targets = applyFilters(tableRows, ops.filters);
        for (const target of targets) Object.assign(target, ops.payload);
        if (hooks.onWriteAfter) hooks.onWriteAfter(ops);
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
      select: (cols, opts) => builderSpec(table, "select", null).select(cols, opts),
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
const liveSync = await import("../src/lib/liveSync.js");

function setOnline(on) {
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator")?.value;
  if (nav && "onLine" in nav) {
    nav.onLine = on;
    return;
  }
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: on },
    configurable: true,
    writable: true,
  });
}

function installLocalStorageMock() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  delete globalThis.window;
  setOnline(true);
}

function setup() {
  for (const key of Object.keys(serverData)) serverData[key] = [];
  serverData.customers = [{ id: 7, name: "Customer 7" }];
  nextId = 1000;
  hooks.failureBudget = 0;
  hooks.onWriteAfter = null;
  hooks.requestLog = [];
  installLocalStorageMock();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeout = 6000, interval = 25) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(interval);
  }
  assert.ok(predicate(), `waitFor timed out after ${timeout}ms`);
}

function installFakeWindow() {
  const handlerMap = {};
  if (typeof globalThis.CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.detail = init.detail;
      }
    };
  }
  const fakeWindow = {
    addEventListener: (type, fn) => {
      (handlerMap[type] || (handlerMap[type] = [])).push(fn);
    },
    removeEventListener: (type, fn) => {
      if (handlerMap[type]) handlerMap[type] = handlerMap[type].filter((f) => f !== fn);
    },
    dispatchEvent: (event) => {
      for (const fn of handlerMap[event.type] || []) fn.call(fakeWindow, event);
      return true;
    },
    localStorage: globalThis.localStorage,
    location: { href: "http://localhost/" },
  };
  globalThis.window = fakeWindow;
}

const T0 = "2026-08-10T00:00:00.000Z";
function atMin(base, minutes) {
  return new Date(new Date(base).getTime() + minutes * 60_000).toISOString();
}

function offlineTxn(i, ts) {
  return {
    customer_id: 7,
    type: "gave",
    amount: i * 100,
    payment_mode: "cash",
    date: ts.slice(0, 10),
    description: `offline #${i}`,
    created_at: ts,
    activity_at: ts,
  };
}

function serverTxn(id, i, ts) {
  return { ...offlineTxn(i, ts), id };
}

async function deviceACreateOffline(row) {
  const { data } = await offlineSupabase.from("transactions").insert([row]).select("*");
  return Array.isArray(data) ? data[0] : data;
}

async function seedDeviceB(rows) {
  await db.replaceFetchedData("transactions", rows);
  await db.saveFetchedData("transaction_items", []);
}

test("A: clean offline-create flush reaches the server", async () => {
  setup();
  setOnline(false);
  for (let i = 1; i <= 5; i += 1) await deviceACreateOffline(offlineTxn(i, atMin(T0, i)));

  assert.equal(db.readQueue().length, 5, "five insert ops queued");
  assert.equal(serverData.transactions.length, 0, "server untouched while offline");

  setOnline(true);
  await sync.syncPendingData();

  assert.equal(serverData.transactions.length, 5, "all five transactions reached the server");
  assert.equal(db.readQueue().length, 0, "queue drained");

  const local = await db.getAll("transactions");
  assert.equal(local.length, 5, "local cache keeps the rows");
  assert.ok(local.every((row) => row.synced === true), "all rows confirmed synced");
  assert.ok(local.every((row) => typeof row.id === "number" && row.id > 0), "temp ids rewritten to server ids");
});

test("A2: a batch performs one snapshot refresh after its writes", async () => {
  setup();
  setOnline(false);
  for (let i = 1; i <= 5; i += 1) await deviceACreateOffline(offlineTxn(i, atMin(T0, i)));

  hooks.requestLog = [];
  setOnline(true);
  await sync.syncPendingData();

  const writes = hooks.requestLog.filter((request) => request.method === "insert" || request.method === "upsert");
  const reads = hooks.requestLog.filter((request) => request.method === "select");
  assert.equal(writes.length, 5, "each queued transaction is written once");
  assert.equal(reads.length, 13, "the drained batch performs one 13-table snapshot refresh");
  assert.equal(hooks.requestLog.length, 18, "snapshot reads do not multiply with queue length");
});

test("B1: mid-flush disconnect stops safely; reconnect auto-resumes the queue", async () => {
  setup();
  setOnline(false);
  installFakeWindow();
  sync.startAutoSync();
  for (let i = 1; i <= 5; i += 1) await deviceACreateOffline(offlineTxn(i, atMin(T0, i)));

  assert.equal(db.readQueue().length, 5, "five insert ops queued");
  assert.equal(serverData.transactions.length, 0, "server untouched while offline");

  setOnline(true);
  let writes = 0;
  hooks.onWriteAfter = () => {
    writes += 1;
    if (writes === 2) setOnline(false);
  };
  window.dispatchEvent(new Event("online"));
  await waitFor(() => serverData.transactions.length === 2 && db.readQueue().length === 3);

  assert.equal(serverData.transactions.length, 2, "only the flushed ops reached the server");
  assert.equal(db.readQueue().length, 3, "the rest stay queued");

  await delay(1200);
  assert.equal(serverData.transactions.length, 2, "no self-heal while offline");
  assert.equal(db.readQueue().length, 3, "queue untouched without connectivity");

  hooks.onWriteAfter = null;
  setOnline(true);
  window.dispatchEvent(new Event("online"));
  await waitFor(() => db.readQueue().length === 0 && serverData.transactions.length === 5);

  assert.equal(serverData.transactions.length, 5, "reconnect auto-drains the remaining queue");
  assert.equal(db.readQueue().length, 0, "queue empty");
  assert.equal(new Set(serverData.transactions.map((r) => r.id)).size, 5, "no duplicate remote rows");
});

test("B2: failed writes stay queued; automatic retry drains them without duplicates", async () => {
  setup();
  setOnline(false);
  for (let i = 1; i <= 5; i += 1) await deviceACreateOffline(offlineTxn(i, atMin(T0, i)));

  setOnline(true);
  hooks.failureBudget = 5;
  await sync.syncPendingData();

  assert.equal(serverData.transactions.length, 0, "nothing reached the server on the failed pass");
  assert.equal(db.readQueue().length, 5, "every failed op retained in the queue");

  await waitFor(() => db.readQueue().length === 0);
  assert.equal(serverData.transactions.length, 5, "automatic retry drained all five without a manual trigger");

  const serverIds = serverData.transactions.map((r) => r.id);
  assert.equal(new Set(serverIds).size, 5, "no duplicate remote rows");
  const opIds = serverData.transactions.map((r) => r.sync_operation_id).filter(Boolean);
  assert.equal(new Set(opIds).size, 5, "sync_operation_id idempotency keys intact");

  await sync.syncPendingData();
  assert.equal(serverData.transactions.length, 5, "re-sync with an empty queue is a no-op");
  assert.equal(db.readQueue().length, 0);
});

test("two simultaneous sync triggers never execute the queue twice", async () => {
  setup();
  setOnline(false);
  for (let i = 1; i <= 5; i += 1) await deviceACreateOffline(offlineTxn(i, atMin(T0, i)));

  setOnline(true);
  let writes = 0;
  hooks.onWriteAfter = () => { writes += 1; };

  await Promise.all([sync.syncPendingData(), sync.syncPendingData()]);

  assert.equal(writes, 5, "each queued operation executed exactly once, never concurrently");
  assert.equal(serverData.transactions.length, 5, "exactly five rows on the server");
  assert.equal(db.readQueue().length, 0, "queue drained");
  assert.equal(new Set(serverData.transactions.map((r) => r.id)).size, 5, "no duplicate remote rows");
});

test("C1: Device B delta fetch discovers transactions above its watermark", async () => {
  setup();
  const oldRow = serverTxn(77, 0, atMin(T0, -30));
  serverData.transactions = [1, 2, 3, 4, 5].map((i) => serverTxn(5000 + i, i, atMin(T0, i)));

  await seedDeviceB([oldRow]);
  const view = await db.getAll("transactions");
  const wm = liveSync.maxTimestamp(view);
  assert.equal(wm, atMin(T0, -30), "watermark seeded from the cache max");

  const { rows, hitCap } = await liveSync.fetchTransactionsSince(wm);
  assert.equal(hitCap, false, "delta below the page cap");
  assert.deepEqual(
    rows.map((r) => r.id).sort((a, b) => a - b),
    [5001, 5002, 5003, 5004, 5005],
    "all five above-watermark rows discovered",
  );

  await db.saveFetchedData("transactions", rows, { protectUnsynced: true });
  const merged = liveSync.mergeRows(view, rows);
  assert.deepEqual(
    merged.map((r) => r.id).sort((a, b) => a - b),
    [77, 5001, 5002, 5003, 5004, 5005],
    "B view now holds the remote transactions",
  );
  assert.deepEqual(
    (await db.getAll("transactions")).map((r) => r.id).sort((a, b) => a - b),
    [77, 5001, 5002, 5003, 5004, 5005],
    "B cache now holds the remote transactions",
  );
});

test("C2: sync snapshot delta with the persisted watermark discovers transactions", async () => {
  setup();
  const oldRow = serverTxn(77, 0, atMin(T0, -30));
  serverData.transactions = [1, 2, 3, 4, 5].map((i) => serverTxn(5000 + i, i, atMin(T0, i)));

  await seedDeviceB([oldRow]);
  await db.setSyncWatermark("transactions", atMin(T0, -30));
  await sync.refreshOfflineSnapshot();

  const all = await db.getAll("transactions");
  assert.deepEqual(
    all.map((r) => r.id).sort((a, b) => a - b),
    [77, 5001, 5002, 5003, 5004, 5005],
    "incremental snapshot merged the new rows into the warm cache",
  );
  assert.equal(db.getSyncWatermark("transactions"), atMin(T0, 5), "watermark advanced to the newest row");
});

test("C3: rows at or below the watermark are excluded (strict > boundary clamp)", async () => {
  setup();
  const wm = atMin(T0, 10);
  const below = serverTxn(2001, 1, atMin(T0, 9));
  const atWm = serverTxn(2002, 2, wm);
  const above = serverTxn(2003, 3, atMin(T0, 11));
  serverData.transactions = [below, atWm, above];

  const { rows } = await liveSync.fetchTransactionsSince(wm);
  assert.deepEqual(rows.map((r) => r.id), [2003], "strict > excludes the boundary row");

  await db.replaceFetchedData("transactions", [atWm]);
  await db.setSyncWatermark("transactions", wm);
  await sync.refreshOfflineSnapshot();
  const all = await db.getAll("transactions");
  assert.deepEqual(
    all.map((r) => r.id).sort((a, b) => a - b),
    [2002, 2003],
    "snapshot delta pulls only rows strictly above; already-cached boundary row survives",
  );

  const digest = { serverCount: 3, serverMax: atMin(T0, 11) };
  assert.equal(liveSync.snapshotIsComplete(serverData.transactions, digest), true, "count+max exact match is complete");
  assert.equal(liveSync.snapshotIsComplete([below, atWm], digest), false, "missing the newest row is not complete");
  assert.equal(liveSync.snapshotIsComplete([below, atWm, above, { ...above, id: 2004 }], digest), false, "wrong id count is not complete");

  assert.equal(
    liveSync.isCacheCurrent({ cacheCount: 3, cacheMax: atMin(T0, 11) }, digest),
    true,
    "cache covering the exact server set with the newest row is current",
  );
  assert.equal(
    liveSync.isCacheCurrent({ cacheCount: 2, cacheMax: atMin(T0, 9) }, digest),
    false,
    "a deficit is not current (full reconcile would trigger)",
  );
});

test("C4: remote delete leaves a cache surplus that must force full reconcile when no local ops are pending", async () => {
  setup();
  const kept = serverTxn(10318, 1, atMin(T0, 1));
  const deleted = serverTxn(10319, 2, atMin(T0, 2));

  serverData.transactions = [kept];
  await seedDeviceB([kept, deleted]);

  const cached = await db.getAll("transactions");
  const cacheDigest = {
    cacheCount: cached.length,
    cacheMax: liveSync.maxTimestamp(cached),
  };
  const serverDigest = {
    serverCount: serverData.transactions.length,
    serverMax: liveSync.maxTimestamp(serverData.transactions),
  };

  assert.equal(db.readQueue().some((op) => op.table === "transactions"), false, "Device B has no pending local transaction writes");
  assert.equal(
    liveSync.isCacheCurrent(cacheDigest, serverDigest),
    false,
    "a synced cache surplus means a remote delete was missed and must trigger full reconcile",
  );
});

test("D: realtime INSERT/UPDATE/DELETE changes reach Device B view and cache", async () => {
  setup();
  const oldRow = serverTxn(77, 0, atMin(T0, -10));
  await seedDeviceB([oldRow]);
  let view = await db.getAll("transactions");

  const inserted = serverTxn(5001, 1, atMin(T0, 20));
  await db.saveFetchedData("transactions", [inserted], { protectUnsynced: true });
  view = liveSync.mergeRows(view, [inserted]);
  assert.deepEqual(view.map((r) => r.id).sort((a, b) => a - b), [77, 5001], "realtime INSERT appears in view");
  assert.equal((await db.getAll("transactions")).find((r) => r.id === 5001).synced, true, "realtime INSERT persisted as synced");

  const updated = { ...inserted, amount: 1234 };
  await db.saveFetchedData("transactions", [updated], { protectUnsynced: true });
  view = liveSync.mergeRows(view, [updated]);
  assert.equal(view.find((r) => r.id === 5001).amount, 1234, "realtime UPDATE applies to view");

  await db.removeLocalRows("transactions", (r) => String(r.id) === "5001");
  view = view.filter((r) => String(r.id) !== "5001");
  assert.ok(!view.some((r) => r.id === 5001), "realtime DELETE removes from view");
  assert.deepEqual((await db.getAll("transactions")).map((r) => r.id).sort(), [77], "realtime DELETE removes from cache");

  setOnline(false);
  const pending = await deviceACreateOffline(offlineTxn(9, atMin(T0, 25)));
  setOnline(true);
  const incoming = {
    id: pending.id,
    customer_id: 7,
    type: "gave",
    amount: 9999,
    date: atMin(T0, 25).slice(0, 10),
    created_at: atMin(T0, 25),
    activity_at: atMin(T0, 25),
  };
  view = liveSync.mergeRows(view, [pending]);
  await db.saveFetchedData("transactions", [incoming], { protectUnsynced: true });
  view = liveSync.mergeRows(view, [incoming]);

  const viewRow = view.find((r) => String(r.id) === String(pending.id));
  assert.equal(viewRow.amount, pending.amount, "merge keeps an unsynced local edit");
  assert.equal(viewRow.synced, false, "merge keeps the pending flag");
  const cacheRow = (await db.getAll("transactions")).find((r) => String(r.id) === String(pending.id));
  assert.equal(cacheRow.amount, pending.amount, "cache write keeps an unsynced local edit");
  assert.equal(cacheRow.synced, false, "cache write keeps the pending flag");
});

test("E1: offline cache writes publish changed table events", async () => {
  setup();
  installFakeWindow();
  const events = [];
  window.addEventListener("offline-cache-updated", (event) => {
    events.push(event.detail?.tables || []);
  });

  await db.saveFetchedData("transactions", [serverTxn(7001, 1, atMin(T0, 30))], { protectUnsynced: true });

  assert.deepEqual(events.at(-1), ["transactions"], "transaction cache writes notify mounted views");
});

test("E2: Device B cached select repaints from background refresh without another reload", async () => {
  setup();
  installFakeWindow();
  const cachedRow = serverTxn(77, 0, atMin(T0, -10));
  const incomingRows = [1, 2, 3, 4, 5].map((i) => serverTxn(8000 + i, i, atMin(T0, i)));
  serverData.transactions = [cachedRow, ...incomingRows];
  await seedDeviceB([cachedRow]);

  let mountedView = await db.getAll("transactions");
  window.addEventListener("offline-cache-updated", async (event) => {
    if (event.detail?.tables?.includes("transactions")) {
      mountedView = await db.getAll("transactions");
    }
  });

  const firstRead = await offlineSupabase.from("transactions").select("*").eq("customer_id", 7);
  assert.deepEqual(
    (firstRead.data || []).map((row) => row.id),
    [77],
    "first paint stays fast from cache while server refresh is in flight",
  );

  await waitFor(() => mountedView.length === 6);
  assert.deepEqual(
    mountedView.map((row) => row.id).sort((a, b) => a - b),
    [77, 8001, 8002, 8003, 8004, 8005],
    "mounted Device B view sees refreshed cache without a second reload",
  );
});
