import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getAll, saveFetchedData, removeLocalRows, resolveServerId, isOnline, readQueue } from "./offline/db";

const TABLE = "transactions";
const DELTA_PAGE_SIZE = 1000;
const MAX_DELTA_PAGES = 5;
const MAX_FULL_RECONCILE_ATTEMPTS = 3;
const CATCH_UP_MIN_GAP_MS = 15_000;

// Column projection for delta queries. The offline cache keeps its full rows
// (ledger/report pages depend on them); this list is ONLY what /admin/home's
// derived views need and is used strictly for live fetch queries.
const DELTA_COLUMNS = [
  "id",
  "customer_id",
  "type",
  "amount",
  "date",
  "payment_mode",
  "description",
  "created_by",
  "created_at",
  "activity_at",
  "import_history_id",
].join(", ");

// Confirmed server-sync checkpoint (ISO timestamp of the newest activity_at
// that a completed catch-up delta actually returned). WATERMARK RULE: it may
// ONLY advance inside a successfully processed catch-up query. Realtime events
// never move it, and concurrent catch-ups are serialized, so a realtime event
// can never push the checkpoint past rows that have not been fetched yet.
let watermark = null;
let catchUpRunning = false;
let baselinePromise = null;
let lastCatchUpAt = 0;

// Serializes every cache mutation (realtime merges, realtime deletes, and the
// full reconciliation) so a background reconcile can never interleave with a
// live event and clobber a row that arrived after its snapshot was taken.
let cacheLock = Promise.resolve();
function withCacheLock(fn) {
  const run = cacheLock.then(fn, fn);
  cacheLock = run.catch(() => {});
  return run;
}

function isRealServerId(id) {
  if (id === undefined || id === null || id === "") return false;
  if (typeof id === "number") return id >= 0;
  if (typeof id === "string") return !/^-\d+$/.test(id);
  return true;
}

function rowTimestamp(row) {
  return row?.activity_at || row?.created_at || null;
}

function maxTimestamp(rows) {
  let max = null;
  for (const row of rows || []) {
    const ts = rowTimestamp(row);
    if (ts && (!max || new Date(ts).getTime() > new Date(max).getTime())) max = ts;
  }
  return max;
}

async function fetchServerDigest() {
  const { data: newest, error: maxError } = await supabase
    .from(TABLE)
    .select("activity_at, created_at")
    .order("activity_at", { ascending: false })
    .limit(1);
  if (maxError) throw maxError;
  const { count, error: countError } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;
  return { serverMax: maxTimestamp(newest || []), serverCount: count ?? 0 };
}

function cacheDigest(rows) {
  const seenIds = new Set();
  let cacheMax = null;
  for (const row of rows || []) {
    if (!row || row.deleted_locally) continue;
    if (isRealServerId(row.id)) seenIds.add(String(row.id));
    const ts = rowTimestamp(row);
    if (ts && (!cacheMax || new Date(ts).getTime() > new Date(cacheMax).getTime())) cacheMax = ts;
  }
  return { cacheMax, cacheCount: seenIds.size };
}

// The cache is server-current when it accounts for at least as many real
// server ids as the server has AND holds its newest row. A surplus happens
// naturally when unsynced local rows exist; only a deficit (or a newer server
// max) means reconciliation must download more.
function isCacheCurrent(cache, server) {
  if (server.serverCount === 0) return cache.cacheCount === 0;
  if (cache.cacheCount < server.serverCount) return false;
  return !!cache.cacheMax && new Date(cache.cacheMax).getTime() >= new Date(server.serverMax).getTime();
}

function resolvedIdKey(row) {
  const id = row?.id;
  if (id === undefined || id === null || id === "") return null;
  return String(resolveServerId(TABLE, id));
}

// A fetched snapshot may only be used to REMOVE local rows when it is proven
// to be the complete, current server set. Proof: the number of distinct real
// server ids in the snapshot must exactly equal the live server count (served
// via HTTP HEAD, which the service worker can never satisfy offline) AND the
// snapshot's newest row timestamp must equal the live server max. Any
// divergence in either direction (empty, partial, stale, or silently altered
// payloads) fails the proof and forbids deletion.
function snapshotIsComplete(full, server) {
  if (!server) return false;
  const fullIds = new Set();
  for (const row of full || []) {
    const key = resolvedIdKey(row);
    if (key) fullIds.add(key);
  }
  if (fullIds.size !== (server.serverCount ?? 0)) return false;
  const fullMax = maxTimestamp(full);
  if (!fullMax || !server.serverMax) return fullMax === server.serverMax;
  return new Date(fullMax).getTime() === new Date(server.serverMax).getTime();
}

