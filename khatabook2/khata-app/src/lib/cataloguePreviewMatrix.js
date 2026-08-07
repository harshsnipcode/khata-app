import { localDateKey } from "./dateKey.js";

export function normalizeMatrixLookupKey(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

export function buildDistributionMatrixGrid(data, selectedDate) {
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const products = Array.isArray(data?.products) ? data.products : [];
  const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
  const transactionItems = Array.isArray(data?.transactionItems) ? data.transactionItems : [];

  const customerMap = new Map();
  customers.forEach((customer) => {
    const idKey = normalizeMatrixLookupKey(customer?.id);
    const localUuidKey = normalizeMatrixLookupKey(customer?.local_uuid);
    if (idKey) customerMap.set(idKey, customer);
    if (localUuidKey) customerMap.set(localUuidKey, customer);
  });

  const productMap = new Map();
  products.forEach((product) => {
    const idKey = normalizeMatrixLookupKey(product?.id);
    const localUuidKey = normalizeMatrixLookupKey(product?.local_uuid);
    if (idKey) productMap.set(idKey, product);
    if (localUuidKey) productMap.set(localUuidKey, product);
  });

  const filteredTransactions = transactions.filter((txn) => {
    const txnDate = localDateKey(txn?.created_at || txn?.date);
    return txnDate === selectedDate;
  });

  const transactionMap = new Map();
  filteredTransactions.forEach((txn) => {
    const idKey = normalizeMatrixLookupKey(txn?.id);
    const localUuidKey = normalizeMatrixLookupKey(txn?.local_uuid);
    if (idKey) transactionMap.set(idKey, txn);
    if (localUuidKey) transactionMap.set(localUuidKey, txn);
  });

  const grid = {};

  transactionItems.forEach((item) => {
    const itemTxnKey = normalizeMatrixLookupKey(item?.transaction_id);
    if (!itemTxnKey || !transactionMap.has(itemTxnKey)) return;

    const txn = transactionMap.get(itemTxnKey);
    if (!txn) return;

    const customerKey = normalizeMatrixLookupKey(txn?.customer_id);
    const customer = customerMap.get(customerKey);
    if (!customer) return;

    const productKey = normalizeMatrixLookupKey(item?.product_id);
    const product = productMap.get(productKey);
    if (!product) return;

    const rowCustomerKey = normalizeMatrixLookupKey(customer?.id) || normalizeMatrixLookupKey(customer?.local_uuid);
    const columnProductKey = normalizeMatrixLookupKey(product?.id) || normalizeMatrixLookupKey(product?.local_uuid);

    if (!rowCustomerKey || !columnProductKey) return;

    grid[rowCustomerKey] ||= {};
    grid[rowCustomerKey][columnProductKey] = (grid[rowCustomerKey][columnProductKey] || 0) + Number(item.quantity || 0);
  });

  return {
    grid,
    customers: [...customers],
    products: [...products],
  };
}
