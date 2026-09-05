const STORAGE_PREFIX = "khata_offline_v2";
const CACHE_KEY = `${STORAGE_PREFIX}:cache`;
const QUEUE_KEY = `${STORAGE_PREFIX}:queue`;
const META_KEY = `${STORAGE_PREFIX}:meta`;
const RECYCLE_KEY = `${STORAGE_PREFIX}:recycle_bin`;
const RECYCLE_INDEX_KEY = `${RECYCLE_KEY}:index`;

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
  writeCache({ ...currentCache, [table]: Array.from(byKey.values()) });
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
  writeCache({ ...currentCache, [table]: dedupeRows(table, [...serverRows, ...unsyncedLocalRows]) });
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
  const byKey = new Map(
    dedupeRows(table, currentCache[table] || []).map((row) => [normalizedRowKey(table, row), { ...row }]),
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
  writeCache({ ...currentCache, [table]: Array.from(byKey.values()) });
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
      writeQueue(queue);
      return queue[pendingInsertIndex];
    }
  }

  const now = new Date().toISOString();
  const entry = {
    id: generateUUID(),
    created_at: now,
    updated_at: now,
    ...operation,
  };
  writeQueue([...queue, entry]);
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

  writeCache(nextCache);
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
  // New per-item storage: a cheap index of local_uuids plus one key per entry,
  // so appending/deleting a single recycle-bin entry does not re-serialize the
  // whole history (which embeds large original_data blobs) on every delete.
  const index = readJson(RECYCLE_INDEX_KEY, null);
  if (Array.isArray(index)) {
    const items = index
      .map((id) => readJson(`${RECYCLE_KEY}:item:${id}`, null))
      .filter(Boolean);
    // Migrate any leftover entries that were written by older builds under the
    // single-array key until the next full rewrite clears them.
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

function writeRecycleBinRaw(items) {
  // Full rewrite: used only by reconcile/cleanup-style operations that process
  // the entire set in the background, not by the per-delete hot path.
  const index = [];
  for (const item of items) {
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
  writeJson(`${RECYCLE_KEY}:item:${id}`, item);
  const index = readJson(RECYCLE_INDEX_KEY, []);
  if (!Array.isArray(index)) {
    // Migrate the legacy single-array entries into the new per-item shape.
    const legacy = readJson(RECYCLE_KEY, []);
    const migrated = legacy
      .filter((entry) => entry && String(entry.local_uuid) !== id)
      .map((entry) => {
        writeJson(`${RECYCLE_KEY}:item:${String(entry.local_uuid)}`, entry);
        return String(entry.local_uuid);
      });
    writeJson(RECYCLE_KEY, []);
    writeJson(RECYCLE_INDEX_KEY, [id, ...migrated]);
    return;
  }
  if (!index.includes(id)) {
    writeJson(RECYCLE_INDEX_KEY, [id, ...index]);
  }
}

function putRecycleBinItem(item) {
  const id = String(item?.local_uuid);
  if (!id || id === "undefined" || id === "null") return;
  writeJson(`${RECYCLE_KEY}:item:${id}`, item);
  const index = readJson(RECYCLE_INDEX_KEY, null);
  if (Array.isArray(index)) {
    if (!index.includes(id)) writeJson(RECYCLE_INDEX_KEY, [id, ...index]);
    return;
  }
  const legacy = readJson(RECYCLE_KEY, []);
  writeJson(RECYCLE_INDEX_KEY, [id, ...legacy.filter((entry) => entry && String(entry.local_uuid) !== id).map((entry) => String(entry.local_uuid))]);
  writeJson(RECYCLE_KEY, []);
}

function removeRecycleBinItem(id) {
  const key = String(id);
  if (key === "undefined" || key === "null") return;
  const index = readJson(RECYCLE_INDEX_KEY, null);
  if (Array.isArray(index)) {
    writeJson(RECYCLE_INDEX_KEY, index.filter((entry) => entry !== key));
  }
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(`${RECYCLE_KEY}:item:${key}`);
  }
  // Keep the legacy array in sync for older readers/tests that still read it.
  const legacy = readJson(RECYCLE_KEY, []);
  if (legacy.length) {
    writeJson(RECYCLE_KEY, legacy.filter((entry) => entry && String(entry.local_uuid) !== key));
  }
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
  if (typeof localStorage !== "undefined") {
    const index = readJson(RECYCLE_INDEX_KEY, []);
    for (const id of Array.isArray(index) ? index : []) {
      localStorage.removeItem(`${RECYCLE_KEY}:item:${id}`);
    }
    localStorage.removeItem(RECYCLE_INDEX_KEY);
    localStorage.removeItem(RECYCLE_KEY);
  } else {
    writeRecycleBinRaw([]);
  }
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
