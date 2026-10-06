# VelclawHost Runtime Worker

The Runtime Worker is the execution plane for VelclawHost. It is intentionally separate from the public control plane.

## Responsibilities

- validate GitHub source
- clone an exact branch/commit
- build a Docker image
- start a constrained container
- health-check the runtime
- report runtime state
- stop/remove a runtime

## Required host capability

The worker must run on a host with access to a Docker daemon. The worker does **not** pretend that a normal Render Node.js web service is a Docker host.

Recommended production topology:

```
VelclawHost Control Plane
        |
        | HTTPS + RUNTIME_WORKER_TOKEN
        v
Runtime Worker
        |
        v
Docker Engine
        |
        +-- customer container A
        +-- customer container B
```

## Environment

- `RUNTIME_WORKER_TOKEN` — required in production.
- `PORT` — worker HTTP port, default `10000`.
- `RUNTIME_WORKSPACE` — checkout workspace.
- `RUNTIME_MAX_CONTAINERS` — concurrency cap.
- `RUNTIME_CPU_LIMIT` — Docker CPU limit, default `1`.
- `RUNTIME_MEMORY_LIMIT` — Docker memory limit, default `512m`.
- `RUNTIME_CONTAINER_PORT` — expected application port, default `3000`.
- `RUNTIME_PORT_START` — first host port, default `4100`.

## Security

The worker accepts only canonical HTTPS GitHub repositories. It uses `execFile`, not a shell, and applies CPU, memory and PID limits to launched containers.

Do not expose the worker directly to the public internet without authentication and a firewall/reverse proxy. A production deployment should also add image scanning, per-project secrets, network isolation, disk quotas and log retention.
