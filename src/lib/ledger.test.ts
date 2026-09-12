import assert from "node:assert/strict";
import test from "node:test";

import { summarizeLedger, type LedgerEntry } from "./ledger.ts";

const ENTRIES: LedgerEntry[] = [
  { id: "1", createdAt: "2026-09-12T12:00:00.000Z", taskClass: "summarize", route: "local", engine: "qwen2.5-0.5b-instruct-openvino-gpu", localSuitability: 0.92, inputTokens: 400, sentTokens: 0, latencyMs: 900, sensitiveOverride: false },
  { id: "2", createdAt: "2026-09-12T12:01:00.000Z", taskClass: "reason", route: "cloud", engine: "azure-openai-responses", localSuitability: 0.43, inputTokens: 600, sentTokens: 80, latencyMs: 2400, sensitiveOverride: true },
];

test("separates estimated local savings from actual cloud usage", () => {
  const summary = summarizeLedger(ENTRIES);

  assert.equal(summary.total, 2);
  assert.equal(summary.localShare, 50);
  assert.equal(summary.estimatedAvoidedTokens, 920);
  assert.equal(summary.actualCloudInputTokens, 80);
  assert.equal("savedUsd" in summary, false);
});