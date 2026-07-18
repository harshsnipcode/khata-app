import { supabase } from "../supabase";
import { sanitizeTablePayload } from "./tableSchemas";
import {
  OFFLINE_TABLES,
  SERVER_SNAPSHOT_REPLACE_TABLES,
  createTempId,
  deleteLocalRows,
  enqueueOperation,
  getAll,
  isOnline,
  rewriteForeignKeys,
  replaceFetchedData,
  saveFetchedData,
  upsertLocalRows,
  getCache,
} from "./db";

function normalizeComparable(value) {
  if (value === undefined || value === null) return value;
  return String(value);
}

function matchesFilter(row, filter) {
  const value = row?.[filter.column];
  if (filter.operator === "eq") return normalizeComparable(value) === normalizeComparable(filter.value);
  if (filter.operator === "neq") return normalizeComparable(value) !== normalizeComparable(filter.value);
  if (filter.operator === "gt") return value > filter.value;
  if (filter.operator === "gte") return value >= filter.value;
  if (filter.operator === "lt") return value < filter.value;
  if (filter.operator === "lte") return value <= filter.value;
  if (filter.operator === "in") return Array.isArray(filter.value) && filter.value.map(String).includes(String(value));
  if (filter.operator === "is") return value === filter.value;
  if (filter.operator === "like" || filter.operator === "ilike") {
    const text = String(value || "");
    const pattern = String(filter.value || "").replaceAll("%", "");
    return filter.operator === "ilike"
      ? text.toLowerCase().includes(pattern.toLowerCase())
      : text.includes(pattern);
  }
  return true;
}

function applyFilters(rows, filters) {
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

function applyOrder(rows, order) {
  if (!order) return rows;
  return [...rows].sort((a, b) => {
    const aValue = a?.[order.column];
    const bValue = b?.[order.column];
    if (aValue === bValue) return 0;
    if (aValue === undefined || aValue === null) return order.ascending ? -1 : 1;
    if (bValue === undefined || bValue === null) return order.ascending ? 1 : -1;
    return order.ascending
      ? String(aValue).localeCompare(String(bValue), undefined, { numeric: true })
      : String(bValue).localeCompare(String(aValue), undefined, { numeric: true });
  });
}

function hydrateRelations(table, row, columns) {
  if (table === "transaction_items" && columns?.includes("products(")) {
    const product = (getCache().products || []).find((item) => String(item.id) === String(row.product_id));
    return {
      ...row,
      products: product ? { name: product.name, ...product } : row.products,
    };
  }
  return row;
}

function pickColumns(table, row, columns) {
  const hydrated = hydrateRelations(table, row, columns);
  if (!columns || columns === "*" || columns.includes("(")) return hydrated;
  const selected = {};
  for (const column of columns.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (column in hydrated) selected[column] = hydrated[column];
  }
  return selected;
}

function applySelect(table, rows, columns) {
  return rows.map((row) => pickColumns(table, row, columns));
}

function onlineOnlyError(table) {
  return {
    data: null,
    error: {
      message: `${table} requires an internet connection. Please reconnect and try again.`,
      offline: true,
    },
  };
}

function emitOfflineSaved(table) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("offline-saved", {
    detail: { message: "Saved offline. Will sync automatically.", table },
  }));
}

function payloadHasTemporaryId(payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.some((row) => typeof row?.id === "number" && row.id < 0);
}

function scheduleSyncIfOnline() {
  if (!isOnline() || typeof window === "undefined") return;
  setTimeout(() => {
    window.dispatchEvent(new Event("khata-sync-request"));
  }, 0);
}

function buildMutationRows(table, payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  const now = new Date().toISOString();
  return rows.map((row) => ({
    ...row,
    id: row?.id ?? createTempId(),
    created_at: row?.created_at || now,
    // Mark as an unsynced local edit so background server reads/snapshots
    // cannot overwrite it until the queued operation is confirmed.
    synced: false,
  }));
}

