# VelclawHost Free-tier architecture

## Decision

The default target for Preview is a $0/month architecture. Do not provision AWS resources, paid database plans, paid workers, paid containers, or paid networking. This document is an implementation boundary, not a claim that the full Docker deployment platform already runs on Cloudflare Workers.

## Platform capability boundary

Cloudflare Workers can host request/response APIs and lightweight orchestration. Workers do not provide a general-purpose Linux host, Docker daemon, arbitrary child processes, persistent local filesystem, or long-running container runtime. The current VelclawHost runtime worker depends on all of those capabilities:

- `child_process` / Docker CLI and a reachable Docker daemon
- Git clone and project workspaces on disk
- per-project containers, dynamic host ports, health checks and log access
- in-memory runtime and port registries

Therefore, the existing Docker runtime worker cannot be moved unchanged into a Worker. Do not expose shell/build/deploy controls as available when no isolated executor is configured.

## Free Preview target

1. **Frontend:** Cloudflare Pages or Workers static assets, deployed from a GitHub branch.
2. **Edge/API:** Cloudflare Workers Free for lightweight API routes, auth callbacks where compatible, request validation and orchestration.
3. **Metadata:** Cloudflare D1 Free for small relational metadata; KV only for cache/configuration, never as the sole durable source of truth for relational state.
4. **Artifacts:** GitHub repository/Actions artifacts or Cloudflare R2 only after confirming the account's current free allowance and object/operation limits. Never silently enable paid overages.
5. **Build execution:** Prefer GitHub Actions on-demand workflows for bounded, queued build jobs. Treat public/private repository permissions, action minutes, concurrency, log/artifact retention and untrusted pull-request code as hard constraints. Do not execute untrusted code with privileged repository secrets.
6. **Runtime preview:** Static output only (HTML/CSS/JS) published as a Pages preview deployment. Arbitrary Docker services, databases, sockets, background daemons and long-running processes are explicitly unsupported in the $0 mode.

## Required product behavior

- Add a visible capability mode such as `Free static preview`.
- Disable or mark unavailable Docker runtime, project shell, persistent server processes, custom TCP ports, and database-backed app previews when no isolated runtime provider exists.
- Do not report a deployment as successful until the Pages deployment URL is reachable and its expected build artifact is present.
- Use a durable deployment record and idempotency key; do not rely on in-memory Maps for durable job state.
- Fail closed when GitHub credentials, deployment authorization, or runtime isolation are absent.
- Never put GitHub tokens, Cloudflare API tokens, or runtime secrets in browser code, logs, build output, or repository history.

## Authentication and persistence

The existing Prisma schema targets PostgreSQL and Auth.js currently uses a database adapter. D1 is not a drop-in PostgreSQL replacement. Before changing persistence or auth, design and test an explicit adapter/schema migration on a branch. Do not point the app at an unrelated OCodeJS database and do not migrate or delete the existing Render database.

For a first free Preview, it is safer to keep authentication limited to the already supported provider flow and avoid creating user-owned persistent data until D1/Auth.js compatibility has been proven. If that cannot be implemented securely, keep the Preview protected and read-only.

## Security gates for GitHub Actions builds

- Accept only allowlisted repositories/branches initially.
- Use GitHub App installation tokens or narrowly scoped short-lived tokens; never accept a PAT from client-side requests.
- Build untrusted pull requests without deployment credentials and without write permissions.
- Separate build and publish jobs; only trusted branch builds can publish Pages previews.
- Apply queue limits, timeouts, artifact size limits, and cleanup/retention policies.
- Record commit SHA, actor, workflow run ID, artifact digest and deployment URL for every job.
- Do not execute project shell commands inside the control-plane Worker.

## Existing services and migration safety

- Keep the existing Render `velclawhost` Free service intact as a rollback/reference service until a separate, tested replacement exists. This document does not authorize deleting, suspending, or changing that service.
- Do not change DNS, Worker production variables, production routes, or the current public origin as part of this Preview design.
- Do not deploy a Worker that has no working upstream origin.
- No AWS, RDS, EC2, ECS, NAT Gateway, ALB, or other paid resources are required for this free target.

## Acceptance checklist

- [ ] Static frontend deploys from a feature branch to a distinct Preview URL.
- [ ] Worker Preview health endpoint returns a clear healthy response without depending on a missing backend.
- [ ] D1 schema and migrations are tested in an isolated Preview database before any production data change.
- [ ] Auth flow passes sign-in, callback, session, logout and unauthorized-access tests.
- [ ] GitHub Actions build is least-privilege, bounded, auditable and does not expose secrets to untrusted code.
- [ ] A sample static project builds and its Preview URL is verified over HTTPS.
- [ ] Unsupported Docker/server workloads are blocked with an explicit explanation rather than falsely reported as deployed.
- [ ] No paid resources or production/DNS/Render changes occurred.

## Known limitation

This architecture delivers a useful free static-preview workflow, not a free general-purpose container hosting service. A fully featured Docker runtime needs a separate compute provider and is outside the $0 guarantee.
