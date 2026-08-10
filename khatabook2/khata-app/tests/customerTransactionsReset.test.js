import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultCustomerTransactionsFilters } from "../src/lib/reportFilters.js";

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