function createQueryBuilder(table, method, payload, options = {}) {
  const ops = {
    table,
    method,
    payload,
    options,
    filters: [],
    selectColumns: null,
    single: false,
    maybeSingle: false,
    order: null,
    limit: null,
  };

  const builder = {
    select(columns = "*") {
      ops.selectColumns = columns;
      return this;
    },
    single() {
      ops.single = true;
      return this;
    },
    maybeSingle() {
      ops.maybeSingle = true;
      return this;
    },
    eq(column, value) {
      ops.filters.push({ column, operator: "eq", value });
      return this;
    },
    neq(column, value) {
      ops.filters.push({ column, operator: "neq", value });
      return this;
    },
    gt(column, value) {
      ops.filters.push({ column, operator: "gt", value });
      return this;
    },
    gte(column, value) {
      ops.filters.push({ column, operator: "gte", value });
      return this;
    },
    lt(column, value) {
      ops.filters.push({ column, operator: "lt", value });
      return this;
    },
    lte(column, value) {
      ops.filters.push({ column, operator: "lte", value });
      return this;
    },
    like(column, value) {
      ops.filters.push({ column, operator: "like", value });
      return this;
    },
    ilike(column, value) {
      ops.filters.push({ column, operator: "ilike", value });
      return this;
    },
    in(column, value) {
      ops.filters.push({ column, operator: "in", value });
      return this;
    },
    is(column, value) {
      ops.filters.push({ column, operator: "is", value });
      return this;
    },
    order(column, { ascending = true } = {}) {
      ops.order = { column, ascending };
      return this;
    },
    limit(count) {
      ops.limit = count;
      return this;
    },
    async then(onFulfilled, onRejected) {
      try {
        const result = await this.execute();
        return onFulfilled ? onFulfilled(result) : result;
      } catch (error) {
        if (onRejected) return onRejected(error);
        throw error;
      }
    },
    async execute() {
      if (!OFFLINE_TABLES.includes(table)) {
        if (!isOnline()) return onlineOnlyError(table);
        return executeOnline(ops);
      }
      const isMutation = ops.method !== "select" && ops.method !== "delete";
      if (isOnline() && isMutation && payloadHasTemporaryId(ops.payload)) {
        return executeOffline(ops);
      }
      if (isOnline()) {
        try {
          const result = await executeOnline(ops);
          if (!result.error) await refreshCacheAfterOnlineResult(ops, result.data);
          return result;
        } catch {
          return executeOffline(ops);
        }
      }
      return executeOffline(ops);
    },
  };

  return builder;
}

async function executeOnline(ops) {
  const isMutation = ops.method === "insert" || ops.method === "upsert" || ops.method === "update";
  const payload = isMutation && OFFLINE_TABLES.includes(ops.table)
    ? sanitizeTablePayload(ops.table, rewriteForeignKeys(ops.payload))
    : ops.payload;
  let query = supabase.from(ops.table)[ops.method](payload, ops.options);
  if (ops.selectColumns && ops.method !== "select") query = query.select(ops.selectColumns);
  if (ops.method === "select") query = supabase.from(ops.table).select(ops.selectColumns || "*");
  for (const filter of ops.filters) {
    query = query[filter.operator](filter.column, filter.value);
  }
  if (ops.order) query = query.order(ops.order.column, { ascending: ops.order.ascending });
  if (ops.limit !== null) query = query.limit(ops.limit);
  if (ops.single) query = query.single();
  if (ops.maybeSingle) query = query.maybeSingle();
  return await query;
}

async function refreshCacheAfterOnlineResult(ops, data) {
  if (ops.method === "select") {
    // This is a server READ refreshing the cache, not a confirmed write, so it
    // must never overwrite a local edit that is still pending in the queue.
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    const canSafelyReplace = SERVER_SNAPSHOT_REPLACE_TABLES.has(ops.table)
      && ops.filters.length === 0
      && (rows.length === 0 || !ops.selectColumns || ops.selectColumns === "*");
    if (canSafelyReplace) {
      await replaceFetchedData(ops.table, rows, { protectUnsynced: true });
      return;
    }
    await saveFetchedData(ops.table, rows, { protectUnsynced: true });
    return;
  }

  if (ops.method === "delete") {
    deleteLocalRows(ops.table, (row) => ops.filters.every((filter) => matchesFilter(row, filter)));
    return;
  }

  // Confirmed online mutation: Supabase already persisted this write, so its
  // response is authoritative and should overwrite the local copy.
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  if (rows.length > 0) {
    await saveFetchedData(ops.table, rows);
  }
}

