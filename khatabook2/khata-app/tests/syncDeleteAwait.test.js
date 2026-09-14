import assert from "node:assert/strict";
import { test, mock } from "node:test";

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const state = {
  queue: [],
  events: [],
  removeDeferred: null,
};

mock.module("../src/lib/supabase", {
  namedExports: {
    supabase: {
      from(table) {
        const builder = {
          delete: () => builder,
          eq: (column, value) => {
            state.events.push(["remote-filter", table, column, value]);
            return builder;
          },
          then: (resolve, reject) => {
            state.events.push(["remote-delete"]);
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    },
  },
});

mock.module("../src/lib/offline/db", {
  namedExports: {
    OFFLINE_TABLES: [],
    SERVER_SNAPSHOT_REPLACE_TABLES: new Set(),
    ensureQueueInsertIdempotencyKeys: async () => {},
    getPendingQueue: async () => state.queue.slice(),
    getSyncWatermark: () => null,
    isOnline: () => true,
    purgeUnsupportedQueueOps: async () => [],
    removeQueueItem: async (id) => {
      state.events.push(["queue-remove", id]);
      state.queue = state.queue.filter((item) => item.id !== id);
    },
    removeLocalRows: async () => {
      state.events.push(["local-remove-start"]);
      await state.removeDeferred.promise;
      state.events.push(["local-remove-end"]);
    },
    replaceFetchedData: async () => {},
    rewriteFilters: (filters) => filters,
    rewriteForeignKeys: (payload) => payload,
    rewriteLocalId: () => {},
    saveFetchedData: async () => {},
    setSyncWatermark: () => {},
  },
});

const sync = await import("../src/lib/offline/sync.js");

async function waitForEventCount(count) {
  for (let i = 0; i < 20; i += 1) {
    if (state.events.length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("confirmed queued DELETE awaits local removal before queue removal and reconciliation", async () => {
  state.queue = [{
    id: "delete-1",
    table: "transactions",
    method: "delete",
    filters: [{ column: "id", operator: "eq", value: 123 }],
  }];
  state.events = [];
  state.removeDeferred = createDeferred();

  let settled = false;
  const syncPromise = sync.syncPendingData().then(() => {
    settled = true;
  });

  await waitForEventCount(3);

  assert.equal(settled, false);
  assert.equal(JSON.stringify(state.events), JSON.stringify([
    ["remote-filter", "transactions", "id", 123],
    ["remote-delete"],
    ["local-remove-start"],
  ]));
  assert.equal(state.queue.length, 1, "queue is not removed before local delete persistence resolves");

  state.removeDeferred.resolve();
  await syncPromise;

  assert.equal(settled, true);
  assert.equal(JSON.stringify(state.events), JSON.stringify([
    ["remote-filter", "transactions", "id", 123],
    ["remote-delete"],
    ["local-remove-start"],
    ["local-remove-end"],
    ["queue-remove", "delete-1"],
  ]));
  assert.equal(state.queue.length, 0);
});
