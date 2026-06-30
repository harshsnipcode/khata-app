import assert from "node:assert/strict";
import test from "node:test";
import { getImportLifecycle } from "../src/lib/importLifecycle.js";

test("maps import history states to the requested lifecycle badges", () => {
  assert.deepEqual(getImportLifecycle("imported"), { label: "Imported", tone: "imported" });
  assert.deepEqual(getImportLifecycle("deleted"), { label: "Deleted", tone: "deleted" });
  assert.deepEqual(getImportLifecycle("restored"), { label: "Restored", tone: "restored" });
});

test("legacy successful statuses display as Imported", () => {
  assert.equal(getImportLifecycle("completed").label, "Imported");
  assert.equal(getImportLifecycle("completed_with_errors").label, "Imported");
});
