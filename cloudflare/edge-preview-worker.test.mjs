import test from "node:test";
import assert from "node:assert/strict";
import worker from "./edge-preview-worker.js";

const ctx = {};

test("health identifies the Preview edge and keeps Production disabled", async () => {
  const response = await worker.fetch(
    new Request("https://velclawhost-preview.ocodejs.dev/health"),
    { LEGACY_API_ORIGIN: "https://velclawhost.onrender.com" },
    ctx,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.stage, "preview-only");
  assert.equal(body.frontend, "cloudflare-edge-proxy");
  assert.equal(body.api, "render-upstream-preview-bridge");
  assert.equal(body.productionRouting, false);
  assert.equal(body.renderFallbackPreserved, true);
});

test("health reports static assets only when a fetch binding is callable", async () => {
  const response = await worker.fetch(
    new Request("https://preview.invalid/health"),
    { ASSETS: {} },
    ctx,
  );
  assert.equal((await response.json()).frontend, "cloudflare-edge-proxy");
});

test("API requests preserve method, path, query, cookies, authorization and body", async (t) => {
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
  assert.equal(observed.headers.get("x-velclawhost-preview-purpose"), "api");
  assert.deepEqual(await observed.json(), { projectName: "demo" });
  assert.equal(response.headers.get("x-velclawhost-edge"), "preview-only");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("frontend fallback preserves upstream cache headers", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>legacy frontend</html>", {
    status: 200,
    headers: {
      "content-type": "text/html",
      "cache-control": "public, max-age=120",
    },
  }));

  const response = await worker.fetch(
    new Request("https://velclawhost-preview.ocodejs.dev/projects/demo?tab=logs"),
    {},
    ctx,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=120");
  assert.match(await response.text(), /legacy frontend/);
});

test("same-origin upstream redirects are rewritten to Preview and not cached", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, {
    status: 302,
    headers: { location: "https://velclawhost.onrender.com/login?next=%2Fdashboard" },
  }));

  const response = await worker.fetch(
    new Request("https://velclawhost-preview.ocodejs.dev/private"),
    {},
    ctx,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://velclawhost-preview.ocodejs.dev/login?next=%2Fdashboard",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("upstream cookies are rebound as host-only Preview cookies", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "authjs.session-token=abc; Path=/; Domain=velclawhost.onrender.com; HttpOnly; Secure; SameSite=Lax");
    headers.append("set-cookie", "csrf-token=xyz; Path=/; Domain=.onrender.com; Secure; SameSite=Lax");
    return new Response("ok", { status: 200, headers });
  });

  const response = await worker.fetch(
    new Request("https://velclawhost-preview.ocodejs.dev/api/auth/session"),
    {},
    ctx,
  );
  const cookies = response.headers.getSetCookie();

  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /authjs\.session-token=abc/);
  assert.match(cookies[0], /HttpOnly/);
  assert.doesNotMatch(cookies[0], /Domain=/i);
  assert.match(cookies[1], /csrf-token=xyz/);
  assert.doesNotMatch(cookies[1], /Domain=/i);
});

test("upstream origin validation fails closed for non-HTTPS or malformed values", async () => {
  const request = new Request("https://preview.invalid/api/health");
  const unsafe = await worker.fetch(request, {
    LEGACY_API_ORIGIN: "http://127.0.0.1:3000",
  }, ctx);
  const malformed = await worker.fetch(request, {
    LEGACY_API_ORIGIN: "https://example.com/path",
  }, ctx);

  assert.equal(unsafe.status, 503);
  assert.equal(malformed.status, 503);
  assert.equal((await unsafe.json()).code, "PREVIEW_UPSTREAM_ORIGIN_NOT_CONFIGURED");
});

test("upstream failures return a bounded 502 response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("private upstream detail");
  });

  const response = await worker.fetch(
    new Request("https://preview.invalid/api/health"),
    {},
    ctx,
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.code, "PREVIEW_UPSTREAM_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("private upstream detail"), false);
});

test("static requests use Workers Static Assets when the binding exists", async () => {
  let servedUrl = "";
  const response = await worker.fetch(
    new Request("https://preview.invalid/projects/123"),
    {
      ASSETS: {
        async fetch(request) {
          servedUrl = request.url;
          return new Response("<main>VelclawHost Static Preview</main>", {
            headers: { "content-type": "text/html" },
          });
        },
      },
    },
    ctx,
  );

  assert.equal(servedUrl, "https://preview.invalid/projects/123");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /VelclawHost Static Preview/);
});
