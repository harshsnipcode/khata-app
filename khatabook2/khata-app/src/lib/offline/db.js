const STORAGE_PREFIX = "khata_offline_v2";
const CACHE_KEY = `${STORAGE_PREFIX}:cache`;
const QUEUE_KEY = `${STORAGE_PREFIX}:queue`;
const META_KEY = `${STORAGE_PREFIX}:meta`;
const RECYCLE_KEY = `${STORAGE_PREFIX}:recycle_bin`;
const RECYCLE_INDEX_KEY = `${RECYCLE_KEY}:index`;
const LEGACY_CLEANED_KEY = `${STORAGE_PREFIX}:legacy_cleaned`;
const IDB_NAME = STORAGE_PREFIX;
const IDB_VERSION = 1;
const ROW_STORE = "rows";
const QUEUE_STORE = "queue";
const META_STORE = "meta";
const RECYCLE_STORE = "recycle_bin";
const MIGRATION_META_KEY = "localStorageMigrationV1";

export const OFFLINE_TABLES = [
  "customers",
  "product_groups",
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
  "recycle_bin",
];

export const SERVER_SNAPSHOT_REPLACE_TABLES = new Set([
  "customers",
  "product_groups",
  "products",
  "customer_product_prices",
  "product_transactions",
  "transactions",
  "transaction_items",
  "employees",
  "employee_attendance",
  "salary_payments",
  "import_history",
  "import_batch_recycle_bin",
  "recycle_bin",
]);

const FOREIGN_KEYS = ["customer_id", "transaction_id", "product_id", "employee_id", "group_id"];
const INDEXED_ROW_COLUMNS = [
  "id",
  "customer_id",
  "transaction_id",
  "product_id",
  "employee_id",
  "group_id",
  "date",
  "created_at",
  "activity_at",
  "uploaded_at",
  "deleted_at",
  "deleted_locally",
];

let memoryCache = null;
let memoryQueue = null;
let memoryMeta = null;
let memoryRecycleBin = null;
let idbPromise = null;
let idbReady = false;
let persistChain = Promise.resolve();
let localStorageRef = null;

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function emptyCache() {
  return Object.fromEntries(OFFLINE_TABLES.map((table) => [table, []]));
}

function readJson(key, fallback) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function removeLegacyKey(key) {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // Best effort cleanup; IndexedDB already has the migrated data.
  }
}

function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

function createIndex(store, name, keyPath, options) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function openIndexedDB() {
  if (!hasIndexedDB()) return Promise.resolve(null);
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      let rowStore;
      if (!database.objectStoreNames.contains(ROW_STORE)) {
        rowStore = database.createObjectStore(ROW_STORE, { keyPath: ["table", "key"] });
      } else {
        rowStore = request.transaction.objectStore(ROW_STORE);
      }
      createIndex(rowStore, "table", "table", { unique: false });
      for (const column of INDEXED_ROW_COLUMNS) {
        createIndex(rowStore, column, ["table", column], { unique: false });
      }

      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = database.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        createIndex(queueStore, "created_at", "created_at", { unique: false });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(RECYCLE_STORE)) {
        const recycleStore = database.createObjectStore(RECYCLE_STORE, { keyPath: "local_uuid" });
        createIndex(recycleStore, "deleted_at", "deleted_at", { unique: false });
        createIndex(recycleStore, "entity_type", "entity_type", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    console.warn("[OfflineDB] IndexedDB unavailable; using localStorage fallback", error?.message || error);
    return null;
  });
  return idbPromise;
}

function rowRecord(table, row) {
  const key = normalizedRowKey(table, row);
  if (!key) return null;
  const record = { table, key, row: clone(row) };
  for (const column of INDEXED_ROW_COLUMNS) {
    if (row?.[column] !== undefined) record[column] = row[column];
  }
  return record;
}

async function readIndexedDBSnapshot(database) {
  const cache = emptyCache();
  const tx = database.transaction([ROW_STORE, QUEUE_STORE, META_STORE, RECYCLE_STORE], "readonly");
  const [rowRecords, queueRecords, metaRecords, recycleRecords] = await Promise.all([
    requestToPromise(tx.objectStore(ROW_STORE).getAll()),
    requestToPromise(tx.objectStore(QUEUE_STORE).getAll()),
    requestToPromise(tx.objectStore(META_STORE).getAll()),
    requestToPromise(tx.objectStore(RECYCLE_STORE).getAll()),
  ]);
  await transactionDone(tx);

  for (const record of rowRecords || []) {
    if (OFFLINE_TABLES.includes(record.table) && record.table !== "recycle_bin") {
      cache[record.table].push(record.row);
    }
  }
  const meta = Object.fromEntries((metaRecords || []).map((record) => [record.key, record.value]));
  return {
    cache,
    queue: (queueRecords || []).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
    meta: meta[META_KEY] || { nextTempId: -1, idMap: {} },
    recycleBin: recycleRecords || [],
    migrated: meta[MIGRATION_META_KEY] === true,
  };
}

