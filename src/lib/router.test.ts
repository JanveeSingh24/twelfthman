import assert from "node:assert/strict";
import test from "node:test";

import { buildEvidencePack, routeRequest } from "./router.ts";

test("routes routine utility work locally", () => {
  const decision = routeRequest("Summarize this update", "The release shipped on Friday.", "public");

  assert.equal(decision.route, "local");
  assert.equal(decision.taskClass, "summarize");
  assert.equal(decision.sensitivity, "public");
  assert.ok(decision.localSuitability >= 0.75);
});

test("requires explicit override before sensitive complex work can escalate", () => {
  const decision = routeRequest(
    "Analyze the architecture trade-offs",
    "CONFIDENTIAL customer design. Do not share.",
    "public",
  );

  assert.equal(decision.route, "cloud-review");
  assert.equal(decision.sensitivity, "confidential");
  assert.equal(decision.requiresSensitiveOverride, true);
});

test("creates a reduced, redacted evidence pack for complex work", () => {
  const context = `${"Routine status sentence. ".repeat(80)}Architecture risk belongs to owner@example.com. The migration strategy requires staged validation.`;
  const decision = routeRequest("Compare the architecture and migration strategy", context, "public");

  assert.equal(decision.route, "cloud-review");
  assert.ok(decision.evidenceTokens < decision.estimatedInputTokens);
  assert.match(decision.evidencePack, /\[EMAIL_1\]/);
  assert.deepEqual(decision.redactionCategories, ["email"]);
  assert.equal(decision.redactionMatchCount, 1);
});

test("evidence ranking keeps relevant sentences", () => {
  const pack = buildEvidencePack(
    "What is the launch risk?",
    "The team had lunch. Launch risk is delayed procurement. The weather is clear.",
  );

  assert.match(pack, /Launch risk is delayed procurement/);
});

test("routes to cloud review when the local model is unavailable", () => {
  const decision = routeRequest(
    "Summarize this update",
    "The release shipped on Friday.",
    "public",
    { localModelReady: false },
  );

  assert.equal(decision.route, "cloud-review");
  assert.equal(decision.localSuitability, 0);
});

test("redacts configured protected terms before cloud review", () => {
  const decision = routeRequest(
    "Analyze the architecture trade-offs",
    "Project Nightfall passed its load test. Project Nightfall has one open risk.",
    "confidential",
    { protectedTerms: ["Project Nightfall"] },
  );

  assert.equal(decision.route, "cloud-review");
  assert.doesNotMatch(decision.evidencePack, /Project Nightfall/);
  assert.match(decision.evidencePack, /\[PROTECTED_TERM_1\]/);
  assert.deepEqual(decision.redactionCategories, ["protected-term"]);
});

test("redacts identifiers before applying the outbound evidence limit", () => {
  const prefix = "Architecture ".repeat(68);
  const decision = routeRequest(
    "Analyze the architecture risk",
    `${prefix}owner@example.com is accountable for the migration risk.`,
    "public",
  );

  assert.equal(decision.route, "cloud-review");
  assert.ok(decision.evidencePack.length <= 900);
  assert.doesNotMatch(decision.evidencePack, /owner@exa|owner@example\.com/);
  assert.match(decision.evidencePack, /\[EMAIL_1\]/);
});