import assert from "node:assert/strict";
import test from "node:test";

import { callFoundryLocal, getFoundryLocalStatus } from "./foundry-local-client.ts";

const CONFIG = {
  endpoint: "http://127.0.0.1:61111",
  model: "qwen2.5-0.5b-instruct-openvino-gpu",
};

test("detects the loaded Foundry Local model", async () => {
  const fetcher = async () => Response.json({ data: [{ id: CONFIG.model }] });
  const status = await getFoundryLocalStatus(fetcher as typeof fetch, CONFIG);

  assert.deepEqual(status, { ready: true, model: CONFIG.model });
});

test("does not report an unrelated loaded model as ready", async () => {
  const fetcher = async () => Response.json({ data: [{ id: "qwen2.5-0.5b-instruct-openvino-gpu" }] });
  const status = await getFoundryLocalStatus(fetcher as typeof fetch, {
    ...CONFIG,
    model: "phi-4-mini-cpu",
  });

  assert.deepEqual(status, { ready: false, model: "phi-4-mini-cpu" });
});

test("sends a bounded local completion and parses usage", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      model: CONFIG.model,
      choices: [{ message: { content: "A local summary." } }],
      usage: { prompt_tokens: 40, completion_tokens: 5, total_tokens: 45 },
    });
  };

  const result = await callFoundryLocal("summarize", "Summarize", "Private context", {
    fetcher: fetcher as typeof fetch,
    config: CONFIG,
  });

  assert.equal(capturedUrl, "http://127.0.0.1:61111/v1/chat/completions");
  assert.equal(capturedBody.max_tokens, 350);
  assert.equal(result.answer, "A local summary.");
  assert.deepEqual(result.usage, { promptTokens: 40, completionTokens: 5, totalTokens: 45 });
});