async function persistTableToIndexedDB(table, rows) {
  const database = await openIndexedDB();
  if (!database) return;
  const tx = database.transaction(ROW_STORE, "readwrite");
  const store = tx.objectStore(ROW_STORE);
  const index = store.index("table");
  const range = IDBKeyRange.only(table);
  index.openCursor(range).onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
      return;
    }
    for (const row of dedupeRows(table, rows)) {
      const record = rowRecord(table, row);
      if (record) store.put(record);
    }
  };
  await transactionDone(tx);
}

async function persistQueueToIndexedDB(queue) {
  const database = await openIndexedDB();
  if (!database) return;
  const tx = database.transaction(QUEUE_STORE, "readwrite");
  const store = tx.objectStore(QUEUE_STORE);
  store.clear();
  for (const item of queue || []) store.put(clone(item));
  await transactionDone(tx);
}

async function persistTablesAndQueueToIndexedDB(tables, queue) {
  const database = await openIndexedDB();
  if (!database) return;
  const tx = database.transaction([ROW_STORE, QUEUE_STORE], "readwrite");
  const rowStore = tx.objectStore(ROW_STORE);
  const queueStore = tx.objectStore(QUEUE_STORE);

  queueStore.clear();
  for (const item of queue || []) queueStore.put(clone(item));

  for (const table of tables.filter((item) => item && item !== "recycle_bin")) {
    const index = rowStore.index("table");
    const range = IDBKeyRange.only(table);
    index.openCursor(range).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
        return;
      }
      for (const row of dedupeRows(table, memoryCache?.[table] || [])) {
        const record = rowRecord(table, row);
        if (record) rowStore.put(record);
      }
    };
  }
  await transactionDone(tx);
}

async function persistMetaToIndexedDB(meta) {
  const database = await openIndexedDB();
  if (!database) return;
  const tx = database.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({ key: META_KEY, value: clone(meta) });
  await transactionDone(tx);
}

async function persistRecycleBinToIndexedDB(items) {
  const database = await openIndexedDB();
  if (!database) return;
  const tx = database.transaction(RECYCLE_STORE, "readwrite");
  const store = tx.objectStore(RECYCLE_STORE);
  store.clear();
  for (const item of items || []) {
    if (item?.local_uuid) store.put(clone(item));
  }
  await transactionDone(tx);
}

function queuePersistence(task) {
  if (!idbReady || !hasIndexedDB()) return;
  persistChain = persistChain.then(task, task).catch((error) => {
    console.warn("[OfflineDB] IndexedDB persistence failed", error?.message || error);
  });
}

export function flushOfflinePersistence() {
  return persistChain;
}

function hydrateMemoryFromLegacyStorage() {
  localStorageRef = typeof localStorage === "undefined" ? null : localStorage;
  memoryCache = readJson(CACHE_KEY, {});
  for (const table of OFFLINE_TABLES) {
    if (!Array.isArray(memoryCache[table])) memoryCache[table] = [];
  }
  memoryQueue = readJson(QUEUE_KEY, []);
  memoryMeta = readJson(META_KEY, { nextTempId: -1, idMap: {} });
  memoryRecycleBin = readRecycleBinLegacy();
}

function ensureMemoryHydrated() {
  const currentStorage = typeof localStorage === "undefined" ? null : localStorage;
  if (!memoryCache || !memoryQueue || !memoryMeta || !memoryRecycleBin) {
    hydrateMemoryFromLegacyStorage();
    return;
  }
  if (!idbReady && currentStorage !== localStorageRef) {
    hydrateMemoryFromLegacyStorage();
  }
}

function readRecycleBinLegacy() {
  const index = readJson(RECYCLE_INDEX_KEY, null);
  if (Array.isArray(index)) {
    const items = index
      .map((id) => readJson(`${RECYCLE_KEY}:item:${id}`, null))
      .filter(Boolean);
    const legacy = readJson(RECYCLE_KEY, []);
    if (legacy.length) {
      const seen = new Set(items.map((entry) => String(entry.local_uuid)));
      for (const entry of legacy) {
        if (entry && !seen.has(String(entry.local_uuid))) items.push(entry);
      }
    }
    return items;
  }
  return readJson(RECYCLE_KEY, []);
}

