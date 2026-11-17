import test from "node:test";
import assert from "node:assert/strict";
import worker from "./edge-preview-worker.js";

const ctx = {};

test("health identifies the Cloudflare frontend preview and preserves Render fallback", async () => {
  const response = await worker.fetch(
    new Request("https://velclawhost-preview.ocodejs.dev/health"),
    { LEGACY_API_ORIGIN: "https://velclawhost.onrender.com" },
    ctx,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.stage, "preview-only");
  assert.equal(body.frontend, "cloudflare-workers-static-assets");
  assert.equal(body.api, "render-upstream-preview-bridge");
  assert.equal(body.productionRouting, false);
  assert.equal(body.renderFallbackPreserved, true);
});

test("API requests are forwarded to the fixed HTTPS origin with path, query, cookie and body", async (t) => {
  let observed;
  t.mock.method(globalThis, "fetch", async (request) => {
    observed = request;
    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  });

  const request = new Request(
    "https://velclawhost-preview.ocodejs.dev/api/v1/deployments?limit=5",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "authjs.session-token=preview-session",
        authorization: "Bearer preview-token",
      },
      body: JSON.stringify({ projectName: "demo" }),
    },
  );
  const response = await worker.fetch(request, {
    LEGACY_API_ORIGIN: "https://velclawhost.onrender.com",
  }, ctx);

  assert.equal(response.status, 202);
  assert.equal(observed.url, "https://velclawhost.onrender.com/api/v1/deployments?limit=5");
  assert.equal(observed.method, "POST");
  assert.equal(observed.headers.get("cookie"), "authjs.session-token=preview-session");
  assert.equal(observed.headers.get("authorization"), "Bearer preview-token");
  assert.equal(observed.headers.get("x-velclawhost-edge"), "preview-only");
  assert.deepEqual(await observed.json(), { projectName: "demo" });
  assert.equal(response.headers.get("x-velclawhost-edge"), "preview-only");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("API proxy fails closed when the origin is missing or not HTTPS", async () => {
  const request = new Request("https://preview.invalid/api/health");
  const missing = await worker.fetch(request, {}, ctx);
  const unsafe = await worker.fetch(request, {
    LEGACY_API_ORIGIN: "http://127.0.0.1:3000",
  }, ctx);

  assert.equal(missing.status, 503);
  assert.equal(unsafe.status, 503);
  assert.equal((await unsafe.json()).code, "PREVIEW_API_ORIGIN_NOT_CONFIGURED");
});

test("upstream failures return a bounded 502 response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("private upstream detail");
  });

  const response = await worker.fetch(
    new Request("https://preview.invalid/api/health"),
    { LEGACY_API_ORIGIN: "https://velclawhost.onrender.com" },
    ctx,
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.code, "PREVIEW_API_UPSTREAM_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("private upstream detail"), false);
});

test("non-API requests are served by the static asset binding", async () => {
  let servedUrl = "";
  const response = await worker.fetch(
    new Request("https://preview.invalid/projects/123"),
    {
      ASSETS: {
        async fetch(request) {
          servedUrl = request.url;
          return new Response("<main>VelclawHost Preview</main>", {
            headers: { "content-type": "text/html" },
          });
        },
      },
    },
    ctx,
  );

  assert.equal(servedUrl, "https://preview.invalid/projects/123");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /VelclawHost Preview/);
});

test("static requests fail clearly if the asset binding is absent", async () => {
  const response = await worker.fetch(
    new Request("https://preview.invalid/"),
    {},
    ctx,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "PREVIEW_ASSETS_NOT_BOUND");
});
