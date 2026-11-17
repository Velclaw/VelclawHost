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

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (url.pathname === "/health" || url.pathname.startsWith("/api/") || url.pathname === "/api") {
      return json({ error: "Method not allowed", stage: STAGE }, 405);
    }
  }

  if (url.pathname === "/health" || url.pathname === "/api/v1/health") {
    return json({
      status: "ok",
      service: "velclawhost-free-preview",
      stage: STAGE,
      billingMode: "free-tier-only",
      productionRouting: false,
      timestamp: new Date().toISOString(),
    });
  }

  if (url.pathname === "/api/v1/capabilities") {
    return json({
      status: "success",
      service: "velclawhost-free-preview",
      stage: STAGE,
      billingMode: "free-tier-only",
      capabilities: {
        staticFrontend: true,
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
    });
  }

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return json({
      error: "API is not enabled in Free static Preview",
      code: "FREE_PREVIEW_API_DISABLED",
    }, 501);
  }

  return context.next();
}
