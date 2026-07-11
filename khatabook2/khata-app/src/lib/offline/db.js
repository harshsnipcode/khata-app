const STORAGE_PREFIX = "khata_offline_v2";
const CACHE_KEY = `${STORAGE_PREFIX}:cache`;
const QUEUE_KEY = `${STORAGE_PREFIX}:queue`;
const META_KEY = `${STORAGE_PREFIX}:meta`;
const RECYCLE_KEY = `${STORAGE_PREFIX}:recycle_bin`;

export const OFFLINE_TABLES = [
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

const FOREIGN_KEYS = ["customer_id", "transaction_id", "product_id", "employee_id"];

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
  return readJson(META_KEY, { nextTempId: -1, idMap: {} });
}

function writeMeta(meta) {
  writeJson(META_KEY, meta);
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
  const cache = readJson(CACHE_KEY, {});
  for (const table of OFFLINE_TABLES) {
    if (!Array.isArray(cache[table])) cache[table] = [];
  }
  return cache;
}

function dedupeRows(rows = []) {
  const byStableKey = new Map();
  const withoutStableKey = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const stableKey = row.id ?? row.local_uuid;
    if (stableKey === undefined || stableKey === null || stableKey === "") {
      withoutStableKey.push(row);
      continue;
    }
    const key = String(stableKey);
    byStableKey.set(key, { ...(byStableKey.get(key) || {}), ...row });
  }
  return [...byStableKey.values(), ...withoutStableKey];
}

function writeCache(cache) {
  writeJson(CACHE_KEY, cache);
}

export async function initDB() {
  if (typeof indexedDB !== "undefined" && !localStorage.getItem(`${STORAGE_PREFIX}:legacy_cleaned`)) {
    indexedDB.deleteDatabase("myBusinessOfflineDB");
    localStorage.setItem(`${STORAGE_PREFIX}:legacy_cleaned`, "true");
  }
  getCache();
  readQueue();
  readRecycleBinRaw();
}

export async function saveFetchedData(table, rows) {
  if (!OFFLINE_TABLES.includes(table) || !Array.isArray(rows)) return;
  const cache = getCache();
  const existing = new Map(dedupeRows(cache[table] || []).map((row) => [String(row.id ?? row.local_uuid), row]));
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const stableKey = row.id ?? row.local_uuid;
    if (stableKey === undefined || stableKey === null || stableKey === "") continue;
    const key = String(stableKey);
    const previous = existing.get(key) || {};
    existing.set(key, {
      ...previous,
      ...row,
      local_uuid: previous.local_uuid || row.local_uuid || generateUUID(),
      synced: true,
      deleted_locally: false,
    });
  }
  cache[table] = Array.from(existing.values());
  writeCache(cache);
}

export async function getAll(table) {
  return dedupeRows(getCache()[table] || []).filter((row) => !row.deleted_locally);
}

function rowKey(row) {
  return String(row.id ?? row.local_uuid);
}

export function upsertLocalRows(table, rows) {
  const cache = getCache();
  const byKey = new Map(dedupeRows(cache[table] || []).map((row) => [rowKey(row), row]));
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const prepared = {
      ...row,
      local_uuid: row.local_uuid || generateUUID(),
      __local_updated_at: new Date().toISOString(),
    };
    byKey.set(rowKey(prepared), { ...(byKey.get(rowKey(prepared)) || {}), ...prepared });
  }
  cache[table] = Array.from(byKey.values());
  writeCache(cache);
}

export function deleteLocalRows(table, predicate) {
  const cache = getCache();
  cache[table] = (cache[table] || []).map((row) => (
    predicate(row) ? { ...row, deleted_locally: true, __local_updated_at: new Date().toISOString() } : row
  ));
  writeCache(cache);
}

export function removeLocalRows(table, predicate) {
  const cache = getCache();
  cache[table] = (cache[table] || []).filter((row) => !predicate(row));
  writeCache(cache);
}

export function readQueue() {
  return readJson(QUEUE_KEY, []);
}

function writeQueue(queue) {
  writeJson(QUEUE_KEY, queue);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sync-status", {
      detail: { status: queue.length > 0 ? "pending" : "synced" },
    }));
  }
}

