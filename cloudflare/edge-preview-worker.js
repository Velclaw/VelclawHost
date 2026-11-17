const STAGE = "preview-only";
const SERVICE = "velclawhost-cloudflare-edge-preview";
const DEFAULT_LEGACY_ORIGIN = "https://velclawhost.onrender.com";

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

async function proxyRequest(request, env, purpose) {
  const configuredOrigin = env.LEGACY_API_ORIGIN ?? DEFAULT_LEGACY_ORIGIN;
  const origin = getLegacyOrigin(configuredOrigin);
  if (!origin) {
    return json({
      status: "unavailable",
      code: "PREVIEW_UPSTREAM_ORIGIN_NOT_CONFIGURED",
      stage: STAGE,
    }, 503);
  }

  const incoming = new URL(request.url);
  const upstreamUrl = new URL(incoming.pathname + incoming.search, origin);
  const initialRequest = new Request(upstreamUrl, request);
  const headers = new Headers(initialRequest.headers);
  headers.delete("host");
  headers.set("x-velclawhost-edge", STAGE);
  headers.set("x-velclawhost-preview-purpose", purpose);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));
  const upstreamRequest = new Request(initialRequest, {
    headers,
    redirect: "manual",
  });

  try {
    const upstreamResponse = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set("x-velclawhost-edge", STAGE);
    responseHeaders.set("cache-control", "no-store");

    const location = responseHeaders.get("location");
    if (location) {
      try {
        const redirectUrl = new URL(location, origin);
        if (redirectUrl.origin === origin.origin) {
          redirectUrl.protocol = incoming.protocol;
          redirectUrl.host = incoming.host;
          responseHeaders.set("location", redirectUrl.toString());
        }
      } catch {
        // Preserve non-URL Location values exactly as returned by the upstream.
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return json({
      status: "unavailable",
      code: "PREVIEW_UPSTREAM_UNAVAILABLE",
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
        frontend: env.ASSETS ? "cloudflare-workers-static-assets" : "cloudflare-edge-proxy",
        api: "render-upstream-preview-bridge",
        productionRouting: false,
        renderFallbackPreserved: true,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxyRequest(request, env, "api");
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    // Direct API deployment fallback: keep the Preview usable while the
    // repository's Wrangler token is repaired for Static Assets uploads.
    return proxyRequest(request, env, "frontend");
  },
};
