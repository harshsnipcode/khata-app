// Single source of truth for ordering transactions by activity.
//
// `activity_at` holds the real system time when the transaction was created or
// last edited; `created_at` holds the business date chosen by the user. Ordering
// must always use the activity timestamp, while display keeps the business date.
export function activityTimestamp(txn) {
  return new Date(txn.activity_at || txn.created_at).getTime();
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
