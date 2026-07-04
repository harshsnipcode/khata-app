const STORAGE_KEY = "khata_collection_queue";

export function getCollectionQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export function moveCustomerToCollectionQueueEnd(customerId) {
  const id = String(customerId);
  const queue = getCollectionQueue().filter((queuedId) => queuedId !== id);
  queue.push(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  return queue;
}

export function resetCollectionQueue() {
  localStorage.removeItem(STORAGE_KEY);
}

export function applyCollectionQueue(customers, queue = getCollectionQueue()) {
  const route = [...customers].sort(
    (a, b) => (a.route_position ?? 9999) - (b.route_position ?? 9999),
  );
  const customerById = new Map(route.map((customer) => [String(customer.id), customer]));
  const queuedIds = new Set(queue);

  return [
    ...route.filter((customer) => !queuedIds.has(String(customer.id))),
    ...queue.map((id) => customerById.get(String(id))).filter(Boolean),
  ];
}
