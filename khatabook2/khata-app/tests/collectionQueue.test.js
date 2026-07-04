import test from "node:test";
import assert from "node:assert/strict";
import { applyCollectionQueue } from "../src/lib/collectionQueue.js";

const customers = [
  { id: 3, name: "Harsh", route_position: 3 },
  { id: 1, name: "Rahul", route_position: 1 },
  { id: 2, name: "Sneha", route_position: 2 },
];

test("keeps the configured collection route before any visits", () => {
  assert.deepEqual(applyCollectionQueue(customers, []).map((c) => c.name), [
    "Rahul", "Sneha", "Harsh",
  ]);
});

test("places visited customers at the bottom in visit order", () => {
  assert.deepEqual(applyCollectionQueue(customers, ["1", "2"]).map((c) => c.name), [
    "Harsh", "Rahul", "Sneha",
  ]);
});

test("ignores stale queue entries without changing the route", () => {
  assert.deepEqual(applyCollectionQueue(customers, ["99", "1"]).map((c) => c.name), [
    "Sneha", "Harsh", "Rahul",
  ]);
});