export function enqueueOperation(operation) {
  const queue = readQueue();
  const now = new Date().toISOString();
  const entry = {
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    ...operation,
  };
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

export async function getPendingQueue() {
  return readQueue();
}

export async function removeQueueItem(id) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export function rewriteLocalId(table, localId, serverRecord) {
  if (!serverRecord?.id || localId === undefined || localId === null || localId === serverRecord.id) return;
  rememberServerId(table, localId, serverRecord.id);
  const cache = getCache();

  cache[table] = (cache[table] || []).map((row) => (
    String(row.id) === String(localId)
      ? { ...row, ...serverRecord, local_uuid: row.local_uuid || serverRecord.local_uuid, synced: true }
      : row
  ));

  for (const dependentTable of OFFLINE_TABLES) {
    cache[dependentTable] = (cache[dependentTable] || []).map((row) => {
      const next = { ...row };
      if (table === "customers" && String(next.customer_id) === String(localId)) next.customer_id = serverRecord.id;
      if (table === "transactions" && String(next.transaction_id) === String(localId)) next.transaction_id = serverRecord.id;
      if (table === "products" && String(next.product_id) === String(localId)) next.product_id = serverRecord.id;
      if (table === "employees" && String(next.employee_id) === String(localId)) next.employee_id = serverRecord.id;
      return next;
    });
  }

  const rewrittenQueue = readQueue().map((item) => ({
    ...item,
    payload: rewriteForeignKeys(item.payload),
    filters: rewriteFilters(item.filters || [], item.table),
  }));

  writeCache(cache);
  writeQueue(rewrittenQueue);
}

export function rewriteForeignKeys(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.map(rewriteForeignKeys);
  const next = { ...payload };
  for (const key of FOREIGN_KEYS) {
    if (next[key] === undefined || next[key] === null) continue;
    const table = key.replace("_id", "s");
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
    if (!table) return filter;
    return { ...filter, value: resolveServerId(table, filter.value) };
  });
}

function readRecycleBinRaw() {
  return readJson(RECYCLE_KEY, []);
}

function writeRecycleBinRaw(items) {
  writeJson(RECYCLE_KEY, items);
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
  writeRecycleBinRaw([item, ...readRecycleBinRaw()]);
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

export async function restoreFromRecycleBin(local_uuid) {
  try {
    const rawItems = readRecycleBinRaw();
    const item = rawItems.find((entry) => entry.local_uuid === local_uuid);
    if (!item) return { success: false, error: "Item not found" };

    const originalData = typeof item.original_data === "string"
      ? JSON.parse(item.original_data || "{}")
      : item.original_data;
    const entityType = item.entity_type;
    let data = originalData;

    if (entityType === "transactions" && originalData?.transaction) {
      data = originalData.transaction;
      upsertLocalRows("transactions", [data]);
      if (Array.isArray(originalData.transaction_items)) {
        upsertLocalRows("transaction_items", originalData.transaction_items);
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

    writeRecycleBinRaw(rawItems.filter((entry) => entry.local_uuid !== local_uuid));
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
  writeRecycleBinRaw(readRecycleBinRaw().filter((entry) => entry.local_uuid !== local_uuid));
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
          const items = readRecycleBinRaw().filter((item) => item.local_uuid !== row.local_uuid);
          writeRecycleBinRaw([row, ...items]);
          return row.local_uuid;
        }
        upsertLocalRows(tableName, [row]);
        return row.id ?? row.local_uuid;
      },
      async delete(id) {
        if (tableName === "recycle_bin") {
          writeRecycleBinRaw(readRecycleBinRaw().filter((item) => item.local_uuid !== id && item.id !== id));
          return;
        }
        removeLocalRows(tableName, (row) => row.local_uuid === id || row.id === id);
      },
      async bulkDelete(ids) {
        const idSet = new Set(ids.map(String));
        if (tableName === "recycle_bin") {
          writeRecycleBinRaw(readRecycleBinRaw().filter((item) => !idSet.has(String(item.local_uuid)) && !idSet.has(String(item.id))));
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
                  writeRecycleBinRaw(readRecycleBinRaw().filter((row) => row[column] !== value));
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