async function migrateLegacyLocalStorage(database) {
  const legacyCache = readJson(CACHE_KEY, null);
  const legacyQueue = readJson(QUEUE_KEY, null);
  const legacyMeta = readJson(META_KEY, null);
  const legacyRecycle = readRecycleBinLegacy();
  const hasLegacyData = !!legacyCache || !!legacyQueue || !!legacyMeta || legacyRecycle.length > 0;
  if (!database || !hasLegacyData) return false;

  const cache = legacyCache && typeof legacyCache === "object" ? legacyCache : emptyCache();
  for (const table of OFFLINE_TABLES) {
    if (!Array.isArray(cache[table])) cache[table] = [];
  }
  const queue = Array.isArray(legacyQueue) ? legacyQueue : [];
  const meta = legacyMeta && typeof legacyMeta === "object" ? legacyMeta : { nextTempId: -1, idMap: {} };
  const tx = database.transaction([ROW_STORE, QUEUE_STORE, META_STORE, RECYCLE_STORE], "readwrite");
  const rowStore = tx.objectStore(ROW_STORE);
  const queueStore = tx.objectStore(QUEUE_STORE);
  const metaStore = tx.objectStore(META_STORE);
  const recycleStore = tx.objectStore(RECYCLE_STORE);

  rowStore.clear();
  queueStore.clear();
  recycleStore.clear();
  for (const table of OFFLINE_TABLES) {
    if (table === "recycle_bin") continue;
    for (const row of dedupeRows(table, cache[table] || [])) {
      const record = rowRecord(table, row);
      if (record) rowStore.put(record);
    }
  }
  for (const item of queue) queueStore.put(clone(item));
  metaStore.put({ key: META_KEY, value: clone(meta) });
  for (const item of legacyRecycle) {
    if (item?.local_uuid) recycleStore.put(clone(item));
  }
  metaStore.put({ key: MIGRATION_META_KEY, value: true });
  await transactionDone(tx);

  removeLegacyKey(CACHE_KEY);
  removeLegacyKey(QUEUE_KEY);
  removeLegacyKey(META_KEY);
  removeLegacyKey(RECYCLE_INDEX_KEY);
  removeLegacyKey(RECYCLE_KEY);
  for (const item of legacyRecycle) removeLegacyKey(`${RECYCLE_KEY}:item:${item?.local_uuid}`);
  try {
    localStorage.setItem(LEGACY_CLEANED_KEY, "true");
  } catch {
    // The old giant cache may have filled localStorage; cleanup above is enough.
  }
  return true;
}

async function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage) return;
  try {
    const estimate = typeof navigator.storage.estimate === "function"
      ? await navigator.storage.estimate()
      : null;
    const persisted = typeof navigator.storage.persisted === "function"
      ? await navigator.storage.persisted()
      : false;
    const granted = persisted || (
      typeof navigator.storage.persist === "function"
        ? await navigator.storage.persist()
        : false
    );
    console.info("[OfflineDB] Storage", {
      persisted: granted,
      usage: estimate?.usage ?? null,
      quota: estimate?.quota ?? null,
    });
  } catch (error) {
    console.warn("[OfflineDB] Persistent storage request skipped", error?.message || error);
  }
}

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function readMeta() {
  ensureMemoryHydrated();
  return clone(memoryMeta || { nextTempId: -1, idMap: {} });
}

function writeMeta(meta) {
  memoryMeta = clone(meta || { nextTempId: -1, idMap: {} });
  if (idbReady) {
    queuePersistence(() => persistMetaToIndexedDB(memoryMeta));
  } else {
    writeJson(META_KEY, memoryMeta);
  }
}

export function getSyncWatermark(table) {
  const meta = readMeta();
  return meta.syncWatermarks?.[table] || null;
}

export function setSyncWatermark(table, timestamp) {
  if (!timestamp) return;
  const meta = readMeta();
  meta.syncWatermarks ||= {};
  if (
    !meta.syncWatermarks[table] ||
    new Date(timestamp).getTime() > new Date(meta.syncWatermarks[table]).getTime()
  ) {
    meta.syncWatermarks[table] = timestamp;
    writeMeta(meta);
  }
}

export function createTempId() {
  const meta = readMeta();
  const id = meta.nextTempId || -1;
  meta.nextTempId = id - 1;
  writeMeta(meta);
  return id;
}

export function rememberServerId(table, localId, serverId) {
  if (localId === undefined || localId === null || serverId === undefined || serverId === null) return;
  const meta = readMeta();
  meta.idMap ||= {};
  meta.idMap[`${table}:${localId}`] = serverId;
  writeMeta(meta);
}

export function resolveServerId(table, id) {
  if (id === undefined || id === null) return id;
  const meta = readMeta();
  return meta.idMap?.[`${table}:${id}`] ?? id;
}

export function getCache() {
  ensureMemoryHydrated();
  const cache = clone(memoryCache || emptyCache());
  for (const table of OFFLINE_TABLES) {
    if (!Array.isArray(cache[table])) cache[table] = [];
  }
  return cache;
}

function normalizedRowKey(table, row) {
  if (!row || typeof row !== "object") return null;
  const rawId = row.id;
  if (rawId !== undefined && rawId !== null && rawId !== "") {
    return `id:${String(resolveServerId(table, rawId))}`;
  }
  return row.local_uuid ? `local:${String(row.local_uuid)}` : null;
}

function dedupeRows(table, rows = []) {
  const byStableKey = new Map();
  const withoutStableKey = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const key = normalizedRowKey(table, row);
    if (!key) {
      withoutStableKey.push({ ...row });
      continue;
    }
    byStableKey.set(key, { ...(byStableKey.get(key) || {}), ...row });
  }
  return [...byStableKey.values(), ...withoutStableKey];
}

function dispatchCacheUpdated(tables) {
  if (typeof window === "undefined") return;
  const changedTables = Array.isArray(tables) ? tables.filter(Boolean) : [tables].filter(Boolean);
  if (changedTables.length === 0) return;
  window.dispatchEvent(new CustomEvent("offline-cache-updated", {
    detail: { tables: changedTables },
  }));
}

