const VERSION = "cloudflare-migration-preview-v1";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Method not allowed", stage: "migration-preview" }, 405);
    }

    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/api/v1/health") {
      return json({
        status: "ok",
        service: "velclawhost-cloudflare-migration-preview",
        stage: "preview-only",
        version: VERSION,
        accountTarget: "OCodeJS",
        productionTrafficEnabled: false,
        renderFallbackPreserved: true,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/v1/capabilities") {
      return json({
        status: "success",
        stage: "preview-only",
        capabilities: {
          edgeHealth: true,
          controlPlaneApi: false,
          authSessionValidation: false,
          postgresCompatibility: "not-configured",
          durableDeploymentQueue: "not-configured",
          dockerRuntime: "external-runtime-required",
          productionRouting: false,
        },
        nextMigrationSteps: [
          "Port authenticated control-plane handlers to Workers",
          "Provision an isolated database for VelclawHost",
          "Replace in-memory process state with durable storage and Queues/Workflows",
          "Move Docker build/runtime execution to an isolated external runtime or Workers for Platforms",
        ],
      });
    }

    return json({ error: "Not found", stage: "migration-preview" }, 404);
  },
};
