import assert from "node:assert/strict";
import test from "node:test";

import {
  getLocalEngineStatus,
  LocalModelUnavailableError,
  prepareLocalModel,
  runLocalModel,
} from "./local-engine.ts";

test("reports Foundry Local readiness without inventing a fallback", async () => {
  const unavailable = (async () => { throw new TypeError("offline"); }) as typeof fetch;
  assert.equal(await getLocalEngineStatus(unavailable), "unavailable");

  await assert.rejects(
    runLocalModel("summarize", "Summarize", "Context", {
      fetcher: (async () => Response.json({ error: "not ready" }, { status: 503 })) as typeof fetch,
    }),
    LocalModelUnavailableError,
  );
});

test("rechecks a prepared Foundry Local model", async () => {
  const fetcher = (async () => Response.json({ ready: true })) as typeof fetch;

  assert.equal(await prepareLocalModel({ fetcher }), "ready");
});

test("returns a real Foundry Local response", async () => {
  const statuses: string[] = [];
  const rendered: string[] = [];
  const fetcher = (async () => Response.json({
    answer: "Private summary",
    model: "qwen2.5-0.5b-instruct-openvino-gpu",
  })) as typeof fetch;

  const result = await runLocalModel("summarize", "Summarize", "Context", {
    fetcher,
    onStatus: (status) => statuses.push(status),
    onText: (text) => rendered.push(text),
  });

  assert.equal(result.answer, "Private summary");
  assert.equal(result.engine, "foundry-local");
  assert.deepEqual(statuses, ["running", "ready"]);
  assert.deepEqual(rendered, ["Private summary"]);
});