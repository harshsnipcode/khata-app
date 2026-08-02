import { localDateKey } from "./dateKey.js";

// Single source of truth for ordering transactions by activity.
//
// `activity_at` holds the real system time when the transaction was created or
// last edited; `created_at` holds the business date chosen by the user. Ordering
// must always use the activity timestamp, while display keeps the business date.
export function activityTimestamp(txn) {
  return new Date(txn.activity_at || txn.created_at).getTime();
}

// The user-chosen business date (the date shown on the transaction card).
function businessDateKey(txn) {
  return localDateKey(txn.created_at || txn.date);
}

// A transaction is backdated when its activity date (when it was actually
// created/last edited) is later than the business date the user picked.
function isBackdated(txn) {
  return localDateKey(txn.activity_at || txn.created_at) > businessDateKey(txn);
}

// Newest activity first; ties (e.g. a bulk backfill that stamped every row with
// the same activity_at) fall back to the business-date creation time so that
// same-day entries still show newest-first instead of staying in old order.
function compareByActivityDesc(a, b) {
  const diff = activityTimestamp(b) - activityTimestamp(a);
  if (diff !== 0) return diff;
  return new Date(b.created_at || b.date) - new Date(a.created_at || a.date);
}

// Takes ledger rows (already in business-date ascending order, with the running
// balance computed) and returns them grouped by business date, newest date
// first. Within each date group genuinely backdated entries (user-chosen date
// earlier than the actual entry date) float above the normal same-day entries;
// normal entries are newest-first and backdated ones are newest-first too.
export function groupLedgerByBusinessDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const dateKey = businessDateKey(row);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(row);
  }

  const grouped = [];
  for (const dateKey of [...byDate.keys()].sort().reverse()) {
    const group = byDate.get(dateKey);
    grouped.push(
      ...group.filter(isBackdated).sort(compareByActivityDesc),
      ...group.filter((t) => !isBackdated(t)).sort(compareByActivityDesc)
    );
  }
  return grouped;
}

function activityDateKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Splits an already-sorted customer list into those whose latest activity
// happened today (calendar date) and those whose latest activity is older.
// Uses the exact same latest-activity value used for sorting.
export function splitByTodayActivity(customers, lastActivityMap) {
  const todayKey = activityDateKey(new Date());
  const today = [];
  const older = [];
  for (const customer of customers) {
    const ts = lastActivityMap[customer.id] || customer.updated_at || customer.created_at;
    if (ts && activityDateKey(ts) === todayKey) today.push(customer);
    else older.push(customer);
  }
  return { today, older };
}
