const STAGE = "preview-only";
const SERVICE = "velclawhost-cloudflare-edge-preview";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-velclawhost-edge": STAGE,
    },
  });
}

function getLegacyOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const origin = new URL(value);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) return null;
    return origin;
  } catch {
    return null;
  }
}

async function proxyApi(request, env) {
  const origin = getLegacyOrigin(env.LEGACY_API_ORIGIN);
  if (!origin) {
    return json({
      status: "unavailable",
      code: "PREVIEW_API_ORIGIN_NOT_CONFIGURED",
      stage: STAGE,
    }, 503);
  }

  const incoming = new URL(request.url);
  const upstreamUrl = new URL(incoming.pathname + incoming.search, origin);
  const initialRequest = new Request(upstreamUrl, request);
  const headers = new Headers(initialRequest.headers);
  headers.delete("host");
  headers.set("x-velclawhost-edge", STAGE);
  headers.set("x-forwarded-host", incoming.host);
  const upstreamRequest = new Request(initialRequest, {
    headers,
    redirect: "manual",
  });

  try {
    const upstreamResponse = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set("x-velclawhost-edge", STAGE);
    responseHeaders.set("cache-control", "no-store");
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return json({
      status: "unavailable",
      code: "PREVIEW_API_UPSTREAM_UNAVAILABLE",
      stage: STAGE,
    }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        status: "ok",
        service: SERVICE,
        stage: STAGE,
        frontend: "cloudflare-workers-static-assets",
        api: getLegacyOrigin(env.LEGACY_API_ORIGIN) ? "render-upstream-preview-bridge" : "not-configured",
        productionRouting: false,
        renderFallbackPreserved: true,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxyApi(request, env);
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return json({
        status: "unavailable",
        code: "PREVIEW_ASSETS_NOT_BOUND",
        stage: STAGE,
      }, 503);
    }

    return env.ASSETS.fetch(request);
  },
};