function writeCache(cache, tables) {
  memoryCache = clone({ ...emptyCache(), ...(cache || {}) });
  if (idbReady) {
    const changedTables = Array.isArray(tables) ? tables : [tables];
    queuePersistence(async () => {
      for (const table of changedTables.filter(Boolean)) {
        if (table !== "recycle_bin") await persistTableToIndexedDB(table, memoryCache[table] || []);
      }
    });
  } else {
    writeJson(CACHE_KEY, memoryCache);
  }
  dispatchCacheUpdated(tables);
}

export async function initDB() {
  hydrateMemoryFromLegacyStorage();
  const database = await openIndexedDB();
  if (database) {
    await migrateLegacyLocalStorage(database);
    const snapshot = await readIndexedDBSnapshot(database);
    memoryCache = snapshot.cache;
    memoryQueue = snapshot.queue;
    memoryMeta = snapshot.meta;
    memoryRecycleBin = snapshot.recycleBin;
    idbReady = true;

    if (typeof indexedDB !== "undefined" && typeof localStorage !== "undefined" && !localStorage.getItem(LEGACY_CLEANED_KEY)) {
      indexedDB.deleteDatabase("myBusinessOfflineDB");
      try {
        localStorage.setItem(LEGACY_CLEANED_KEY, "true");
      } catch {}
    }
    requestPersistentStorage();
  }
  getCache();
  readQueue();
  readRecycleBinRaw();
}

export async function saveFetchedData(table, rows, { protectUnsynced = false } = {}) {
  if (!OFFLINE_TABLES.includes(table) || !Array.isArray(rows)) return;
  if (table === "recycle_bin") {
    writeRecycleBinRaw(reconcileRecycleBinFromServer(rows, { protectUnsynced }));
    return;
  }
  const currentCache = getCache();
  const byKey = new Map(
    dedupeRows(table, currentCache[table] || []).map((row) => [normalizedRowKey(table, row), { ...row }]),
  );
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const key = normalizedRowKey(table, row);
    if (!key) continue;
    const previous = byKey.get(key) || {};
    // Never let a background server fetch clobber a local edit that has not
    // been confirmed as persisted to the server yet. The pending queue
    // operation is the source of truth until it succeeds.
    if (protectUnsynced && previous.synced === false) continue;
    byKey.set(key, {
      ...previous,
      ...row,
      local_uuid: previous.local_uuid || row.local_uuid || generateUUID(),
      synced: true,
      deleted_locally: false,
    });
  }
  writeCache({ ...currentCache, [table]: Array.from(byKey.values()) }, table);
}

export async function replaceFetchedData(table, rows, { protectUnsynced = false } = {}) {
  if (!OFFLINE_TABLES.includes(table) || !Array.isArray(rows)) return;
  if (table === "recycle_bin") {
    writeRecycleBinRaw(reconcileRecycleBinFromServer(rows, { protectUnsynced }));
    return;
  }
  const currentCache = getCache();
  const previousRows = dedupeRows(table, currentCache[table] || []);
  const previousByKey = new Map(previousRows.map((row) => [normalizedRowKey(table, row), row]));
  const serverRows = rows
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const previous = previousByKey.get(normalizedRowKey(table, row)) || {};
      // If a matching local row still has unsynced changes, keep the local
      // version verbatim so the pending edit survives the snapshot replace.
      if (protectUnsynced && previous.synced === false) {
        return { ...previous };
      }
      return {
        ...row,
        local_uuid: previous.local_uuid || row.local_uuid || generateUUID(),
        synced: true,
        deleted_locally: false,
      };
    });
  const serverKeys = new Set(serverRows.map((row) => normalizedRowKey(table, row)).filter(Boolean));
  // Preserve local rows that have not synced yet and are not present in the
  // server payload (e.g. offline inserts that have not uploaded).
  const unsyncedLocalRows = previousRows.filter((row) => (
    row?.synced !== true && !serverKeys.has(normalizedRowKey(table, row))
  ));
  writeCache({ ...currentCache, [table]: dedupeRows(table, [...serverRows, ...unsyncedLocalRows]) }, table);
  if (table === "import_batch_recycle_bin" && rows.length === 0) {
    // Legacy cleanup: older builds stored excel imports inside the local
    // recycle bin. Only drop those entries, never wipe locally-deleted
    // transactions, customers, products, or salary payments.
    writeRecycleBinRaw(readRecycleBinRaw().filter((entry) => entry.entity_type !== "excel_import"));
  }
}

export async function getAll(table) {
  if (table === "recycle_bin") return getRecycleBin();
  return dedupeRows(table, getCache()[table] || []).filter((row) => !row.deleted_locally);
}

export function upsertLocalRows(table, rows) {
  const currentCache = getCache();
  currentCache[table] = mergeLocalRows(table, currentCache[table] || [], rows);
  writeCache({ ...currentCache }, table);
}

function mergeLocalRows(table, existingRows, rows) {
  const byKey = new Map(
    dedupeRows(table, existingRows || []).map((row) => [normalizedRowKey(table, row), { ...row }]),
  );
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const prepared = {
      ...row,
      local_uuid: row.local_uuid || generateUUID(),
      deleted_locally: row.deleted_locally ?? false,
      __local_updated_at: new Date().toISOString(),
    };
    const key = normalizedRowKey(table, prepared);
    if (!key) continue;
    byKey.set(key, { ...(byKey.get(key) || {}), ...prepared });
  }
  return Array.from(byKey.values());
}

