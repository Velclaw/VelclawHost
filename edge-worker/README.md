# VelclawHost Edge

Cloudflare Worker used as the public edge for `velclaw.site`.

Flow:

`velclaw.site` → Cloudflare Worker → `https://velclawhost.onrender.com`

This avoids consuming a Render custom-domain slot.

The Worker must be deployed to the Cloudflare account that owns the `velclaw.site` zone. Configure a Cloudflare Route for:

`velclaw.site/*`

The DNS record for `velclaw.site` must be proxied (orange cloud) for a Worker Route.

Do not add `velclaw.site` as a Render custom domain.
