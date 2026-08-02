import test from "node:test";
import assert from "node:assert/strict";
import { groupLedgerByBusinessDate } from "../src/lib/transactionOrder.js";

const txn = (id, created, activity, type = "got", amount = 100) => ({
  id,
  type,
  amount,
  created_at: created,
  activity_at: activity,
});

test("orders normal same-day transactions newest-first", () => {
  const rows = [
    { ...txn(1, "2026-07-29T10:23:00+00:00", "2026-07-29T10:23:00+00:00"), balance: 1 },
    { ...txn(2, "2026-07-29T12:47:00+00:00", "2026-07-29T12:47:00+00:00"), balance: 2 },
    { ...txn(3, "2026-07-29T20:41:00+00:00", "2026-07-29T20:41:00+00:00"), balance: 3 },
    { ...txn(4, "2026-07-29T20:49:00+00:00", "2026-07-29T20:49:00+00:00"), balance: 4 },
    { ...txn(5, "2026-07-29T22:01:00+00:00", "2026-07-29T22:01:00+00:00"), balance: 5 },
  ];
  assert.deepEqual(
    groupLedgerByBusinessDate(rows).map((t) => t.id),
    [5, 4, 3, 2, 1]
  );
});

test("floats a backdated entry above normal same-day entries", () => {
  const rows = [
    { ...txn(1, "2026-07-29T10:23:00+00:00", "2026-07-29T10:23:00+00:00"), balance: 1 },
    { ...txn(2, "2026-07-29T12:47:00+00:00", "2026-07-29T12:47:00+00:00"), balance: 2 },
    { ...txn(3, "2026-07-29T22:01:00+00:00", "2026-08-01T22:01:00+00:00"), balance: 3 },
  ];
  assert.deepEqual(
    groupLedgerByBusinessDate(rows).map((t) => t.id),
    [3, 2, 1]
  );
});

test("breaks activity-at ties with the creation time for newest-first order", () => {
  const rows = [
    { ...txn(1, "2026-07-31T04:53:00+00:00", "2026-08-01T13:41:34+00:00"), balance: 1 },
    { ...txn(2, "2026-07-31T15:21:00+00:00", "2026-08-01T13:41:34+00:00"), balance: 2 },
    { ...txn(3, "2026-07-31T17:04:00+00:00", "2026-08-01T13:41:34+00:00"), balance: 3 },
  ];
  assert.deepEqual(
    groupLedgerByBusinessDate(rows).map((t) => t.id),
    [3, 2, 1]
  );
});

test("groups by business date, newest date first", () => {
  const rows = [
    { ...txn(1, "2026-07-28T10:00:00+00:00", "2026-07-28T10:00:00+00:00"), balance: 1 },
    { ...txn(2, "2026-07-30T10:00:00+00:00", "2026-07-30T10:00:00+00:00"), balance: 2 },
    { ...txn(3, "2026-07-29T10:00:00+00:00", "2026-07-29T10:00:00+00:00"), balance: 3 },
  ];
  assert.deepEqual(
    groupLedgerByBusinessDate(rows).map((t) => t.id),
    [2, 3, 1]
  );
});
