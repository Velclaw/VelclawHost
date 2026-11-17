export interface Env {
  CONTROL_PLANE_ORIGIN?: string;
}

function unavailable(): Response {
  return Response.json(
    {
      error: "Control plane origin is not configured.",
      code: "CONTROL_PLANE_ORIGIN_REQUIRED",
      message: "Configure the AWS-hosted VelclawHost control plane before routing traffic.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const configuredOrigin = env.CONTROL_PLANE_ORIGIN?.trim();
    if (!configuredOrigin) return unavailable();

    let origin: URL;
    try {
      origin = new URL(configuredOrigin);
    } catch {
      return Response.json(
        { error: "CONTROL_PLANE_ORIGIN must be a valid absolute URL." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (origin.protocol !== "https:") {
      return Response.json(
        { error: "CONTROL_PLANE_ORIGIN must use HTTPS." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const incoming = new URL(request.url);
    origin.pathname = incoming.pathname;
    origin.search = incoming.search;

    const headers = new Headers(request.headers);
    headers.set("X-Velclaw-Edge", "cloudflare-worker");
    headers.set("X-Forwarded-Host", incoming.host);
    headers.set("X-Forwarded-Proto", "https");

    const upstream = new Request(origin.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    try {
      const response = await fetch(upstream);
      const out = new Response(response.body, response);
      out.headers.set("X-Velclaw-Origin", "aws-control-plane");
      out.headers.set("Cache-Control", "no-store");
      return out;
    } catch {
      return Response.json(
        { error: "AWS control plane is unreachable.", code: "CONTROL_PLANE_UNAVAILABLE" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
};
