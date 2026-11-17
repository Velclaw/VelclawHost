# VelclawHost: Render to Cloudflare migration

## Scope and safety

The migration target is the **OCodeJS Cloudflare account**. Work is isolated on branch `feat/cloudflare-native-migration-preview`. This phase does not change DNS, custom Worker routes, production traffic, Render configuration, secrets, or databases. The existing Render service remains the rollback origin.

## Confirmed source architecture

- The current control plane is a Node.js/Express process started from `dist/server.cjs`.
- The build combines Next.js, Vite, and an esbuild bundle for the Express server.
- Authentication uses Auth.js/NextAuth JWT session validation in the Express API.
- Prisma is configured for PostgreSQL; the current schema contains users, OAuth accounts, sessions, verification tokens, and rate-limit state.
- Deployment queue state uses PostgreSQL when configured and otherwise falls back to process memory.
- The runtime worker uses Node APIs, filesystem, Git subprocesses, Docker CLI, dynamic host ports, and long-running containers.
- The existing edge Worker proxies requests to `https://velclawhost.onrender.com`; it is not a Cloudflare-native control plane yet.

## Target architecture

1. **Frontend and edge/API:** Cloudflare Workers with Static Assets (or Pages if framework output requires it). Keep the preview Worker isolated on a workers.dev hostname until end-to-end tests pass.
2. **Control-plane API:** port Express route groups to Fetch handlers / a Workers-compatible router. Replace Node-only modules and validate Auth.js cookie/session handling explicitly.
3. **Persistence:** use a dedicated VelclawHost database. Prefer Hyperdrive to preserve PostgreSQL/Prisma compatibility during the first migration; consider D1 only after schema and query compatibility review. Do not reuse OCodeJS CLI's D1 database.
4. **Durable jobs:** replace in-process timers/maps and the PostgreSQL polling queue with Cloudflare Queues and/or Workflows plus durable idempotency and retry semantics.
5. **Build/runtime isolation:** Docker execution, `child_process`, arbitrary Git cloning, filesystem workspaces, and dynamic port allocation cannot run in a normal Worker. Keep this execution plane isolated on a dedicated container/runtime provider or evaluate Workers for Platforms with a documented compatibility and security model.
6. **Artifacts:** evaluate R2 for build outputs and project artifacts, with lifecycle and access policies before enabling writes.

## Preview implementation

- `cloudflare/preview-worker.js` is a deliberately limited health/capability probe.
- `wrangler.preview.toml` has workers.dev enabled and defines no custom domain routes or production bindings.
- `cloudflare/preview-worker.test.mjs` verifies preview identity, truthful capability reporting, 404 handling, and method restrictions.
- The preview endpoint is not an implementation of the authenticated control plane and must not accept deployment jobs or user data.

## Migration gates

- [ ] Build and unit tests pass on the feature branch.
- [ ] Preview Worker deployed only to workers.dev in the OCodeJS account.
- [ ] Auth.js login/session validation works end-to-end in preview.
- [ ] Dedicated database provisioned and schema migrations rehearsed with backup/restore.
- [ ] Durable queue supports idempotency, retries, dead-letter handling, and recovery.
- [ ] External runtime supports isolated builds, secrets, logs, cancellation, and health checks.
- [ ] Frontend/API integration tests pass against preview.
- [ ] Rollback to Render is tested.
- [ ] Separate explicit approval obtained before DNS, production traffic, or Render shutdown.
