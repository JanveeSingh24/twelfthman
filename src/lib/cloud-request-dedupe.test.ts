import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCloudRequestDedupeForTests,
  completeCloudRequest,
  markCloudRequestUnknown,
  releaseCloudRequest,
  reserveCloudRequest,
} from "./cloud-request-dedupe.ts";

test("deduplicates in-flight and recently completed cloud requests", () => {
  clearCloudRequestDedupeForTests();
  assert.equal(reserveCloudRequest("request-1", 0), true);
  assert.equal(reserveCloudRequest("request-1", 1), false);
  completeCloudRequest("request-1", 2);
  assert.equal(reserveCloudRequest("request-1", 3), false);
  assert.equal(reserveCloudRequest("request-1", 11 * 60 * 1000), true);
});

test("allows retry after an in-flight request fails", () => {
  clearCloudRequestDedupeForTests();
  assert.equal(reserveCloudRequest("request-2"), true);
  releaseCloudRequest("request-2");
  assert.equal(reserveCloudRequest("request-2"), true);
});

test("suppresses retry while an ambiguous outcome tombstone is active", () => {
  clearCloudRequestDedupeForTests();
  assert.equal(reserveCloudRequest("request-3", 0), true);
  markCloudRequestUnknown("request-3", 1);
  assert.equal(reserveCloudRequest("request-3", 2), false);
  assert.equal(reserveCloudRequest("request-3", 11 * 60 * 1000), true);
});