import { supabase } from "../supabase";
import {
  OFFLINE_TABLES,
  SERVER_SNAPSHOT_REPLACE_TABLES,
  ensureQueueInsertIdempotencyKeys,
  getPendingQueue,
  getSyncWatermark,
  isOnline,
  purgeUnsupportedQueueOps,
  removeQueueItem,
  removeLocalRows,
  replaceFetchedData,
  rewriteFilters,
  rewriteForeignKeys,
  rewriteLocalId,
  saveFetchedData,
  setSyncWatermark,
} from "./db";
import { sanitizeTablePayload } from "./tableSchemas";

let syncing = false;
let refreshingSnapshot = false;

// Per-table timestamp watermark used by the incremental snapshot. A snapshot
// pulled for a warm cache requests only rows newer than the last confirmed
// checkpoint instead of re-downloading the whole table, so a drained sync queue
// no longer re-pulls the entire database after a single change.
//
// Tables NOT listed here keep the previous full snapshot behaviour.
const SYNC_TIME_COLUMNS = Object.freeze({
  customers: ["created_at", "updated_at"],
  product_groups: ["created_at", "updated_at"],
  products: ["created_at", "updated_at"],
  transactions: ["activity_at"],
  transaction_items: ["created_at"],
  customer_product_prices: ["created_at", "updated_at"],
  product_transactions: ["created_at"],
  salary_payments: ["created_at"],
  import_history: ["uploaded_at", "deleted_at", "restored_at"],
  import_batch_recycle_bin: ["deleted_at"],
});

// If an incremental pull ever exceeds this many rows it is treated as an
// anomaly and falls back to a full re-pull, keeping the watermark exact.
const INCREMENTAL_CAP = 10000;

function emitStatus(status, detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("sync-status", { detail: { status, ...detail } }));
}

function isTemporaryId(id) {
  return typeof id === "number" && id < 0;
}

function filterMatches(row, filter) {
  const value = row?.[filter.column];
  if (filter.operator === "eq") return String(value) === String(filter.value);
  if (filter.operator === "neq") return String(value) !== String(filter.value);
  if (filter.operator === "in") return Array.isArray(filter.value) && filter.value.map(String).includes(String(value));
  return true;
}

function getInsertConflictColumn(table, payload) {
  if (table !== "transactions" && table !== "transaction_items") return null;
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.length > 0 && rows.every((row) => row?.sync_operation_id)
    ? "sync_operation_id"
    : null;
}

function getOriginalRowForServerRow(originalRows, serverRow, index) {
  if (serverRow?.sync_operation_id) {
    return originalRows.find((row) => row?.sync_operation_id === serverRow.sync_operation_id) || originalRows[index];
  }
  return originalRows[index];
}

export function preparePayload(table, payload) {
  const rewritten = rewriteForeignKeys(payload);
  if (Array.isArray(rewritten)) return rewritten.map((row) => preparePayload(table, row));
  const schemaSafe = sanitizeTablePayload(table, rewritten);
  if (isTemporaryId(schemaSafe?.id)) {
    const withoutTempId = { ...schemaSafe };
    delete withoutTempId.id;
    return withoutTempId;
  }
  return schemaSafe;
}

