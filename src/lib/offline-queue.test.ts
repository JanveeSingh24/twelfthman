import assert from "node:assert/strict";
import test from "node:test";

import { createCloudEnvelopeDraft } from "./cloud-envelope.ts";
import {
  CLOUD_QUEUE_KEY,
  enqueueCloudEnvelope,
  markCloudQueueReadyForReview,
  markCloudQueueReviewing,
  markCloudQueueReady,
  readCloudQueue,
  removeCloudQueueItem,
  writeCloudQueue,
} from "./offline-queue.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const DRAFT = createCloudEnvelopeDraft({
  taskClass: "reason",
  evidence: "[PROTECTED_TERM_1] passed the load test.",
  sourceTokensEstimate: 800,
  evidenceTokensEstimate: 12,
  categories: ["protected-term"],
  matchCount: 1,
});

test("queues only a sanitized envelope without send consent", () => {
  const queue = enqueueCloudEnvelope([], DRAFT, "queue-1", "2026-09-12T12:00:00.000Z", 0.42, true);
  const serialized = JSON.stringify(queue);

  assert.equal("consent" in queue[0].envelope, false);
  assert.doesNotMatch(serialized, /prompt|context|Raw sensitive content/);
  assert.equal(queue[0].status, "pending-connectivity");
});

test("persists valid drafts and discards malformed queue entries", () => {
  const storage = memoryStorage();
  const queue = enqueueCloudEnvelope([], DRAFT, "queue-1", "2026-09-12T12:00:00.000Z", 0.42, true);
  writeCloudQueue(queue, storage);
  assert.deepEqual(readCloudQueue(storage), queue);

  storage.setItem(CLOUD_QUEUE_KEY, JSON.stringify([{ ...queue[0], envelope: { ...DRAFT, prompt: "raw" } }]));
  assert.deepEqual(readCloudQueue(storage), []);

  storage.setItem(CLOUD_QUEUE_KEY, JSON.stringify([{
    ...queue[0],
    envelope: { ...DRAFT, consent: { approved: true, approvedAt: "2026-09-12T12:00:00.000Z" } },
  }]));
  assert.deepEqual(readCloudQueue(storage), []);
});

test("reconnection marks work for review and removal is explicit", () => {
  const pending = enqueueCloudEnvelope([], DRAFT, "queue-1", "2026-09-12T12:00:00.000Z", 0.42, true);
  const ready = markCloudQueueReady(pending);

  assert.equal(ready[0].status, "ready-for-review");
  const reviewing = markCloudQueueReviewing(ready, "queue-1");
  assert.equal(reviewing[0].status, "reviewing");
  assert.equal(markCloudQueueReadyForReview(reviewing, "queue-1")[0].status, "ready-for-review");
  assert.deepEqual(removeCloudQueueItem(reviewing, "queue-1"), []);
});

test("opening a review returns any previous reviewer to ready", () => {
  const pending = enqueueCloudEnvelope(
    enqueueCloudEnvelope([], DRAFT, "queue-1", "2026-09-12T12:00:00.000Z", 0.42, true),
    DRAFT,
    "queue-2",
    "2026-09-12T12:01:00.000Z",
    0.45,
    false,
  );
  const firstReview = markCloudQueueReviewing(markCloudQueueReady(pending), "queue-1");
  const secondReview = markCloudQueueReviewing(firstReview, "queue-2");

  assert.equal(secondReview.find(({ id }) => id === "queue-1")?.status, "ready-for-review");
  assert.equal(secondReview.find(({ id }) => id === "queue-2")?.status, "reviewing");
  assert.equal(secondReview.filter(({ status }) => status === "reviewing").length, 1);
});

test("reload normalizes transient reviewing state back to ready", () => {
  const storage = memoryStorage();
  const reviewing = markCloudQueueReviewing(
    markCloudQueueReady(enqueueCloudEnvelope([], DRAFT, "queue-1", "2026-09-12T12:00:00.000Z", 0.42, true)),
    "queue-1",
  );
  writeCloudQueue(reviewing, storage);

  assert.equal(readCloudQueue(storage)[0].status, "ready-for-review");
});