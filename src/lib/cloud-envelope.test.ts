import assert from "node:assert/strict";
import test from "node:test";

import { createCloudEnvelope, createCloudEnvelopeDraft, parseCloudEnvelope, validateCloudEnvelopeConsent, type CloudEnvelope } from "./cloud-envelope.ts";

const VALID_ENVELOPE: CloudEnvelope = {
  version: 2,
  requestId: "11111111-1111-4111-8111-111111111111",
  taskClass: "reason",
  instruction: "Compare the trade-offs and recommend a path forward.",
  evidence: "The proposed option passed load testing. Contact [REDACTED_EMAIL_1].",
  sourceTokensEstimate: 800,
  evidenceTokensEstimate: 22,
  redaction: { categories: ["email"], matchCount: 1 },
  consent: { approved: true, approvedAt: "2026-09-12T12:00:00.000Z", contentHash: "0".repeat(64) },
};

test("accepts a minimal sanitized cloud envelope", () => {
  const result = parseCloudEnvelope(VALID_ENVELOPE);

  assert.equal(result.ok, true);
});

test("creates an envelope without raw prompt or context fields", async () => {
  const envelope = await createCloudEnvelope({
    taskClass: "reason",
    requestId: "22222222-2222-4222-8222-222222222222",
    evidence: "Only selected evidence",
    sourceTokensEstimate: 500,
    evidenceTokensEstimate: 12,
    categories: [],
    matchCount: 0,
    approvedAt: "2026-09-12T12:00:00.000Z",
  });
  const serialized = JSON.stringify(envelope);

  assert.equal("prompt" in envelope, false);
  assert.equal("context" in envelope, false);
  assert.doesNotMatch(serialized, /Raw sensitive content/);
});

test("rejects raw prompt and context fields", () => {
  for (const forbiddenField of ["prompt", "context"]) {
    const result = parseCloudEnvelope({
      ...VALID_ENVELOPE,
      [forbiddenField]: "Raw sensitive content",
    });

    assert.deepEqual(result, {
      ok: false,
      error: `Unexpected cloud envelope field: ${forbiddenField}.`,
    });
  }
});

test("requires explicit, timestamped consent", () => {
  const result = parseCloudEnvelope({
    ...VALID_ENVELOPE,
    consent: { approved: false, approvedAt: "2026-09-12T12:00:00.000Z", contentHash: "0".repeat(64) },
  });

  assert.deepEqual(result, { ok: false, error: "Explicit cloud consent is required." });
});

test("binds fresh consent to the exact reviewed draft", async () => {
  const now = Date.parse("2026-09-12T12:00:00.000Z");
  const draft = createCloudEnvelopeDraft({
    taskClass: "reason",
    requestId: "33333333-3333-4333-8333-333333333333",
    instruction: "Requested focus: compare options.",
    evidence: "Only selected evidence",
    sourceTokensEstimate: 500,
    evidenceTokensEstimate: 12,
    categories: [],
    matchCount: 0,
  });
  const approved = await createCloudEnvelope({
    taskClass: draft.taskClass,
    instruction: draft.instruction,
    evidence: draft.evidence,
    sourceTokensEstimate: draft.sourceTokensEstimate,
    evidenceTokensEstimate: draft.evidenceTokensEstimate,
    categories: draft.redaction.categories,
    matchCount: draft.redaction.matchCount,
    approvedAt: new Date(now).toISOString(),
  });

  assert.equal((await validateCloudEnvelopeConsent(approved, now)).ok, true);
  assert.deepEqual(await validateCloudEnvelopeConsent({ ...approved, evidence: "Changed" }, now), {
    ok: false,
    error: "Cloud envelope changed after approval.",
  });
  assert.deepEqual(await validateCloudEnvelopeConsent(approved, now + 11 * 60 * 1000), {
    ok: false,
    error: "Cloud consent has expired or is dated in the future.",
  });
});