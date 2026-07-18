import { supabase } from "../supabase";
import {
  OFFLINE_TABLES,
  SERVER_SNAPSHOT_REPLACE_TABLES,
  getPendingQueue,
  isOnline,
  removeQueueItem,
  replaceFetchedData,
  rewriteFilters,
  rewriteForeignKeys,
  rewriteLocalId,
  saveFetchedData,
} from "./db";
import { sanitizeTablePayload } from "./tableSchemas";

let syncing = false;
let refreshingSnapshot = false;

function emitStatus(status, detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("sync-status", { detail: { status, ...detail } }));
}

function isTemporaryId(id) {
  return typeof id === "number" && id < 0;
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
    query = supabase.from(operation.table).insert(payload).select(operation.selectColumns || "*");
    const { data, error } = await query;
    if (error) throw error;
    const serverRows = Array.isArray(data) ? data : (data ? [data] : []);
    serverRows.forEach((serverRow, index) => {
      const localId = originalRows[index]?.id;
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
      const localId = originalRows[index]?.id;
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
  }
}

async function fetchTableSnapshot(table) {
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
    return;
  }
  await saveFetchedData(table, rows, { protectUnsynced: true });
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
