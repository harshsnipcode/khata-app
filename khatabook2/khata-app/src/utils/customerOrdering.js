export function getCustomerPosition(customer) {
  const position = Number(customer?.route_position);
  return Number.isFinite(position) && position > 0 ? position : Number.MAX_SAFE_INTEGER;
}

export function sortCustomersByRoutePosition(customers = []) {
  return [...customers].sort((a, b) => {
    const positionDiff = getCustomerPosition(a) - getCustomerPosition(b);
    if (positionDiff !== 0) return positionDiff;
    return (a.name || "").localeCompare(b.name || "");
  });
}

export function moveCustomerToPosition(customers, customerId, nextPosition) {
  const ordered = sortCustomersByRoutePosition(customers);
  const fromIndex = ordered.findIndex((customer) => String(customer.id) === String(customerId));
  if (fromIndex === -1) return ordered;

  const clampedPosition = Math.min(
    Math.max(Number(nextPosition) || 1, 1),
    ordered.length,
  );
  const [selectedCustomer] = ordered.splice(fromIndex, 1);
  ordered.splice(clampedPosition - 1, 0, selectedCustomer);

  return ordered.map((customer, index) => ({
    ...customer,
    route_position: index + 1,
  }));
}

export async function persistCustomerOrder(offlineSupabase, orderedCustomers) {
  const results = await Promise.all(orderedCustomers.map((customer, index) => (
    offlineSupabase
      .from("customers")
      .update({ route_position: index + 1 })
      .eq("id", customer.id)
  )));
  const failed = results.find((result) => result?.error);
  if (failed) throw failed.error;
}