function mergeRows(existing, incoming) {
  const indexed = new Map();
  const extras = [];
  for (const row of existing || []) {
    if (!row || typeof row !== "object") continue;
    if (row.id === undefined || row.id === null) {
      extras.push(row);
      continue;
    }
    indexed.set(String(row.id), { ...row });
  }
  for (const row of incoming || []) {
    if (!row || typeof row !== "object") continue;
    if (row.id === undefined || row.id === null) {
      extras.push(row);
      continue;
    }
    const prev = indexed.get(String(row.id));
    // Mirror the cache's protectUnsynced semantics: never let a server row
    // overwrite a local edit that has not yet been confirmed as synced.
    if (prev && prev.synced === false) continue;
    indexed.set(String(row.id), prev ? { ...prev, ...row } : { ...row });
  }
  return [...indexed.values(), ...extras];
}

async function paginateAllTransactions() {
  const rows = [];
  for (let from = 0; ; from += DELTA_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      // A range query must have a total order. Offline batches often contain
      // rows with the same created_at, and ordering only by that column lets
      // PostgREST move tied rows between pages across reloads.
      .order("id", { ascending: false })
      .range(from, from + DELTA_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < DELTA_PAGE_SIZE) break;
  }
  return rows;
}

async function fetchCompleteTransactionsSnapshot() {
  let full = [];
  let server = null;
  for (let attempt = 0; attempt < MAX_FULL_RECONCILE_ATTEMPTS; attempt += 1) {
    full = await paginateAllTransactions();
    try {
      server = await fetchServerDigest();
    } catch {
      server = null;
    }
    if (server && snapshotIsComplete(full, server)) {
      return { full, server };
    }
  }
  return { full, server };
}

