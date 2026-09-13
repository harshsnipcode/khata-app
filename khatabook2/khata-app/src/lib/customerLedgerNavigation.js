export function filterCustomerTransactionsForLedger(customerId, transactions = []) {
  const id = String(customerId);
  return (transactions || []).filter((txn) => {
    if (String(txn?.customer_id) !== id) return false;
    if (txn?.deleted_locally) return false;
    if (txn?.deleted_at) return false;
    if (txn?.is_deleted) return false;
    return true;
  });
}

export function createCustomerLedgerNavigationState(customer, transactions = []) {
  if (!customer || customer.id === undefined || customer.id === null) return null;
  return {
    customerId: customer.id,
    customer,
    transactions: filterCustomerTransactionsForLedger(customer.id, transactions),
  };
}

export function getCustomerLedgerNavigationState(locationState) {
  const entry = locationState?.customerLedger;
  if (!entry) return null;

  const customerId = entry.customerId ?? entry.customer?.id ?? null;
  if (customerId === null || customerId === undefined) return null;

  const transactions = Array.isArray(entry.transactions)
    ? entry.transactions
    : filterCustomerTransactionsForLedger(customerId, entry.transactions || []);

  return {
    customerId,
    customer: entry.customer || null,
    transactions,
  };
}