async function executeOperation(operation) {
  const filters = rewriteFilters(operation.filters || [], operation.table);
  let query;

  if (operation.method === "insert") {
    const originalRows = Array.isArray(operation.payload) ? operation.payload : [operation.payload];
    const payload = preparePayload(operation.table, operation.payload);
    const conflictColumn = getInsertConflictColumn(operation.table, payload);
    query = conflictColumn
      ? supabase.from(operation.table).upsert(payload, { onConflict: conflictColumn }).select(operation.selectColumns || "*")
      : supabase.from(operation.table).insert(payload).select(operation.selectColumns || "*");
    const { data, error } = await query;
    if (error) throw error;
    const serverRows = Array.isArray(data) ? data : (data ? [data] : []);
    serverRows.forEach((serverRow, index) => {
      const localId = getOriginalRowForServerRow(originalRows, serverRow, index)?.id;
      rewriteLocalId(operation.table, localId, serverRow);
    });
  // Confirmed by Supabase: authoritative write that overwrites the local
  // copy and clears the pending (synced:false) flag.
  await saveFetchedData(operation.table, serverRows);
    return;
  }

  if (operation.method === "upsert") {
    const originalRows = Array.isArray(operation.payload) ? operation.payload : [operation.payload];
    const payload = preparePayload(operation.table, operation.payload);
    query = supabase.from(operation.table).upsert(payload, operation.options || {}).select(operation.selectColumns || "*");
    const { data, error } = await query;
    if (error) throw error;
    const serverRows = Array.isArray(data) ? data : (data ? [data] : []);
    serverRows.forEach((serverRow, index) => {
      const localId = getOriginalRowForServerRow(originalRows, serverRow, index)?.id;
      rewriteLocalId(operation.table, localId, serverRow);
    });
    // Confirmed by Supabase: authoritative write that overwrites the local
    // copy and clears the pending (synced:false) flag.
    await saveFetchedData(operation.table, serverRows);
    return;
  }

  if (operation.method === "update") {
    const payload = preparePayload(operation.table, operation.payload);
    query = supabase.from(operation.table).update(payload).select(operation.selectColumns || "*");
    for (const filter of filters) query = query[filter.operator](filter.column, filter.value);
    const { data, error } = await query;
    if (error) throw error;
    // Confirmed by Supabase: authoritative write that overwrites the local
    // copy and clears the pending (synced:false) flag.
    await saveFetchedData(operation.table, Array.isArray(data) ? data : (data ? [data] : []));
    return;
  }

  if (operation.method === "delete") {
    query = supabase.from(operation.table).delete();
    for (const filter of filters) query = query[filter.operator](filter.column, filter.value);
    const { error } = await query;
    if (error) throw error;
    // Supabase confirmed the delete. Remove the local rows so the tombstone does
    // not linger (or resurrect via an insert-confirm snapshot) and so the next
    // snapshot can garbage-collect them.
    removeLocalRows(operation.table, (row) => filters.every((filter) => filterMatches(row, filter)));
  }
}

function maxTimestampInRow(row, columns) {
  let max = null;
  for (const column of columns) {
    const value = row?.[column];
    if (value && (!max || new Date(value).getTime() > new Date(max).getTime())) max = value;
  }
  return max;
}

function maxTimestampInRows(rows, columns) {
  let max = null;
  for (const row of rows || []) {
    const value = maxTimestampInRow(row, columns);
    if (value && (!max || new Date(value).getTime() > new Date(max).getTime())) max = value;
  }
  return max;
}

async function fetchTableDelta(table, columns) {
  const watermark = getSyncWatermark(table);
  if (!watermark) return null;
  const orFilter = columns.map((column) => `${column}.gt.${watermark}`).join(",");
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .or(orFilter)
    .limit(INCREMENTAL_CAP + 1);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > INCREMENTAL_CAP) return null;
  return rows;
}

