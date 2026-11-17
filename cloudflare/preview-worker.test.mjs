import test from "node:test";
import assert from "node:assert/strict";
import worker from "./preview-worker.js";

const env = {};
const ctx = {};

 test("health endpoint identifies an isolated preview", async () => {
  const response = await worker.fetch(new Request("https://preview.invalid/api/v1/health"), env, ctx);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.stage, "preview-only");
  assert.equal(body.productionTrafficEnabled, false);
  assert.equal(body.renderFallbackPreserved, true);
});

test("capabilities do not claim unfinished control-plane features", async () => {
  const response = await worker.fetch(new Request("https://preview.invalid/api/v1/capabilities"), env, ctx);
  const body = await response.json();
  assert.equal(body.capabilities.controlPlaneApi, false);
  assert.equal(body.capabilities.authSessionValidation, false);
  assert.equal(body.capabilities.durableDeploymentQueue, "not-configured");
  assert.equal(body.capabilities.productionRouting, false);
});

test("unknown paths return 404 and mutating methods are rejected", async () => {
  const missing = await worker.fetch(new Request("https://preview.invalid/not-found"), env, ctx);
  const mutation = await worker.fetch(new Request("https://preview.invalid/api/deploy", { method: "POST" }), env, ctx);
  assert.equal(missing.status, 404);
  assert.equal(mutation.status, 405);
});
