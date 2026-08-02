import test from "node:test";
import assert from "node:assert/strict";
import { groupLedgerByBusinessDate } from "../src/lib/transactionOrder.js";

const txn = (id, created, activity, date, type = "got", amount = 100) => ({
  id,
  type,
  amount,
  created_at: created,
  activity_at: activity,
  date,
});

test("orders normal same-day transactions newest-first", () => {
  const rows = [
    { ...txn(1, "2026-07-29T10:23:00+00:00", "2026-07-29T10:23:00+00:00", "2026-07-29"), balance: 1 },
    { ...txn(2, "2026-07-29T12:47:00+00:00", "2026-07-29T12:47:00+00:00", "2026-07-29"), balance: 2 },
    { ...txn(3, "2026-07-29T20:41:00+00:00", "2026-07-29T20:41:00+00:00", "2026-07-29"), balance: 3 },
    { ...txn(4, "2026-07-29T20:49:00+00:00", "2026-07-29T20:49:00+00:00", "2026-07-29"), balance: 4 },
    { ...txn(5, "2026-07-29T22:01:00+00:00", "2026-07-29T22:01:00+00:00", "2026-07-29"), balance: 5 },
  ];
  assert.deepEqual(
    groupLedgerByBusinessDate(rows).map((t) => t.id),
    [5, 4, 3, 2, 1]
  );
});

test("floats a backdated entry above normal same-day entries", () => {
  const rows = [
    { ...txn(1, "2026-07-29T10:23:00+00:00", "2026-07-29T10:23:00+00:00", "2026-07-29"), balance: 1 },
    { ...txn(2, "2026-07-29T12:47:00+00:00", "2026-07-29T12:47:00+00:00", "2026-07-29"), balance: 2 },
    { ...txn(3, "2026-07-29T22:01:00+00:00", "2026-08-01T22:01:00+00:00", "2026-08-01"), balance: 3 },
  ];
  assert.deepEqual(
    groupLedgerByBusinessDate(rows).map((t) => t.id),
    [3, 2, 1]
  );
});

test("editing a transaction does not change its ledger position", () => {
  const before = [
    { ...txn(1, "2026-08-01T01:30:00+00:00", "2026-08-01T01:30:00+00:00", "2026-08-01"), balance: 1 },
    { ...txn(2, "2026-08-01T09:30:00+00:00", "2026-08-01T09:30:00+00:00", "2026-08-01"), balance: 2 },
  ];
  const beforeOrder = groupLedgerByBusinessDate(before).map((t) => t.id);

  const afterEdit = before.map((t) =>
    t.id === 1
      ? { ...t, amount: 250, activity_at: "2026-08-01T12:30:00+00:00" }
      : t
  );
  const afterOrder = groupLedgerByBusinessDate(afterEdit).map((t) => t.id);

  assert.deepEqual(beforeOrder, [2, 1]);
  assert.deepEqual(afterOrder, beforeOrder);
});

test("editing on a later day does not flip a normal entry into backdated", () => {
  const rows = [
    { ...txn(1, "2026-08-01T01:30:00+00:00", "2026-08-01T01:30:00+00:00", "2026-08-01"), balance: 1 },
    { ...txn(2, "2026-08-01T09:30:00+00:00", "2026-08-01T09:30:00+00:00", "2026-08-01"), balance: 2 },
  ];
  const editedLater = rows.map((t) =>
    t.id === 1
      ? { ...t, activity_at: "2026-08-02T12:30:00+00:00" }
      : t
  );
  assert.deepEqual(
    groupLedgerByBusinessDate(editedLater).map((t) => t.id),
    [2, 1]
  );
});

test("groups by business date, newest date first", () => {
  const rows = [
    { ...txn(1, "2026-07-28T10:00:00+00:00", "2026-07-28T10:00:00+00:00", "2026-07-28"), balance: 1 },
    { ...txn(2, "2026-07-30T10:00:00+00:00", "2026-07-30T10:00:00+00:00", "2026-07-30"), balance: 2 },
    { ...txn(3, "2026-07-29T10:00:00+00:00", "2026-07-29T10:00:00+00:00", "2026-07-29"), balance: 3 },
  ];
  assert.deepEqual(
    groupLedgerByBusinessDate(rows).map((t) => t.id),
    [2, 3, 1]
  );
});
