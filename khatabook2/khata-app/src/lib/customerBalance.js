import { offlineSupabase } from "./offline/offlineSupabase";

const PAGE_SIZE = 1000;

/**
 * Single source of truth for customer balances.
 *
 * Every surface that displays a customer balance must use these helpers so the
 * Admin Home card, the Customer Ledger and reminder views can never drift apart.
 *
 * Semantics (identical to the Customer Ledger at /customer/:id):
 *   - a "got" transaction increases money received (reduces what you get)
 *   - every other type counts as "gave" (increases what you get)
 *   - balance = gave - got
 */

export function summarizeTransactions(transactions) {
  return (transactions || []).reduce(
    (acc, txn) => {
      if (txn.type === "got") acc.got += Number(txn.amount);
      else acc.gave += Number(txn.amount);
      return acc;
    },
    { got: 0, gave: 0 }
  );
}

export function balanceFromTransactions(transactions) {
  const { gave, got } = summarizeTransactions(transactions);
  return gave - got;
}

export function buildBalanceMap(transactions) {
  const map = {};
  for (const txn of transactions || []) {
    if (txn.customer_id === undefined || txn.customer_id === null) continue;
    if (!map[txn.customer_id]) map[txn.customer_id] = 0;
    if (txn.type === "got") map[txn.customer_id] -= Number(txn.amount);
    else map[txn.customer_id] += Number(txn.amount);
  }
  return map;
}

/**
 * Fetch every transaction for the tenant.
 *
 * Supabase caps a single REST response at 1000 rows, so unbounded selects
 * silently drop the oldest transactions. Customer balances must always be
 * computed over the complete set, so page through the whole table.
 */
export async function fetchAllTransactions() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await offlineSupabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
