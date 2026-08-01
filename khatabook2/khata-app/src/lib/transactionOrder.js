// Single source of truth for ordering transactions by activity.
//
// `activity_at` holds the real system time when the transaction was created or
// last edited; `created_at` holds the business date chosen by the user. Ordering
// must always use the activity timestamp, while display keeps the business date.
export function activityTimestamp(txn) {
  return new Date(txn.activity_at || txn.created_at).getTime();
}