async function fetchTableSnapshot(table) {
  const columns = SYNC_TIME_COLUMNS[table];

  if (columns) {
    const delta = await fetchTableDelta(table, columns);
    if (delta !== null) {
      if (delta.length === 0) {
        // Nothing changed on the server since the last checkpoint. The existing
        // cache is already current, so skip the write entirely.
        return;
      }
      await saveFetchedData(table, delta, { protectUnsynced: true });
      const watermark = maxTimestampInRows(delta, columns);
      if (watermark) setSyncWatermark(table, watermark);
      console.info("[OfflineSync] Incremental snapshot", { table, rows: delta.length });
      return;
    }
    // No watermark yet (cold cache) or the delta maxed out the cap: fall back
    // to a full re-pull below so this table's checkpoint stays exact.
  }

  const pageSize = 1000;
  const rows = [];
  for (let from = 0; isOnline(); from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return;
      throw error;
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  if (SERVER_SNAPSHOT_REPLACE_TABLES.has(table)) {
    await replaceFetchedData(table, rows, { protectUnsynced: true });
  } else {
    await saveFetchedData(table, rows, { protectUnsynced: true });
  }
  if (columns) {
    const watermark = maxTimestampInRows(rows, columns);
    if (watermark) setSyncWatermark(table, watermark);
  }
}

export async function refreshOfflineSnapshot() {
  if (!isOnline() || refreshingSnapshot || syncing) return;
  // Never pull a server snapshot while there are unsynced local edits waiting
  // in the queue. Doing so risks overwriting pending edits with stale server
  // data before they have been persisted to Supabase.
  const pending = await getPendingQueue();
  if (pending.length > 0) {
    console.info("[OfflineSync] Snapshot refresh skipped; pending operations:", pending.length);
    return;
  }
  refreshingSnapshot = true;
  try {
    for (const table of OFFLINE_TABLES) {
      if (!isOnline()) break;
      // The global recycle_bin is synced via the embedded-queue upserts and read
      // directly from the server by RecycleBinPage. Pulling the whole table (with
      // large original_data blobs) on every snapshot is expensive; skip it.
      if (table === "recycle_bin") continue;
      await fetchTableSnapshot(table);
    }
  } catch (error) {
    console.warn("Offline snapshot refresh skipped:", error.message || error);
  } finally {
    refreshingSnapshot = false;
  }
}

export async function syncPendingData() {
  if (!isOnline() || syncing) return;

  syncing = true;
  emitStatus("pending");
  let queueDrained = false;
  try {
    // Stale operations for tables that are not valid sync tables (e.g. leftover
    // recycle_bin inserts from older builds) can never execute and would fail
    // forever, blocking the queue. Drop them before processing.
    const dropped = await purgeUnsupportedQueueOps();
    for (const op of dropped) {
      console.warn("[OfflineSync] Dropped stale operation for unsupported table", {
        queueId: op.id,
        table: op.table,
        method: op.method,
      });
    }
    await ensureQueueInsertIdempotencyKeys();

    const queue = await getPendingQueue();
    const startCount = queue.length;
    let succeeded = 0;
    let failed = 0;
    let firstError = null;
    console.info("[OfflineSync] Sync started; queued operations:", startCount);

    for (const operation of queue) {
      if (!isOnline()) break;
      try {
        await executeOperation(operation);
        // Remove from the queue ONLY after Supabase confirmed the write.
        await removeQueueItem(operation.id);
        succeeded += 1;
        console.info("[OfflineSync] Operation succeeded", {
          queueId: operation.id,
          table: operation.table,
          method: operation.method,
        });
      } catch (error) {
        failed += 1;
        firstError = firstError || error;
        // A single failed operation must NOT block the rest of the queue.
        // The failed item stays queued and is retried on the next sync.
        console.error("[OfflineSync] Operation failed; retained in queue", {
          queueId: operation.id,
          table: operation.table,
          method: operation.method,
          message: error.message || String(error),
          code: error.code,
          details: error.details,
        });
      }
    }

    const remaining = await getPendingQueue();
    queueDrained = remaining.length === 0;
    console.info("[OfflineSync] Sync finished", {
      startCount,
      succeeded,
      failed,
      remaining: remaining.length,
    });
    emitStatus(remaining.length > 0 ? "pending" : "synced", firstError ? { error: firstError.message || "Some operations failed" } : {});
  } catch (error) {
    console.error("Offline sync failed:", error);
    emitStatus("pending", { error: error.message || "Sync failed" });
  } finally {
    syncing = false;
  }

  // Refresh the server snapshot only AFTER the sync mutex is released and only
  // when the queue is fully drained. Running it here (rather than inside the
  // try block) prevents the refresh from being a no-op due to its own
  // `syncing` guard, and guarantees it never races the queue upload.
  if (queueDrained && isOnline()) {
    await refreshOfflineSnapshot();
  }
}

export function startAutoSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    syncPendingData();
  });
  window.addEventListener("khata-sync-request", () => {
    syncPendingData();
  });
  if (isOnline()) {
    // syncPendingData() drains the queue first and then triggers a snapshot
    // refresh itself once the queue is empty. We intentionally do NOT kick off
    // an independent refresh here: an unconditional startup refresh previously
    // ran concurrently with the initial sync and overwrote not-yet-uploaded
    // local edits with a stale server snapshot.
    setTimeout(() => syncPendingData(), 0);
  }
}
