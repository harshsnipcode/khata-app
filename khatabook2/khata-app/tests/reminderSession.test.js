import test from "node:test";
import assert from "node:assert/strict";
import {
  REIMINDER_SESSION_STORAGE_KEY,
  getReminderSessionSnapshot,
  saveReminderSessionSnapshot,
  clearReminderSessionSnapshot,
} from "../src/lib/reminderSession.js";

function installSessionStorageMock() {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test("bulk reminder session snapshot can be restored across browser app remounts", () => {
  installSessionStorageMock();

  const payload = {
    selectedIds: [101, 102, 103],
    sessionQueue: [101, 102, 103],
    sessionIndex: 1,
    sessionDone: false,
    startedAt: Date.now(),
    active: true,
  };

  saveReminderSessionSnapshot(payload);

  const restored = getReminderSessionSnapshot();

  assert.equal(restored.active, true);
  assert.deepEqual(restored.selectedIds, [101, 102, 103]);
  assert.deepEqual(restored.sessionQueue, [101, 102, 103]);
  assert.equal(restored.sessionIndex, 1);
  assert.equal(restored.sessionDone, false);
  assert.equal(restored.storageKey, REIMINDER_SESSION_STORAGE_KEY);

  clearReminderSessionSnapshot();
  assert.equal(getReminderSessionSnapshot(), null);
});
