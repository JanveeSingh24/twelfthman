import assert from "node:assert/strict";
import test from "node:test";

import { localSessionCookie, parseLocalJsonRequest } from "./local-api-guard.ts";

function localRequest(
  body: string,
  overrides: Record<string, string> = {},
  url = "http://127.0.0.1:3000/api/cloud",
): Request {
  const cookie = localSessionCookie().split(";")[0];
  return new Request(url, {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      cookie,
      "content-type": "application/json",
      ...overrides,
    },
    body,
  });
}

test("accepts bounded same-origin JSON with the local capability", async () => {
  const result = await parseLocalJsonRequest(localRequest('{"ok":true}'), 100);
  assert.deepEqual(result, { ok: true, value: { ok: true } });
});

test("accepts equivalent loopback hosts after framework URL normalization", async () => {
  const result = await parseLocalJsonRequest(localRequest(
    '{"ok":true}',
    { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    "http://localhost:3000/api/cloud",
  ), 100);

  assert.deepEqual(result, { ok: true, value: { ok: true } });
});

test("rejects a non-loopback browser-visible host", async () => {
  const result = await parseLocalJsonRequest(localRequest(
    "{}",
    { host: "attacker.example:3000", origin: "http://attacker.example:3000" },
    "http://localhost:3000/api/cloud",
  ), 100);

  assert.equal(result.ok ? 200 : result.status, 403);
});

test("rejects cross-origin, malformed, and oversized requests", async () => {
  const crossOrigin = await parseLocalJsonRequest(localRequest("{}", { origin: "https://attacker.example" }), 100);
  const malformed = await parseLocalJsonRequest(localRequest("not-json"), 100);
  const oversized = await parseLocalJsonRequest(localRequest(JSON.stringify({ value: "x".repeat(200) })), 100);

  assert.equal(crossOrigin.ok ? 200 : crossOrigin.status, 403);
  assert.equal(malformed.ok ? 200 : malformed.status, 400);
  assert.equal(oversized.ok ? 200 : oversized.status, 413);
});