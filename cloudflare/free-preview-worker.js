const SERVICE = "velclawhost-free-preview";
const STAGE = "preview-only";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-velclawhost-stage": STAGE,
    },
  });
}

function capabilities(hasAssets) {
  return {
    status: "success",
    service: SERVICE,
    stage: STAGE,
    billingMode: "free-tier-only",
    capabilities: {
      staticFrontend: hasAssets,
      edgeHealth: true,
      controlPlaneApi: false,
      authSessionValidation: false,
      persistentDatabase: false,
      durableDeploymentQueue: false,
      dockerRuntime: false,
      arbitraryServerProcesses: false,
      productionRouting: false,
    },
    limitations: [
      "This Preview serves static frontend assets only.",
      "Sign-in, database-backed features, project shell, Docker builds, and long-running application servers are not enabled.",
      "No paid service or production origin is configured.",
    ],
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hasAssets = Boolean(env.ASSETS && typeof env.ASSETS.fetch === "function");

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Method not allowed", stage: STAGE }, 405);
    }

    if (url.pathname === "/health" || url.pathname === "/api/v1/health") {
      return json({
        status: "ok",
        service: SERVICE,
        stage: STAGE,
        billingMode: "free-tier-only",
        staticAssetsBound: hasAssets,
        productionRouting: false,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/v1/capabilities") {
      return json(capabilities(hasAssets));
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return json({ error: "API is not enabled in Free static Preview", code: "FREE_PREVIEW_API_DISABLED" }, 501);
    }

    if (!hasAssets) {
      return json({ error: "Static assets are not attached to this Preview yet", code: "PREVIEW_ASSETS_MISSING" }, 503);
    }

    return env.ASSETS.fetch(request);
  },
};
