import { localDateKey } from "./dateKey.js";

// Ledger ordering must depend ONLY on the transaction's own chronology so that
// editing a transaction never moves it above or below its neighbours.
//   * `created_at` holds the business date + the original entry time-of-day; it
//     keeps the original time-of-day when a transaction is edited.
//   * `date` records the day the row was actually created and is never touched
//     by edits, so it is the edit-stable signal for backdated detection.
// Customer activity (`activity_at`) deliberately plays no part here; it is only
// used for home-page ordering (AdminHome/EmployeeHome).

// The user-chosen business date (the date shown on the transaction card).
function businessDateKey(txn) {
  return localDateKey(txn.created_at || txn.date);
}

// The day the transaction was first entered. Prefers the immutable `date`
// column; falls back to the original creation timestamp for locally-created
// rows that have not been synced to the server yet.
function entryDateKey(txn) {
  return localDateKey(txn.date || txn.activity_at || txn.created_at);
}

// A transaction is backdated when it was entered for a business date earlier
// than the day it was actually entered. Using `date` (never updated on edit)
// keeps a plain edit from flipping a transaction into/out of the backdated
// group and reshuffling the ledger.
function isBackdated(txn) {
  return entryDateKey(txn) > businessDateKey(txn);
}

// Newest entry first by the original transaction timestamp. Editing only bumps
// `activity_at`, which is ignored here, so the relative order never changes.
function compareByCreatedDesc(a, b) {
  return new Date(b.created_at || b.date) - new Date(a.created_at || a.date);
}

// Takes ledger rows (already in business-date ascending order, with the running
// balance computed) and returns them grouped by business date, newest date
// first. Within each date group genuinely backdated entries (business date
// earlier than the day they were entered) float above the normal same-day
// entries; both normal and backdated entries are newest-first by their original
// creation time.
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
      ...group.filter(isBackdated).sort(compareByCreatedDesc),
      ...group.filter((t) => !isBackdated(t)).sort(compareByCreatedDesc)
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
