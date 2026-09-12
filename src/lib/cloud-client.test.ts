import assert from "node:assert/strict";
import test from "node:test";

import { callAzureResponses, CloudClientError, hasAzureResponsesConfig } from "./cloud-client.ts";
import type { CloudEnvelope } from "./cloud-envelope.ts";

const ENVELOPE: CloudEnvelope = {
  version: 2,
  requestId: "44444444-4444-4444-8444-444444444444",
  taskClass: "reason",
  instruction: "Analyze only the supplied evidence.",
  evidence: "[PROTECTED_TERM_1] passed the load test.",
  sourceTokensEstimate: 800,
  evidenceTokensEstimate: 12,
  redaction: { categories: ["protected-term"], matchCount: 1 },
  consent: { approved: true, approvedAt: "2026-09-12T12:00:00.000Z", contentHash: "0".repeat(64) },
};

const CONFIG = {
  endpoint: "https://example.openai.azure.com",
  apiKey: "server-secret",
  deployment: "specialist-model",
};

test("requires all server-side Azure settings", () => {
  assert.equal(hasAzureResponsesConfig({ AZURE_OPENAI_ENDPOINT: "https://example" }), false);
  assert.equal(hasAzureResponsesConfig({
    AZURE_OPENAI_ENDPOINT: "https://example",
    AZURE_OPENAI_DEPLOYMENT: "model",
  }), true);
});

test("sends a stateless, capped Responses v1 request and parses actual usage", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return Response.json({
      output_text: "Use the staged migration.",
      model: "specialist-model-2026-01-01",
      usage: { input_tokens: 41, output_tokens: 8, total_tokens: 49 },
    });
  };

  const result = await callAzureResponses(ENVELOPE, {
    config: CONFIG,
    fetcher: fetcher as typeof fetch,
  });
  const requestBody = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;

  assert.equal(capturedUrl, "https://example.openai.azure.com/openai/v1/responses");
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.max_output_tokens, 450);
  assert.equal(requestBody.model, "specialist-model");
  assert.equal("prompt" in requestBody, false);
  assert.equal("context" in requestBody, false);
  assert.equal((capturedInit?.headers as Record<string, string>)["api-key"], "server-secret");
  assert.deepEqual(result.usage, { inputTokens: 41, outputTokens: 8, totalTokens: 49 });
});

test("uses a Microsoft Entra bearer token when no API key exists", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedHeaders = init?.headers as Record<string, string>;
    return Response.json({
      output_text: "Keyless response.",
      model: "gpt-5.6-terra",
      usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
    });
  };
  const credential = {
    getToken: async (scopes: string | string[]) => {
      assert.equal(scopes, "https://ai.azure.com/.default");
      return { token: "entra-token", expiresOnTimestamp: Date.now() + 60_000 };
    },
  };

  await callAzureResponses(ENVELOPE, {
    config: {
      endpoint: "https://twelfthmanai.services.ai.azure.com/openai/v1/responses",
      deployment: "gpt-5.6-terra",
      tenantId: "tenant-id",
    },
    credential,
    fetcher: fetcher as typeof fetch,
  });

  assert.equal(capturedUrl, "https://twelfthmanai.services.ai.azure.com/openai/v1/responses");
  assert.equal(capturedHeaders.Authorization, "Bearer entra-token");
  assert.equal("api-key" in capturedHeaders, false);
});

test("rejects non-Azure endpoints before acquiring credentials", async () => {
  let tokenRequested = false;
  await assert.rejects(
    callAzureResponses(ENVELOPE, {
      config: { endpoint: "https://attacker.example/responses", deployment: "model" },
      credential: {
        getToken: async () => {
          tokenRequested = true;
          return { token: "secret", expiresOnTimestamp: Date.now() + 60_000 };
        },
      },
    }),
    (error: unknown) => error instanceof CloudClientError && error.kind === "not-configured",
  );
  assert.equal(tokenRequested, false);
});

test("reports blocked successful responses as content-filter errors", async () => {
  await assert.rejects(
    callAzureResponses(ENVELOPE, {
      config: CONFIG,
      fetcher: (async () => Response.json({
        output_text: "",
        content_filters: [{ blocked: true }],
      })) as typeof fetch,
    }),
    (error: unknown) => error instanceof CloudClientError && error.kind === "content-filter",
  );
});

test("normalizes guardrail and capacity failures", async () => {
  const cases = [
    { status: 400, body: { error: { code: "content_filter" } }, kind: "content-filter", publicStatus: 400 },
    { status: 429, body: { error: { code: "rate_limit" } }, kind: "capacity", publicStatus: 429 },
  ] as const;

  for (const item of cases) {
    await assert.rejects(
      callAzureResponses(ENVELOPE, {
        config: CONFIG,
        fetcher: (async () => Response.json(item.body, { status: item.status })) as typeof fetch,
      }),
      (error: unknown) => error instanceof CloudClientError
        && error.kind === item.kind
        && error.publicStatus === item.publicStatus,
    );
  }
});