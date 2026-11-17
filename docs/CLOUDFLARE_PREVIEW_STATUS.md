# VelclawHost Cloudflare Preview — deployment gates

**Snapshot:** 2026-11-17  
**Repository:** `Velclaw/app-velclaw`  
**Preview Worker:** `velclawhost-migration-preview`  
**Preview hostname:** `velclawhost-preview.ocodejs.dev`  
**Cloudflare account:** OCodeJS (`ocodejs-df1`)

## Verified changes

- PR #60 was merged by GitHub account `zskbot` at 2026-11-17T01:53:39Z; merge commit: `fc2247723236c0f3daa2aad9a0f2d65f1d713f61`.
- The Cloudflare edge Preview Worker was deployed through the connected OCodeJS Cloudflare account.
- Cloudflare control-plane read-back confirms the DNS CNAME and Worker route both target `velclawhost-migration-preview`:
  - `velclawhost-preview.ocodejs.dev` → `velclawhost-migration-preview.ocodejs-df1.workers.dev`
  - Route: `velclawhost-preview.ocodejs.dev/*`
- The static Vite frontend build passes and produces a 12-file bundle (1,874,392 bytes). CI artifact `velclawhost-cloudflare-preview-assets` was uploaded successfully (artifact ID `14291092076`, short retention).
- Cloudflare Migration Preview tests and the static bundle build pass.
- The main-branch VelclawHost CI run completed its lint, application build, Worker build, Control Plane Docker build, and Runtime Worker Docker build steps successfully.
- GitHub Pages deployment also completed successfully at `https://velclaw.app/app-velclaw/`. This is a separate GitHub Pages deployment, not evidence that Cloudflare Preview is serving the app.

## Current blockers — do not report Preview as fully live

### 1. Public HTTP verification is blocked by Cloudflare challenge

The GitHub Actions runner received:

- `https://velclawhost-preview.ocodejs.dev/health` → HTTP 403 with `cf-mitigated: challenge`.
- `https://velclawhost-migration-preview.ocodejs-df1.workers.dev/health` → DNS resolution failure from the runner.

The custom hostname resolves to the expected proxied CNAME and the Worker route exists, but a successful Worker response has not yet been observed. The 403 is a Cloudflare security challenge, not a confirmed application response. Do not disable zone-wide protections. If a narrowly scoped WAF/security exception for this Preview hostname is required, obtain approval before changing security policy.

### 2. Static assets are built but not attached to the Worker

The CI artifact is available, but the active Worker deployment reports `has_assets=false`. The Worker therefore remains a transitional edge bridge and falls back to the fixed Render origin for frontend and API requests.

The Workers Static Assets direct-upload process has three phases: manifest, file upload using the short-lived upload-session JWT as the Authorization bearer token, then a new Worker version with the assets binding. The Cloudflare connector can create the upload session and deploy Worker scripts, but its API wrapper does not expose a custom Authorization header for the file-upload phase. The GitHub Actions Cloudflare token previously returned authentication error 10000 during Wrangler deployment. Do not embed an upload JWT or API token in repository files or commit history.

**Next credential action:** update the repository Actions secret `CLOUDFLARE_API_TOKEN` to a least-privilege Cloudflare API token with Account → Workers Scripts → Edit for the OCodeJS account. The token must be added through GitHub's Secrets UI, never committed to the repository. After that, enable the Preview-only Wrangler deployment job and verify the new Worker version reports `has_assets=true`.

### 3. Backend migration is not complete

The current application is a Node.js/Express server. The source imports Node filesystem, OS, child-process, Vite development-server and NextAuth JWT modules. Prisma is PostgreSQL-backed. The runtime worker shells out to Docker and Git and allocates host ports.

A normal Cloudflare Worker cannot host the Docker execution plane or run arbitrary child processes. Keep the runtime isolated on a container-capable service while the edge/control-plane API is migrated incrementally.

## API surface inventory from `server.ts`

| Area | Endpoints | Cloudflare migration note |
|---|---|---|
| Health and identity | `GET /api/health`, `GET /api/v1/health`, `GET /api/v1/auth/me`, `GET /api/v1/auth/roles`, `GET /api/v1/capabilities` | Health/capabilities can be Fetch-native. Auth endpoints require a verified session adapter and database. |
| Developer tools | `GET /api/v1/developer/plugins`, `POST /api/v1/developer/repositories`, `POST /api/v1/developer/shell` | Repository operations and shell execution must stay outside a standard Worker. |
| Deployments and queue | `GET/POST /api/v1/deployments`, `GET /api/v1/deployments/:id`, `GET /api/v1/queue`, `POST /api/v1/deployments/:id/execute` | Control-plane CRUD can be ported to Fetch handlers; durable queue required. Execution remains external. |
| Runtime | `POST /api/v1/deployments/:id/runtime/plan`, `GET /api/v1/deployments/:id/runtime`, `POST /api/v1/deployments/:id/runtime/provision`, `GET /api/v1/deployments/:id/runtime/logs`, `POST /api/v1/deployments/:id/runtime/stop`, `POST /api/v1/deployments/:id/runtime/health` | Calls must target an authenticated container runtime service. |
| Domains and DNS | `GET /api/v1/domains`, `GET /api/v1/dns/status`, `GET /api/v1/dns/records`, `POST/PATCH/DELETE /api/v1/dns/records...`, `POST /api/v1/domains`, `POST /api/v1/domains/:id/verify`, `POST /api/v1/deployments/:id/domain/bind`, `DELETE /api/v1/domains/:id` | Fetch-compatible provider clients can run at the edge; secrets, ownership checks and idempotency need explicit design. |
| Registrar | `GET /api/v1/registrar/config`, availability, auth-code, transfer, transfer-in and nameserver routes | External provider calls; port with timeouts, retries, secret isolation and audit logs. |
| Metrics and reconciliation | `GET /api/v1/metrics`, `GET /api/v1/prometheus`, `GET /api/v1/reconciliation` | Current metrics use host/OS data and need replacement with runtime telemetry. |
| AI | `POST /api/ai/ask-command`, `POST /api/ai/diagnose` | Can use edge-compatible outbound HTTP, but tool execution must remain in the isolated runtime. |

## Release gates

- [x] Preview-only Worker route and DNS record exist.
- [x] Worker script deployed through the OCodeJS Cloudflare connection.
- [x] Worker unit tests and static frontend build pass.
- [x] Main branch application/Worker/Docker build steps pass.
- [ ] Preview hostname returns a non-challenge HTTP response from an external client.
- [ ] Static assets attached to the Worker and `has_assets=true` verified.
- [ ] Auth.js login, cookies, callbacks and session validation pass end-to-end on Preview.
- [ ] Dedicated PostgreSQL database and Hyperdrive connectivity tested with backup/restore.
- [ ] Durable queue has idempotency, retry, dead-letter and recovery tests.
- [ ] Container runtime boundary has authentication, isolation, resource quotas, cancellation, logs and health checks.
- [ ] Full Preview integration tests and Render rollback test pass.
- [ ] Separate explicit approval before Production DNS/traffic cutover or Render shutdown.
- [ ] Version `v0.1.0` only after the above release gates pass.

## Safety boundaries

- No Production DNS or Worker route was changed for the migration.
- The Render service remains untouched and is the rollback origin.
- Do not reuse OCodeJS CLI's D1 database.
- Do not merge follow-up PRs, switch Production traffic, disable Render, create billing resources, or modify zone-wide security settings without separate approval.