async function executeOffline(ops) {
  if (ops.method === "select") {
    let rows = await getAll(ops.table);
    rows = applyFilters(rows, ops.filters);
    rows = applyOrder(rows, ops.order);
    if (ops.limit !== null) rows = rows.slice(0, ops.limit);
    rows = applySelect(ops.table, rows, ops.selectColumns);
    if (ops.single || ops.maybeSingle) {
      const row = rows[0] || null;
      return {
        data: row,
        error: row || ops.maybeSingle ? null : { message: "No rows found", offline: true },
      };
    }
    return { data: rows, error: null };
  }

  if (ops.method === "insert" || ops.method === "upsert") {
    if ((ops.table === "customers" || ops.table === "products") && ops.method === "insert") {
      const incomingRows = Array.isArray(ops.payload) ? ops.payload : [ops.payload];
      const existingRows = await getAll(ops.table);
      const duplicate = incomingRows.find((row) => (
        row?.name &&
        existingRows.some((existing) => (
          existing?.name?.trim().toLowerCase() === row.name.trim().toLowerCase()
        ))
      ));
      if (duplicate) {
        return {
          data: null,
          error: { message: `${ops.table === "customers" ? "Customer" : "Product"} already exists offline: ${duplicate.name}` },
        };
      }
    }
    const rows = buildMutationRows(ops.table, ops.payload).map(rewriteForeignKeys);
    upsertLocalRows(ops.table, rows);
    enqueueOperation({
      table: ops.table,
      method: ops.method,
      payload: Array.isArray(ops.payload) ? rows : rows[0],
      options: ops.options,
      filters: ops.filters,
      selectColumns: ops.selectColumns,
    });
    scheduleSyncIfOnline();
    emitOfflineSaved(ops.table);
    const selected = applySelect(ops.table, rows, ops.selectColumns);
    return { data: ops.single ? selected[0] : selected, error: null };
  }

  if (ops.method === "update") {
    const rows = applyFilters(await getAll(ops.table), ops.filters).map((row) => ({
      ...row,
      ...ops.payload,
      // Mark as an unsynced local edit so background server reads/snapshots
      // cannot overwrite it until the queued operation is confirmed.
      synced: false,
      __local_updated_at: new Date().toISOString(),
    }));
    upsertLocalRows(ops.table, rows);
    enqueueOperation({
      table: ops.table,
      method: "update",
      payload: ops.payload,
      options: ops.options,
      filters: ops.filters,
      selectColumns: ops.selectColumns,
    });
    scheduleSyncIfOnline();
    emitOfflineSaved(ops.table);
    const selected = applySelect(ops.table, rows, ops.selectColumns);
    return { data: ops.single ? selected[0] || null : selected, error: null };
  }

  if (ops.method === "delete") {
    const targets = applyFilters(await getAll(ops.table), ops.filters);
    deleteLocalRows(ops.table, (row) => ops.filters.every((filter) => matchesFilter(row, filter)), { markUnsynced: true });
    enqueueOperation({
      table: ops.table,
      method: "delete",
      payload: ops.payload,
      options: ops.options,
      filters: ops.filters,
      selectColumns: ops.selectColumns,
    });
    scheduleSyncIfOnline();
    emitOfflineSaved(ops.table);
    return { data: targets, error: null };
  }

  return { data: null, error: { message: `Unsupported offline method: ${ops.method}` } };
}

export const offlineSupabase = {
  from(table) {
    return {
      select: (columns = "*") => createQueryBuilder(table, "select", null).select(columns),
      insert: (payload, options) => createQueryBuilder(table, "insert", payload, options),
      update: (payload, options) => createQueryBuilder(table, "update", payload, options),
      delete: (payload = {}, options) => createQueryBuilder(table, "delete", payload, options),
      upsert: (payload, options) => createQueryBuilder(table, "upsert", payload, options),
    };
  },
  auth: supabase.auth,
  storage: supabase.storage,
  rpc: supabase.rpc.bind(supabase),
  channel: (name) => {
    if (isOnline()) return supabase.channel(name);
    const noopChannel = {
      on() { return noopChannel; },
      subscribe(callback) {
        if (typeof callback === "function") callback("CLOSED");
        return noopChannel;
      },
      unsubscribe() { return Promise.resolve("ok"); },
    };
    return noopChannel;
  },
  removeChannel: (channel) => {
    if (!channel) return Promise.resolve("ok");
    if (!isOnline() && typeof channel.unsubscribe === "function") return channel.unsubscribe();
    return supabase.removeChannel(channel);
  },
};

export function useOfflineFirst(table) {
  return {
    async getAll() {
      return await offlineSupabase.from(table).select("*");
    },
    async getById(id) {
      return await offlineSupabase.from(table).select("*").eq("id", id).single();
    },
  };
}

export default offlineSupabase;
