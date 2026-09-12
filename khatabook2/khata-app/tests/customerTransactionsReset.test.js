import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultCustomerTransactionsFilters } from "../src/lib/reportFilters.js";
import { filterCustomerTransactionsForLedger } from "../src/lib/customerLedgerNavigation.js";

test("customer transactions reset defaults pick the local single-day date and clear search", () => {
  const date = new Date(2026, 7, 10, 13, 0, 0);
  const defaults = createDefaultCustomerTransactionsFilters(date);

  assert.equal(defaults.durationFilter, "single_day");
  assert.equal(defaults.singleDay, "2026-08-10");
  assert.equal(defaults.startDate, "2026-08-10");
  assert.equal(defaults.endDate, "2026-08-10");
  assert.equal(defaults.searchTerm, "");
  assert.equal(defaults.paymentFilter, null);
});

test("home navigation reuses already-loaded customer transactions without refetching", () => {
  const transactions = [
    { id: 1, customer_id: 28, type: "gave", amount: 100 },
    { id: 2, customer_id: 29, type: "got", amount: 50 },
    { id: 3, customer_id: 28, type: "got", amount: 25 },
    { id: 4, customer_id: 28, type: "gave", amount: 75 },
  ];

  const ledgerTransactions = filterCustomerTransactionsForLedger(28, transactions);

  assert.deepEqual(ledgerTransactions.map((txn) => txn.id), [1, 3, 4]);
  assert.equal(ledgerTransactions.length, 3);
  assert.ok(ledgerTransactions.every((txn) => String(txn.customer_id) === "28"));
});