export function deleteLocalRows(table, predicate, { markUnsynced = false } = {}) {
  const cache = getCache();
  cache[table] = (cache[table] || []).map((row) => (
    predicate(row)
      ? {
          ...row,
          deleted_locally: true,
          // An offline delete is a pending mutation: flag it so background
          // server fetches cannot resurrect the row before the delete syncs.
          ...(markUnsynced ? { synced: false } : {}),
          __local_updated_at: new Date().toISOString(),
        }
      : row
  ));
  writeCache(cache, table);
}

export function removeLocalRows(table, predicate) {
  const cache = getCache();
  cache[table] = (cache[table] || []).filter((row) => !predicate(row));
  writeCache(cache, table);
}

export function readQueue() {
  ensureMemoryHydrated();
  return clone(memoryQueue || []);
}

function writeQueue(queue) {
  memoryQueue = clone(queue || []);
  if (idbReady) {
    queuePersistence(() => persistQueueToIndexedDB(memoryQueue));
  } else {
    writeJson(QUEUE_KEY, memoryQueue);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sync-status", {
      detail: { status: queue.length > 0 ? "pending" : "synced" },
    }));
  }
}

function appendOperationToQueue(queue, operation) {
  const payloadRow = Array.isArray(operation.payload) ? operation.payload[0] : operation.payload;
  const temporaryId = typeof payloadRow?.id === "number" && payloadRow.id < 0;

  if (temporaryId && (operation.method === "upsert" || operation.method === "update")) {
    const pendingInsertIndex = queue.findIndex((item) => {
      const queuedRow = Array.isArray(item.payload) ? item.payload[0] : item.payload;
      return item.table === operation.table
        && item.method === "insert"
        && String(queuedRow?.id) === String(payloadRow.id);
    });
    if (pendingInsertIndex >= 0) {
      const pendingInsert = queue[pendingInsertIndex];
      const queuedRow = Array.isArray(pendingInsert.payload) ? pendingInsert.payload[0] : pendingInsert.payload;
      const mergedRow = { ...queuedRow, ...payloadRow };
      queue[pendingInsertIndex] = {
        ...pendingInsert,
        payload: Array.isArray(pendingInsert.payload) ? [mergedRow] : mergedRow,
        updated_at: new Date().toISOString(),
      };
      return { queue, entry: queue[pendingInsertIndex] };
    }
  }

  const now = new Date().toISOString();
  const entry = {
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    ...operation,
  };
  return { queue: [...queue, entry], entry };
}

export function enqueueOperation(operation) {
  const { queue, entry } = appendOperationToQueue(readQueue(), operation);
  writeQueue(queue);
  return entry;
}

export function upsertLocalRowsAndEnqueueOperation(table, rows, operation) {
  const cache = getCache();
  const { queue, entry } = appendOperationToQueue(readQueue(), operation);
  cache[table] = mergeLocalRows(table, cache[table] || [], rows);
  memoryCache = clone({ ...emptyCache(), ...cache });
  memoryQueue = clone(queue);
  if (idbReady) {
    queuePersistence(() => persistTablesAndQueueToIndexedDB([table], memoryQueue));
  } else {
    writeJson(CACHE_KEY, memoryCache);
    writeJson(QUEUE_KEY, memoryQueue);
  }
  dispatchCacheUpdated(table);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sync-status", {
      detail: { status: memoryQueue.length > 0 ? "pending" : "synced" },
    }));
  }
  return entry;
}

export function deleteLocalRowsAndEnqueueOperation(table, predicate, operation, { markUnsynced = false } = {}) {
  const cache = getCache();
  const { queue, entry } = appendOperationToQueue(readQueue(), operation);
  cache[table] = (cache[table] || []).map((row) => (
    predicate(row)
      ? {
          ...row,
          deleted_locally: true,
          ...(markUnsynced ? { synced: false } : {}),
          __local_updated_at: new Date().toISOString(),
        }
      : row
  ));
  memoryCache = clone({ ...emptyCache(), ...cache });
  memoryQueue = clone(queue);
  if (idbReady) {
    queuePersistence(() => persistTablesAndQueueToIndexedDB([table], memoryQueue));
  } else {
    writeJson(CACHE_KEY, memoryCache);
    writeJson(QUEUE_KEY, memoryQueue);
  }
  dispatchCacheUpdated(table);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sync-status", {
      detail: { status: memoryQueue.length > 0 ? "pending" : "synced" },
    }));
  }
  return entry;
}

export async function getPendingQueue() {
  return readQueue();
}

export async function removeQueueItem(id) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export async function purgeUnsupportedQueueOps() {
  const queue = readQueue();
  const unsupported = queue.filter((op) => !OFFLINE_TABLES.includes(op.table));
  if (unsupported.length === 0) return [];
  writeQueue(queue.filter((op) => OFFLINE_TABLES.includes(op.table)));
  return unsupported;
}

