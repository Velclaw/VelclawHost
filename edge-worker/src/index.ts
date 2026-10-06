const ORIGIN = "https://velclawhost.onrender.com";

export default {
  async fetch(request: Request): Promise<Response> {
    const incoming = new URL(request.url);
    const origin = new URL(ORIGIN);
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

    const response = await fetch(upstream);
    const out = new Response(response.body, response);
    out.headers.set("X-Velclaw-Origin", "velclawhost.onrender.com");
    return out;
  },
};
