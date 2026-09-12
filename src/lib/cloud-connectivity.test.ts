import assert from "node:assert/strict";
import test from "node:test";

import { hasCloudConnectivity } from "./cloud-connectivity.ts";

test("reports cloud connectivity when the probe succeeds", async () => {
  const fetcher = async () => new Response("ok", { status: 200 });

  assert.equal(await hasCloudConnectivity(fetcher as typeof fetch), true);
});

test("reports offline when the probe cannot leave the device", async () => {
  const fetcher = async () => {
    throw new TypeError("Network unavailable");
  };

  assert.equal(await hasCloudConnectivity(fetcher as typeof fetch), false);
});