export async function ensureQueueInsertIdempotencyKeys() {
  const queue = readQueue();
  let changed = false;
  const nextQueue = queue.map((item) => {
    if (
      item.method !== "insert" ||
      (item.table !== "transactions" && item.table !== "transaction_items")
    ) {
      return item;
    }

    let itemChanged = false;
    const payloadRows = Array.isArray(item.payload) ? item.payload : [item.payload];
    const nextRows = payloadRows.map((row) => {
      if (!row || typeof row !== "object" || row.sync_operation_id) return row;
      changed = true;
      itemChanged = true;
      return { ...row, sync_operation_id: generateUUID() };
    });

    return {
      ...item,
      payload: Array.isArray(item.payload) ? nextRows : nextRows[0],
      updated_at: itemChanged ? new Date().toISOString() : item.updated_at,
    };
  });

  if (changed) writeQueue(nextQueue);
  return nextQueue;
}

export function cancelQueuedDeletes(table, entityId) {
  const targetId = String(entityId);
  writeQueue(readQueue().filter((item) => {
    if (item.table !== table || item.method !== "delete") return true;
    return !(item.filters || []).some((filter) => (
      filter.column === "id" && String(filter.value) === targetId
    ));
  }));
}

export function rewriteLocalId(table, localId, serverRecord) {
  if (!serverRecord?.id || localId === undefined || localId === null || String(localId) === String(serverRecord.id)) return;
  rememberServerId(table, localId, serverRecord.id);
  const currentCache = getCache();
  const nextCache = { ...currentCache };
  const localRow = (currentCache[table] || []).find((row) => String(row.id) === String(localId));
  const serverRow = (currentCache[table] || []).find((row) => String(row.id) === String(serverRecord.id));
  const mergedRecord = {
    ...(localRow || {}),
    ...(serverRow || {}),
    ...serverRecord,
    local_uuid: localRow?.local_uuid || serverRow?.local_uuid || serverRecord.local_uuid,
    synced: true,
    deleted_locally: false,
  };
  const withoutAliases = (currentCache[table] || []).filter((row) => (
    String(row.id) !== String(localId) && String(row.id) !== String(serverRecord.id)
  ));
  nextCache[table] = dedupeRows(table, [...withoutAliases, mergedRecord]);

  for (const dependentTable of OFFLINE_TABLES) {
    nextCache[dependentTable] = dedupeRows(dependentTable, (nextCache[dependentTable] || []).map((row) => {
      const next = { ...row };
      if (table === "customers" && String(next.customer_id) === String(localId)) next.customer_id = serverRecord.id;
      if (table === "transactions" && String(next.transaction_id) === String(localId)) next.transaction_id = serverRecord.id;
      if (table === "products" && String(next.product_id) === String(localId)) next.product_id = serverRecord.id;
      if (table === "employees" && String(next.employee_id) === String(localId)) next.employee_id = serverRecord.id;
      return next;
    }));
  }

  const rewrittenQueue = readQueue().map((item) => ({
    ...item,
    payload: rewriteForeignKeys(item.payload),
    filters: rewriteFilters(item.filters || [], item.table),
  }));

  writeCache(nextCache, OFFLINE_TABLES);
  writeQueue(rewrittenQueue);
}

export function rewriteForeignKeys(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.map(rewriteForeignKeys);
  const next = { ...payload };
  for (const key of FOREIGN_KEYS) {
    if (next[key] === undefined || next[key] === null) continue;
    const table = key === "group_id" ? "product_groups" : key.replace("_id", "s");
    next[key] = resolveServerId(table, next[key]);
  }
  return next;
}

export function rewriteFilters(filters = [], ownTable = null) {
  return filters.map((filter) => {
    if (!filter?.column?.endsWith("_id") && filter?.column !== "id") return filter;
    let table = null;
    if (filter.column === "id") table = ownTable;
    if (filter.column === "customer_id") table = "customers";
    if (filter.column === "transaction_id") table = "transactions";
    if (filter.column === "product_id") table = "products";
    if (filter.column === "employee_id") table = "employees";
    if (filter.column === "group_id") table = "product_groups";
    if (!table) return filter;
    return { ...filter, value: resolveServerId(table, filter.value) };
  });
}

function readRecycleBinRaw() {
  ensureMemoryHydrated();
  return clone(memoryRecycleBin || []);
}

function writeRecycleBinRaw(items) {
  memoryRecycleBin = (items || []).filter((item) => item?.local_uuid).map(clone);
  if (idbReady) {
    queuePersistence(() => persistRecycleBinToIndexedDB(memoryRecycleBin));
    return;
  }
  const index = [];
  for (const item of memoryRecycleBin) {
    const id = String(item?.local_uuid);
    if (!id || id === "undefined" || id === "null") continue;
    index.push(id);
    writeJson(`${RECYCLE_KEY}:item:${id}`, item);
  }
  writeJson(RECYCLE_INDEX_KEY, index);
  writeJson(RECYCLE_KEY, []);
}

function appendRecycleBinItem(item) {
  const id = String(item?.local_uuid);
  if (!id || id === "undefined" || id === "null") return;
  const current = readRecycleBinRaw().filter((entry) => String(entry.local_uuid) !== id);
  writeRecycleBinRaw([item, ...current]);
}

