import test from "node:test";
import assert from "node:assert/strict";
import worker from "./free-preview-worker.js";

const ctx = {};

test("health endpoint is isolated, free-tier and non-production", async () => {
  const response = await worker.fetch(new Request("https://preview.invalid/health"), {}, ctx);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.stage, "preview-only");
  assert.equal(body.billingMode, "free-tier-only");
  assert.equal(body.productionRouting, false);
  assert.equal(body.staticAssetsBound, false);
});

test("capabilities accurately disclose unsupported backend features", async () => {
  const response = await worker.fetch(new Request("https://preview.invalid/api/v1/capabilities"), {
    ASSETS: { fetch: async () => new Response("asset") },
  }, ctx);
  const body = await response.json();
  assert.equal(body.capabilities.staticFrontend, true);
  assert.equal(body.capabilities.controlPlaneApi, false);
  assert.equal(body.capabilities.authSessionValidation, false);
  assert.equal(body.capabilities.persistentDatabase, false);
  assert.equal(body.capabilities.dockerRuntime, false);
  assert.equal(body.capabilities.productionRouting, false);
});

test("API routes fail closed rather than proxying to a paid or legacy backend", async () => {
  const response = await worker.fetch(new Request("https://preview.invalid/api/deploy"), {}, ctx);
  const body = await response.json();
  assert.equal(response.status, 501);
  assert.equal(body.code, "FREE_PREVIEW_API_DISABLED");
});

test("static routes are served by the Assets binding", async () => {
  let requested = "";
  const response = await worker.fetch(new Request("https://preview.invalid/dashboard"), {
    ASSETS: {
      async fetch(request) {
        requested = new URL(request.url).pathname;
        return new Response("<main>VelclawHost Free Preview</main>", {
          headers: { "content-type": "text/html" },
        });
      },
    },
  }, ctx);
  assert.equal(response.status, 200);
  assert.equal(requested, "/dashboard");
  assert.match(await response.text(), /VelclawHost Free Preview/);
});

test("missing assets return explicit 503 instead of false success", async () => {
  const response = await worker.fetch(new Request("https://preview.invalid/"), {}, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "PREVIEW_ASSETS_MISSING");
});

test("mutating methods are rejected", async () => {
  const response = await worker.fetch(new Request("https://preview.invalid/api/deploy", { method: "POST" }), {}, ctx);
  assert.equal(response.status, 405);
});