async function fetchTransactionsSince(since) {
  const rows = [];
  for (let page = 0; page < MAX_DELTA_PAGES; page += 1) {
    const from = page * DELTA_PAGE_SIZE;
    const { data, error } = await supabase
      .from(TABLE)
      .select(DELTA_COLUMNS)
      .gt("activity_at", since)
      .order("activity_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + DELTA_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < DELTA_PAGE_SIZE) return { rows, hitCap: false };
  }
  return { rows, hitCap: true };
}

export function useLiveTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let channel;

    async function commit(rows) {
      if (!rows || rows.length === 0) return;
      await withCacheLock(async () => {
        await saveFetchedData(TABLE, rows, { protectUnsynced: true });
        if (active) setTransactions((prev) => mergeRows(prev, rows));
      });
    }

    async function reconcileFull(full, server) {
      const serverKeys = new Set((full || []).map(resolvedIdKey).filter(Boolean));
      const complete = snapshotIsComplete(full, server);
      await withCacheLock(async () => {
        // Additive repair first: merge the snapshot into the cache
        // (protectUnsynced keeps pending local edits intact). This step can
        // only grow or refresh the cache, never shrink it — even a partial or
        // empty payload is harmless here.
        await saveFetchedData(TABLE, full, { protectUnsynced: true });
        // Subtractive step only under a live-proven complete snapshot AND
        // only while genuinely online: drop previously-synced rows the server
        // no longer has (deletions realtime could not deliver while this view
        // was unmounted). Absence from an unproven, offline, or stale payload
        // is never treated as a deletion.
        if (complete && isOnline()) {
          await removeLocalRows(TABLE, (row) => {
            if (!row || row.synced !== true || row.deleted_locally) return false;
            const key = resolvedIdKey(row);
            return !!key && !serverKeys.has(key);
          });
        }
        if (active) setTransactions(await getAll(TABLE));
      });
    }

    function ensureBaseline() {
      if (watermark) return Promise.resolve();
      if (baselinePromise) return baselinePromise;
      baselinePromise = (async () => {
        const rows = await paginateAllTransactions();
        await commit(rows);
        const max = maxTimestamp(rows);
        if (max) watermark = max;
      })().finally(() => {
        baselinePromise = null;
      });
      return baselinePromise;
    }

    async function catchUp() {
      if (catchUpRunning) return;
      const now = Date.now();
      if (now - lastCatchUpAt < CATCH_UP_MIN_GAP_MS) return;
      lastCatchUpAt = now;
      catchUpRunning = true;
      try {
        await ensureBaseline();
        if (!watermark) return; // baseline is not confirmed yet; retry next trigger
        // Completeness check: the delta only ever asks for activity_at > the
        // cached watermark, so rows at or below it that are missing or stale
        // (older gaps, silent edits, non-RPC updates) can never be recovered by
        // the delta alone. A cheap server digest (newest row + exact count)
        // proves whether the cache holds the complete server set; when it
        // cannot, pull the full history once in the background and move on.
        const cached = await getAll(TABLE);
        const cache = cacheDigest(cached);
        const server = await fetchServerDigest();
        console.info("[Diag:liveSync] server digest | serverMax=" + (server?.serverMax ?? "null") + " | serverCount=" + (server?.serverCount ?? "null") + " | serverError=null");
        // An offline DELETE (or any other queued local mutation) makes the
        // digest report a spurious deficit: the server still counts a row this
        // device already considers gone, so it is NOT server authority until
        // that queue has drained. Never run the authoritative full-snapshot
        // reconcile while offline or while operations for this table are
        // pending; the additive delta below still makes forward progress and
        // the queued DELETE is what actually removes the row server-side.
        const hasPendingOps = readQueue().some((op) => op.table === TABLE);
        const cacheCurrent = isCacheCurrent(cache, server);
        console.info("[Diag:liveSync] path decision | hasPendingOps=" + hasPendingOps + " | cacheCurrent=" + cacheCurrent + " | path=" + (isOnline() && !hasPendingOps && !cacheCurrent ? "full-reconcile" : "delta"));
        if (isOnline() && !hasPendingOps && !cacheCurrent) {
          // Re-read a bounded number of times if the server changes during a
          // paginated fetch. This also makes a tied timestamp batch converge
          // in this one reconciliation instead of relying on reloads.
          const { full, server: after } = await fetchCompleteTransactionsSnapshot();
          await reconcileFull(full, after);
          const max = maxTimestamp(full);
          if (after && snapshotIsComplete(full, after) && max) watermark = max;
          return;
        }
        const { rows, hitCap } = await fetchTransactionsSince(watermark);
        const wmBefore = watermark;
        if (hitCap) {
          // The delta hit the page cap, meaning the watermark boundary may not
          // be clean. Pull the full history once rather than risk skipping rows
          // at the page boundary, then record a confirmed checkpoint.
          const full = await paginateAllTransactions();
          await commit(full);
          const max = maxTimestamp(full);
          if (max) watermark = max;
          console.info("[Diag:liveSync] delta result | rowsReturned=" + rows.length + " | hitCap=" + hitCap + " | watermarkBefore=" + wmBefore + " | watermarkAfter=" + watermark);
          return;
        }
        await commit(rows);
        const max = maxTimestamp(rows);
        if (max && new Date(max).getTime() > new Date(watermark).getTime()) {
          watermark = max;
        }
        console.info("[Diag:liveSync] delta result | rowsReturned=" + rows.length + " | hitCap=" + hitCap + " | watermarkBefore=" + wmBefore + " | watermarkAfter=" + watermark);
      } catch (error) {
        console.warn("[Diag:liveSync] catch-up failed | watermark=" + watermark + " | error=" + (error?.message || error));
        console.warn("[LiveSync] catch-up failed; will retry later", error?.message || error);
      } finally {
        catchUpRunning = false;
      }
    }

    async function start() {
      const cached = await getAll(TABLE);
      if (!active) return;
      setTransactions(cached);
      if (!watermark) {
        // Seed the checkpoint from the server-derived cache snapshot so a
        // remount never re-downloads history it already holds. This is safe:
        // subsequent deltas only advance it after a confirmed successful fetch.
        const seed = maxTimestamp(cached);
        if (seed) watermark = seed;
      }
      console.info("[Diag:liveSync] start seed | watermark=" + watermark + " | cacheCount=" + cached.length + " | cacheMax=" + maxTimestamp(cached));
      if (!watermark) {
        try {
          await ensureBaseline();
        } catch (error) {
          console.warn("[LiveSync] baseline load failed", error?.message || error);
        }
      }
      if (!active) return;
      setInitialLoading(false);
      catchUp();
    }

    channel = supabase
      .channel("admin-home-transactions-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE }, (payload) => {
        if (payload?.new?.id !== undefined && payload?.new?.id !== null) commit([payload.new]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: TABLE }, (payload) => {
        if (payload?.new?.id !== undefined && payload?.new?.id !== null) commit([payload.new]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: TABLE }, (payload) => {
        const id = payload?.old_record?.id ?? payload?.old?.id;
        if (id === undefined || id === null) return;
        withCacheLock(async () => {
          await removeLocalRows(TABLE, (row) => String(row.id) === String(id));
          if (active) setTransactions((prev) => prev.filter((row) => String(row.id) !== String(id)));
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") catchUp();
      });

    start();

    const onOnline = () => catchUp();
    window.addEventListener("online", onOnline);
    const onVisibility = () => {
      if (document.visibilityState === "visible") catchUp();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { transactions, initialLoading };
}
