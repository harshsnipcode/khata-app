import assert from "node:assert/strict";
import { test } from "node:test";
import { syncStatusLabel } from "../src/lib/syncStatusLabel.js";

test("syncStatusLabel reports Offline whenever disconnected, regardless of queue", () => {
  assert.equal(syncStatusLabel({ online: false, status: "pending" }), "Offline");
  assert.equal(syncStatusLabel({ online: false, status: "synced" }), "Offline");
});

test("syncStatusLabel reports Syncing when online with pending/unflushed operations", () => {
  assert.equal(syncStatusLabel({ online: true, status: "pending" }), "Online · ⟳ Syncing...");
});

test("syncStatusLabel reports Synced only when online and the queue is clear", () => {
  assert.equal(syncStatusLabel({ online: true, status: "synced" }), "Online · ✓ Synced");
});