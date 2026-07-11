import { supabase } from "../supabase";
import {
  OFFLINE_TABLES,
  getPendingQueue,
  isOnline,
  removeQueueItem,
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
    console.log("PAYLOAD", payload);
    query = supabase.from(operation.table).insert(payload).select(operation.selectColumns || "*");
    const response = await query;
    const { data, error } = response;
    console.log("SUPABASE RESPONSE", response);
    console.log("SUPABASE ERROR", error);
    if (error) throw error;
    const serverRows = Array.isArray(data) ? data : (data ? [data] : []);
    serverRows.forEach((serverRow, index) => {
      const localId = originalRows[index]?.id;
      rewriteLocalId(operation.table, localId, serverRow);
    });
    await saveFetchedData(operation.table, serverRows);
    return;
  }

  if (operation.method === "upsert") {
    const originalRows = Array.isArray(operation.payload) ? operation.payload : [operation.payload];
    const payload = preparePayload(operation.table, operation.payload);
    console.log("PAYLOAD", payload);
    query = supabase.from(operation.table).upsert(payload, operation.options || {}).select(operation.selectColumns || "*");
    const response = await query;
    const { data, error } = response;
    console.log("SUPABASE RESPONSE", response);
    console.log("SUPABASE ERROR", error);
    if (error) throw error;
    const serverRows = Array.isArray(data) ? data : (data ? [data] : []);
    serverRows.forEach((serverRow, index) => {
      const localId = originalRows[index]?.id;
      rewriteLocalId(operation.table, localId, serverRow);
    });
    await saveFetchedData(operation.table, serverRows);
    return;
  }

  if (operation.method === "update") {
    const payload = preparePayload(operation.table, operation.payload);
    console.log("PAYLOAD", payload);
    query = supabase.from(operation.table).update(payload).select(operation.selectColumns || "*");
    for (const filter of filters) query = query[filter.operator](filter.column, filter.value);
    const response = await query;
    const { data, error } = response;
    console.log("SUPABASE RESPONSE", response);
    console.log("SUPABASE ERROR", error);
    if (error) throw error;
    await saveFetchedData(operation.table, Array.isArray(data) ? data : (data ? [data] : []));
    return;
  }

  if (operation.method === "delete") {
    console.log("PAYLOAD", { filters });
    query = supabase.from(operation.table).delete();
    for (const filter of filters) query = query[filter.operator](filter.column, filter.value);
    const response = await query;
    const { error } = response;
    console.log("SUPABASE RESPONSE", response);
    console.log("SUPABASE ERROR", error);
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
  await saveFetchedData(table, rows);
}

export async function refreshOfflineSnapshot() {
  if (!isOnline() || refreshingSnapshot) return;
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
  try {
    const queue = await getPendingQueue();
    for (const operation of queue) {
      if (!isOnline()) break;
      console.log("SYNC START", operation);
      console.log("QUEUE BEFORE", await getPendingQueue());
      try {
        await executeOperation(operation);
        await removeQueueItem(operation.id);
        console.log("QUEUE AFTER", await getPendingQueue());
        console.info("[OfflineSync] Operation succeeded", {
          queueId: operation.id,
          table: operation.table,
          method: operation.method,
        });
      } catch (error) {
        console.error("[OfflineSync] Operation failed; retained in queue", {
          queueId: operation.id,
          table: operation.table,
          method: operation.method,
          message: error.message || String(error),
          code: error.code,
          details: error.details,
        });
        throw error;
      }
    }
    const remaining = await getPendingQueue();
    emitStatus(remaining.length > 0 ? "pending" : "synced");
    if (remaining.length === 0) {
      refreshOfflineSnapshot();
    }
  } catch (error) {
    console.error("Offline sync failed:", error);
    emitStatus("pending", { error: error.message || "Sync failed" });
  } finally {
    syncing = false;
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
    setTimeout(() => syncPendingData(), 0);
    setTimeout(() => refreshOfflineSnapshot(), 1000);
  }
}
