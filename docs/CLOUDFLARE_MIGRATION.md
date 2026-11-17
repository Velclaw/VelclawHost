# VelclawHost: Render to Cloudflare migration

## Scope and safety

The migration target is the **OCodeJS Cloudflare account**. All work is isolated to feature branches and Preview resources. Production DNS, production traffic, Render configuration, secrets, and existing databases remain unchanged unless separately approved. The existing Render service remains the rollback origin.

## Confirmed source architecture

- The current control plane is a Node.js/Express process started from `dist/server.cjs`.
- The build combines Next.js, Vite, and an esbuild bundle for the Express server.
- Authentication uses Auth.js/NextAuth JWT session validation in the Express API.
- Prisma is configured for PostgreSQL; the current schema contains users, OAuth accounts, sessions, verification tokens, and rate-limit state.
- Deployment queue state uses PostgreSQL when configured and otherwise falls back to process memory.
- The runtime worker uses Node APIs, filesystem, Git subprocesses, Docker CLI, dynamic host ports, and long-running containers.
- The current Render service remains the origin for the application and API during Preview.

## Target architecture

1. **Frontend and edge/API:** Cloudflare Workers with Workers Static Assets. Keep preview isolated until end-to-end tests pass.
2. **Control-plane API:** port Express route groups to Fetch handlers / a Workers-compatible router. Replace Node-only modules and validate Auth.js cookie/session handling explicitly.
3. **Persistence:** use a dedicated VelclawHost database. Prefer Hyperdrive to preserve PostgreSQL/Prisma compatibility during the first migration; consider D1 only after schema and query compatibility review. Do not reuse OCodeJS CLI's D1 database.
4. **Durable jobs:** replace in-process timers/maps and the PostgreSQL polling queue with Cloudflare Queues and/or Workflows plus durable idempotency and retry semantics.
5. **Build/runtime isolation:** Docker execution, `child_process`, arbitrary Git cloning, filesystem workspaces, and dynamic port allocation cannot run in a normal Worker. Keep this execution plane isolated on a dedicated container/runtime provider or evaluate Workers for Platforms with a documented compatibility and security model.
6. **Artifacts:** evaluate R2 for build outputs and project artifacts, with lifecycle and access policies before enabling writes.

## Preview implementation

### Phase 1 — isolated health probe

- `cloudflare/preview-worker.js` is a deliberately limited health/capability probe.
- `wrangler.preview.toml` has workers.dev enabled and defines no custom domain routes or production bindings.
- Its tests verify preview identity, truthful capability reporting, 404 handling, and method restrictions.

### Phase 2 — Cloudflare edge Preview bridge

- `cloudflare/edge-preview-worker.js` provides a Preview-only edge entry point.
- `wrangler.edge-preview.toml` attaches only the previously authorized route `velclawhost-preview.ocodejs.dev/*`.
- When an Assets binding is attached, static requests are served by Cloudflare Workers Static Assets.
- Before the asset bundle is attached, the Worker proxies frontend requests to the fixed Render origin so the Preview remains available through the same hostname.
- Same-origin `/api` and `/api/*` requests are forwarded to the fixed HTTPS Render origin. The Wrangler `run_worker_first` list includes both exact `/api` and nested `/api/*` paths.
- The bridge preserves cookies, authorization headers, methods, paths, query strings, request bodies, and upstream response status.
- Upstream `Set-Cookie` Domain attributes are stripped so cookies become host-only on the Preview hostname. Same-origin upstream redirects are rewritten to the Preview hostname.
- API responses and redirects are marked `no-store`; frontend fallback responses retain the upstream cache policy.
- The bridge rejects missing or non-HTTPS upstream origins, does not accept a caller-supplied destination, and returns bounded errors without leaking upstream exception details.
- This is a transitional edge bridge: the backend, Auth.js session validation, database, queue, and container runtime still run outside Cloudflare. It is not a completed Render migration.
- The build/test workflow validates Worker syntax, API forwarding, cookie rebinding, redirect rewriting, static asset behavior, and Vite output. It uploads the static bundle as a short-lived CI artifact.
- No Cloudflare account ID or secret is hardcoded in source. Cloudflare account selection is supplied by the deployment environment.
- The `ocodejs.dev` zone is in Under Attack mode with Bot Fight Mode enabled. External requests to the Preview hostname can receive a Cloudflare challenge before reaching the Worker. No zone-wide security setting or hostname-scoped WAF exception is changed by this migration.
- Render remains the rollback origin; Production routing remains disabled.

## Migration gates

- [x] Existing migration branch CI and Docker image builds pass.
- [x] Initial Preview Worker syntax and unit tests pass.
- [x] Cloudflare Preview Worker deployed through the OCodeJS account.
- [x] Preview DNS and Worker route verified through Cloudflare API.
- [x] Static frontend Vite build passes and is retained as a CI artifact.
- [x] Edge proxy tests cover API requests, host-only cookies, redirect rewriting, cache policy, and static asset behavior.
- [ ] Attach the built static assets to the Cloudflare Preview Worker.
- [ ] External HTTP smoke test passes after the hostname-scoped security challenge is resolved.
- [ ] Auth.js login/session validation works end-to-end in Preview.
- [ ] Dedicated database provisioned and schema migrations rehearsed with backup/restore.
- [ ] Durable queue supports idempotency, retries, dead-letter handling, and recovery.
- [ ] External runtime supports isolated builds, secrets, logs, cancellation, and health checks.
- [ ] Frontend/API integration tests pass against Preview.
- [ ] Rollback to Render is tested.
- [ ] Separate explicit approval obtained before Production DNS, production traffic, or Render shutdown.
