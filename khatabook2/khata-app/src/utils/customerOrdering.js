const FALLBACK = Number.MAX_SAFE_INTEGER;

// ── helpers ──────────────────────────────────────────────────────────────────
function getPosition(customer, field) {
  const n = Number(customer?.[field]);
  return Number.isFinite(n) && n > 0 ? n : FALLBACK;
}

function sortCustomersByField(customers, field) {
  return [...customers].sort((a, b) => {
    const diff = getPosition(a, field) - getPosition(b, field);
    if (diff !== 0) return diff;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function moveCustomerToFieldPosition(customers, customerId, nextPosition, field) {
  const ordered = sortCustomersByField(customers, field);
  const fromIndex = ordered.findIndex((c) => String(c.id) === String(customerId));
  if (fromIndex === -1) return ordered;

  const clamped = Math.min(Math.max(Number(nextPosition) || 1, 1), ordered.length);
  const [picked] = ordered.splice(fromIndex, 1);
  ordered.splice(clamped - 1, 0, picked);

  return ordered.map((c, i) => ({
    ...c,
    [field]: i + 1,
  }));
}

async function persistFieldOrder(offlineSupabase, orderedCustomers, field) {
  const results = await Promise.all(
    orderedCustomers.map((c, i) =>
      offlineSupabase.from("customers").update({ [field]: i + 1 }).eq("id", c.id),
    ),
  );
  const failed = results.find((r) => r?.error);
  if (failed) throw failed.error;
}

// ── Distribution Matrix ordering (matrix_position) ──────────────────────────
export function getMatrixPosition(customer) {
  return getPosition(customer, "matrix_position");
}

export function sortCustomersByMatrix(customers = []) {
  return sortCustomersByField(customers, "matrix_position");
}

export function moveCustomerToMatrixPosition(customers, customerId, nextPosition) {
  return moveCustomerToFieldPosition(customers, customerId, nextPosition, "matrix_position");
}

export async function persistMatrixOrder(offlineSupabase, orderedCustomers) {
  return persistFieldOrder(offlineSupabase, orderedCustomers, "matrix_position");
}

// ── Collection Route ordering (collection_position) ─────────────────────────
export function getCollectionPosition(customer) {
  return getPosition(customer, "collection_position");
}

export function sortCustomersByCollection(customers = []) {
  return sortCustomersByField(customers, "collection_position");
}

export function moveCustomerToCollectionPosition(customers, customerId, nextPosition) {
  return moveCustomerToFieldPosition(customers, customerId, nextPosition, "collection_position");
}

export async function persistCollectionOrder(offlineSupabase, orderedCustomers) {
  return persistFieldOrder(offlineSupabase, orderedCustomers, "collection_position");
}

// ── Legacy aliases (for any code still referencing the old names) ────────────
export const getCustomerPosition = getCollectionPosition;
export const sortCustomersByRoutePosition = sortCustomersByCollection;
export const moveCustomerToPosition = (customers, id, pos) =>
  moveCustomerToCollectionPosition(customers, id, pos);
export const persistCustomerOrder = persistCollectionOrder;
