import assert from "node:assert/strict";
import { test, mock } from "node:test";

mock.module("../src/lib/supabase", {
  namedExports: {
    supabase: {
      from: () => ({}),
      auth: {},
      storage: {},
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  },
});
mock.module("../src/lib/perf", {
  namedExports: { recordQueryTiming: () => {}, recordRouteChange: () => {} },
});

const { runPostTransactionSaveTasks } = await import("../src/lib/transactionPostSave.js");
const { loadTransactionRecyclePayload } = await import("../src/lib/transactionDeleteRecycle.js");

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function queryResult(result, onStart) {
  const builder = {
    select: () => builder,
    update: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: () => builder,
    single: () => builder,
    then: (resolve, reject) => {
      onStart?.();
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

test("post-save tasks execute collection update, customer touch, and SMS preparation", async () => {
  const calls = [];
  const client = {
    from(table) {
      if (table === "business_settings") {
        return queryResult({ data: { settings: { collection_mode_enabled: true } }, error: null });
      }
      if (table === "customers") {
        return { update: () => queryResult({ data: [{ id: 7 }], error: null }) };
      }
      if (table === "transactions") {
        return queryResult({
          data: [
            { type: "gave", amount: 500 },
            { type: "got", amount: 125 },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  await runPostTransactionSaveTasks({
    customerId: 7,
    customer: { name: "Customer 7", phone: "+91 99999 00000", auto_sms_enabled: true },
    client,
    loadTemplate: async () => "Hi {{customerName}} {{balance}} {{balanceType}} {{businessName}}",
    renderTemplate: (template, values) => {
      calls.push(["template", values]);
      return template.replace("{{customerName}}", values.customerName);
    },
    moveToQueueEnd: (customerId) => calls.push(["queue", customerId]),
    openSms: (phone, text) => calls.push(["sms", phone, text]),
    buildLedgerLink: (customerId) => `https://example.test/share/customer/${customerId}`,
    storage: { getItem: () => "Test Dairy" },
  });

  assert.deepEqual(calls[0], ["queue", 7]);
  assert.equal(calls[1][0], "template");
  assert.equal(calls[1][1].balance, 375);
  assert.equal(calls[1][1].balanceType, "You Will Get");
  assert.equal(calls[2][0], "sms");
  assert.equal(calls[2][1], "919999900000");
});

test("transaction recycle payload starts transaction and item fetches in parallel", async () => {
  const order = [];
  const transactionFetch = createDeferred();
  const itemsFetch = createDeferred();
  const client = {
    from(table) {
      if (table === "transactions") {
        return queryResult(transactionFetch.promise, () => order.push("transaction-start"));
      }
      if (table === "transaction_items") {
        return queryResult(itemsFetch.promise, () => order.push("items-start"));
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const payloadPromise = loadTransactionRecyclePayload({
    transactionId: 123,
    currentTransaction: { id: 123, amount: 10 },
    client,
  });
  await Promise.resolve();

  assert.deepEqual(order, ["transaction-start", "items-start"]);

  itemsFetch.resolve({ data: [{ id: 1, transaction_id: 123 }], error: null });
  transactionFetch.resolve({ data: { id: 123, amount: 50 }, error: null });
  const payload = await payloadPromise;

  assert.equal(payload.fullTransaction.amount, 50);
  assert.deepEqual(payload.transactionToStore.transaction_items, [{ id: 1, transaction_id: 123 }]);
});