function putRecycleBinItem(item) {
  const id = String(item?.local_uuid);
  if (!id || id === "undefined" || id === "null") return;
  const current = readRecycleBinRaw().filter((entry) => String(entry.local_uuid) !== id);
  writeRecycleBinRaw([item, ...current]);
}

function removeRecycleBinItem(id) {
  const key = String(id);
  if (key === "undefined" || key === "null") return;
  writeRecycleBinRaw(readRecycleBinRaw().filter((entry) => String(entry.local_uuid) !== key));
  removeLegacyKey(`${RECYCLE_KEY}:item:${key}`);
}

// Reconciles the local recycle-bin mirror with the authoritative server rows.
// Server rows win (Supabase is the source of truth). When protectUnsynced is
// set, locally-deleted entries that still have a pending queue operation are
// preserved so an offline deletion is not clobbered before it syncs.
function reconcileRecycleBinFromServer(rows = [], { protectUnsynced = false } = {}) {
  const localItems = readRecycleBinRaw();
  const pendingOps = readQueue().filter((op) => op.table === "recycle_bin");
  const serverByKey = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const key = String(row.id ?? row.local_uuid ?? "");
    if (!key) continue;
    serverByKey.set(key, row);
  }

  const nextItems = [];
  const seen = new Set();

  for (const [key, row] of serverByKey) {
    if (seen.has(key)) continue;
    seen.add(key);
    nextItems.push({
      local_uuid: row.local_uuid || row.id,
      entity_type: row.entity_type,
      entity_id: String(row.entity_id ?? ""),
      entity_name: row.entity_name,
      deleted_at: row.deleted_at,
      deleted_by: row.deleted_by,
      original_data: typeof row.original_data === "string"
        ? row.original_data
        : JSON.stringify(row.original_data || {}),
      restore_deadline: row.restore_deadline,
    });
  }

  if (protectUnsynced) {
    for (const entry of localItems) {
      const key = String(entry.local_uuid || entry.id || "");
      if (!key || seen.has(key)) continue;
      const pending = pendingOps.some((op) => {
        if (op.method === "upsert") {
          const payloadRow = Array.isArray(op.payload) ? op.payload[0] : op.payload;
          return String(payloadRow?.id ?? "") === key;
        }
        if (op.method === "delete") {
          return (op.filters || []).some((filter) => filter.column === "id" && String(filter.value) === key);
        }
        return false;
      });
      if (pending) {
        seen.add(key);
        nextItems.push(entry);
      }
    }
  }

  return nextItems;
}

function scheduleSyncIfOnline() {
  if (typeof window === "undefined") return;
  if (!isOnline()) return;
  setTimeout(() => {
    window.dispatchEvent(new Event("khata-sync-request"));
  }, 0);
}

export function clearRecycleBinCache() {
  const ids = readRecycleBinRaw().map((entry) => entry?.local_uuid).filter(Boolean);
  writeRecycleBinRaw([]);
  removeLegacyKey(RECYCLE_INDEX_KEY);
  removeLegacyKey(RECYCLE_KEY);
  for (const id of ids) removeLegacyKey(`${RECYCLE_KEY}:item:${id}`);
}

export async function moveToRecycleBin(entityType, entityId, entityName, originalData, deletedBy) {
  const now = new Date();
  const item = {
    local_uuid: generateUUID(),
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    deleted_at: now.toISOString(),
    deleted_by: deletedBy || "system",
    original_data: JSON.stringify(originalData || {}),
    restore_deadline: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  };
  // Append the single entry without re-serializing the whole recycle-bin
  // history: each delete only writes its own original_data blob plus a tiny
  // id index, so delete stays fast as the recycle bin grows.
  appendRecycleBinItem(item);

  // Persist globally through the offline queue. The upsert uses the local_uuid
  // as the primary key (id) so retries are idempotent and never create
  // duplicates. When online it syncs; when offline it waits and retries.
  enqueueOperation({
    table: "recycle_bin",
    method: "upsert",
    payload: {
      id: item.local_uuid,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      entity_name: item.entity_name,
      deleted_at: item.deleted_at,
      deleted_by: item.deleted_by,
      original_data: originalData || {},
      restore_deadline: item.restore_deadline,
    },
    options: { onConflict: "id" },
    filters: [],
    selectColumns: "*",
  });
  scheduleSyncIfOnline();
  return item;
}

export async function getRecycleBin() {
  return readRecycleBinRaw()
    .map((item) => ({
      ...item,
      original_data: typeof item.original_data === "string"
        ? JSON.parse(item.original_data || "{}")
        : item.original_data,
    }))
    .sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
}

