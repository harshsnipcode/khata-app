// Returns the LOCAL calendar date (YYYY-MM-DD) for a stored timestamp,
// matching the date shown on transaction cards (which uses local time).
// Plain "YYYY-MM-DD" keys are returned unchanged; never derive the grouping
// date from the UTC portion of a timestamp.
export function localDateKey(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
