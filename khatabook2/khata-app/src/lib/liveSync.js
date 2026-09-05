import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getAll, saveFetchedData, removeLocalRows } from "./offline/db";

const TABLE = "transactions";
const DELTA_PAGE_SIZE = 1000;
const MAX_DELTA_PAGES = 5;
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
      .range(from, from + DELTA_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < DELTA_PAGE_SIZE) break;
  }
  return rows;
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
      await saveFetchedData(TABLE, rows, { protectUnsynced: true });
      if (active) setTransactions((prev) => mergeRows(prev, rows));
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
        const { rows, hitCap } = await fetchTransactionsSince(watermark);
        if (hitCap) {
          // The delta hit the page cap, meaning the watermark boundary may not
          // be clean. Pull the full history once rather than risk skipping rows
          // at the page boundary, then record a confirmed checkpoint.
          const full = await paginateAllTransactions();
          await commit(full);
          const max = maxTimestamp(full);
          if (max) watermark = max;
          return;
        }
        await commit(rows);
        const max = maxTimestamp(rows);
        if (max && new Date(max).getTime() > new Date(watermark).getTime()) {
          watermark = max;
        }
      } catch (error) {
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
        removeLocalRows(TABLE, (row) => String(row.id) === String(id));
        if (active) setTransactions((prev) => prev.filter((row) => String(row.id) !== String(id)));
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