export async function restoreFromRecycleBin(local_uuid, suppliedItem = null) {
  try {
    const rawItems = readRecycleBinRaw();
    const item = suppliedItem || rawItems.find(
      (entry) =>
        entry.local_uuid === local_uuid ||
        (entry.id !== undefined && entry.id !== null && String(entry.id) === String(local_uuid)) ||
        (entry.entity_id !== undefined && entry.entity_id !== null && String(entry.entity_id) === String(local_uuid))
    );
    if (!item) return { success: false, error: "Item not found" };

    const originalData = typeof item.original_data === "string"
      ? JSON.parse(item.original_data || "{}")
      : item.original_data || {};
    const entityType = item.entity_type;
    let data = originalData;

    if (entityType === "transactions" && originalData?.transaction) {
      data = { ...originalData.transaction, deleted_locally: false };
      cancelQueuedDeletes("transactions", data.id);
      upsertLocalRows("transactions", [data]);
      if (Array.isArray(originalData.transaction_items)) {
        upsertLocalRows("transaction_items", originalData.transaction_items.map((row) => ({
          ...row,
          deleted_locally: false,
        })));
      }
    } else if (entityType === "customers" && Array.isArray(originalData?._transactions)) {
      const { _transactions, ...customer } = originalData;
      data = customer;
      upsertLocalRows("customers", [customer]);
      for (const txnWrapper of _transactions) {
        if (txnWrapper.transaction) upsertLocalRows("transactions", [txnWrapper.transaction]);
        if (Array.isArray(txnWrapper.transaction_items)) {
          upsertLocalRows("transaction_items", txnWrapper.transaction_items);
        }
      }
    } else {
      upsertLocalRows(entityType, [originalData]);
    }

    const removedKey = item.local_uuid || local_uuid;
    removeRecycleBinItem(removedKey);

    // Queue the global removal so the restored record disappears from every
    // device once the delete operation syncs to Supabase.
    enqueueOperation({
      table: "recycle_bin",
      method: "delete",
      payload: null,
      filters: [{ column: "id", operator: "eq", value: removedKey }],
      options: {},
      selectColumns: "*",
    });
    scheduleSyncIfOnline();
    return {
      success: true,
      entityType,
      data,
      transaction_items: originalData?.transaction_items || [],
    };
  } catch (error) {
    return { success: false, error: error.message || "Restore failed" };
  }
}

export async function permanentlyDeleteFromRecycleBin(local_uuid) {
  removeRecycleBinItem(local_uuid);

  // Queue the global removal so the record disappears from every device once
  // the delete operation syncs to Supabase.
  enqueueOperation({
    table: "recycle_bin",
    method: "delete",
    payload: null,
    filters: [{ column: "id", operator: "eq", value: local_uuid }],
    options: {},
    selectColumns: "*",
  });
  scheduleSyncIfOnline();
  return { success: true };
}

export async function cleanupRecycleBin() {
  const now = Date.now();
  writeRecycleBinRaw(readRecycleBinRaw().filter((entry) => new Date(entry.restore_deadline).getTime() >= now));
}

export async function markRecordSynced(table, localId, serverRecord) {
  rewriteLocalId(table, localId, serverRecord);
}

export const db = {
  async open() {},
  table(tableName) {
    return {
      async get(id) {
        if (tableName === "recycle_bin") {
          return readRecycleBinRaw().find((item) => item.local_uuid === id || item.id === id) || null;
        }
        return (getCache()[tableName] || []).find((item) => item.local_uuid === id || item.id === id) || null;
      },
      async toArray() {
        return tableName === "recycle_bin" ? readRecycleBinRaw() : (getCache()[tableName] || []);
      },
      async put(row) {
        if (tableName === "recycle_bin") {
          putRecycleBinItem(row);
          return row.local_uuid;
        }
        upsertLocalRows(tableName, [row]);
        return row.id ?? row.local_uuid;
      },
      async delete(id) {
        if (tableName === "recycle_bin") {
          removeRecycleBinItem(id);
          return;
        }
        removeLocalRows(tableName, (row) => row.local_uuid === id || row.id === id);
      },
      async bulkDelete(ids) {
        const idSet = new Set(ids.map(String));
        if (tableName === "recycle_bin") {
          readRecycleBinRaw()
            .filter((item) => idSet.has(String(item.local_uuid)) || idSet.has(String(item.id)))
            .forEach((item) => removeRecycleBinItem(item.local_uuid));
          return;
        }
        removeLocalRows(tableName, (row) => idSet.has(String(row.local_uuid)) || idSet.has(String(row.id)));
      },
      where(column) {
        return {
          equals(value) {
            return {
              async first() {
                const rows = tableName === "recycle_bin" ? readRecycleBinRaw() : (getCache()[tableName] || []);
                return rows.find((row) => row[column] === value) || null;
              },
              async toArray() {
                const rows = tableName === "recycle_bin" ? readRecycleBinRaw() : (getCache()[tableName] || []);
                return rows.filter((row) => row[column] === value);
              },
              async delete() {
                if (tableName === "recycle_bin") {
                  readRecycleBinRaw()
                    .filter((row) => row[column] === value)
                    .forEach((item) => removeRecycleBinItem(item.local_uuid));
                  return;
                }
                removeLocalRows(tableName, (row) => row[column] === value);
              },
            };
          },
          below(value) {
            return {
              async toArray() {
                const rows = tableName === "recycle_bin" ? readRecycleBinRaw() : (getCache()[tableName] || []);
                return rows.filter((row) => row[column] < value);
              },
            };
          },
        };
      },
    };
  },
};

export default db;
