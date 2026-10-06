import express from "express";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json({ limit: "256kb" }));

const PORT = Number(process.env.PORT || 10000);
const WORKER_TOKEN = process.env.RUNTIME_WORKER_TOKEN?.trim() || "";
const WORKSPACE = process.env.RUNTIME_WORKSPACE || path.join(process.cwd(), "runtime-workspaces");
const IMAGE_PREFIX = (process.env.RUNTIME_IMAGE_PREFIX || "velclawhost").replace(/[^a-zA-Z0-9._/-]/g, "");
const CONTAINER_PORT = Number(process.env.RUNTIME_CONTAINER_PORT || 3000);
const PORT_START = Number(process.env.RUNTIME_PORT_START || 4100);
const PUBLIC_BASE_URL = process.env.RUNTIME_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
const MAX_CONTAINERS = Math.max(1, Number(process.env.RUNTIME_MAX_CONTAINERS || 10));
const CPU_LIMIT = process.env.RUNTIME_CPU_LIMIT?.trim() || "1";
const MEMORY_LIMIT = process.env.RUNTIME_MEMORY_LIMIT?.trim() || "512m";

type Runtime = {
  deploymentId: string;
  runtimeId: string;
  projectName: string;
  containerName: string;
  image: string;
  hostPort: number;
  containerPort: number;
  state: "running" | "stopped" | "failed";
  healthUrl: string;
  publicUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

const runtimes = new Map<string, Runtime>();
const allocatedPorts = new Set<number>();

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!WORKER_TOKEN) return next();
  if (req.header("authorization") === "Bearer " + WORKER_TOKEN) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function validProject(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(value);
}

function validRepo(value: unknown) {
  return typeof value === "string" && /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}(?:\.git)?$/i.test(value);
}

function validBranch(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._/-]{1,120}$/.test(value);
}

function validSha(value: unknown) {
  return value == null || (typeof value === "string" && /^[0-9a-f]{40}$/i.test(value));
}

function allocatePort() {
  for (let port = PORT_START; port < PORT_START + 10000; port += 1) {
    if (!allocatedPorts.has(port)) {
      allocatedPorts.add(port);
      return port;
    }
  }
  throw new Error("No runtime ports available.");
}

function releasePort(port: number) {
  allocatedPorts.delete(port);
}

async function docker(args: string[], timeout = 120000) {
  return execFileAsync("docker", args, { timeout, maxBuffer: 8 * 1024 * 1024 });
}

async function healthCheck(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "velclawhost-runtime-worker",
    hostname: os.hostname(),
    runtimes: runtimes.size,
    capacity: MAX_CONTAINERS,
  });
});

app.get("/v1/capabilities", auth, async (_req, res) => {
  let dockerAvailable = false;
  let dockerVersion: string | null = null;
  try {
    const result = await docker(["version", "--format", "{{.Server.Version}}"], 5000);
    dockerVersion = result.stdout.trim() || null;
    dockerAvailable = Boolean(dockerVersion);
  } catch {}
  res.json({
    status: "success",
    service: "velclawhost-runtime-worker",
    mode: dockerAvailable ? "runtime-enabled" : "unavailable",
    docker: { available: dockerAvailable, version: dockerVersion },
    capacity: { maxContainers: MAX_CONTAINERS, activeContainers: runtimes.size },
    limits: { cpu: CPU_LIMIT, memory: MEMORY_LIMIT, containerPort: CONTAINER_PORT },
  });
});

app.post("/v1/deployments", auth, async (req, res) => {
  const projectName = String(req.body?.projectName || "").trim();
  const repoUrl = String(req.body?.repoUrl || "").trim();
  const branch = String(req.body?.branch || "main").trim();
  const commitSha = req.body?.commitSha ? String(req.body.commitSha).trim() : null;
  const deploymentId = String(req.body?.deploymentId || "").trim();

  if (!deploymentId) return res.status(400).json({ error: "deploymentId is required." });
  if (!validProject(projectName)) return res.status(400).json({ error: "Invalid projectName." });
  if (!validRepo(repoUrl)) return res.status(400).json({ error: "Only canonical HTTPS GitHub repositories are supported." });
  if (!validBranch(branch)) return res.status(400).json({ error: "Invalid branch." });
  if (!validSha(commitSha)) return res.status(400).json({ error: "Invalid commit SHA." });
  if (runtimes.size >= MAX_CONTAINERS) return res.status(429).json({ error: "Runtime capacity exhausted." });
  if (runtimes.has(deploymentId)) return res.status(409).json({ error: "Runtime already exists.", runtime: runtimes.get(deploymentId) });

  const remote = repoUrl.replace(/\.git$/i, "");
  const workDir = path.join(WORKSPACE, deploymentId);
  const safeProject = projectName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const containerName = "velclawhost-" + deploymentId.replace(/[^a-zA-Z0-9_.-]/g, "-");
  const runtimeId = "rt-" + crypto.randomUUID();
  const hostPort = allocatePort();
  const image = IMAGE_PREFIX + "/" + safeProject + ":" + (commitSha || "latest").slice(0, 12);

  try {
    await fs.mkdir(WORKSPACE, { recursive: true });
    await fs.rm(workDir, { recursive: true, force: true });
    await execFileAsync("git", ["ls-remote", remote, branch], { timeout: 15000, maxBuffer: 1024 * 1024 });

    await execFileAsync("git", ["clone", "--depth", "1", "--branch", branch, remote, workDir], {
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const { stdout } = await execFileAsync("git", ["-C", workDir, "rev-parse", "HEAD"], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const observedCommit = stdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(observedCommit)) throw new Error("Unable to resolve repository commit.");
    if (commitSha && commitSha.toLowerCase() !== observedCommit.toLowerCase()) {
      throw new Error("Requested commit SHA does not match the cloned branch tip.");
    }

    await docker(["build", "--pull", "-t", image, workDir], 15 * 60 * 1000);
    await docker(["rm", "-f", containerName], 15000).catch(() => {});

    await docker([
      "run", "-d",
      "--name", containerName,
      "--restart", "unless-stopped",
      "--cpus", CPU_LIMIT,
      "--memory", MEMORY_LIMIT,
      "--pids-limit", "256",
      "--label", "velclawhost.deployment=" + deploymentId,
      "--label", "velclawhost.project=" + projectName,
      "-p", hostPort + ":" + CONTAINER_PORT,
      image,
    ], 30000);

    const healthUrl = "http://127.0.0.1:" + hostPort;
    const checked = await healthCheck(healthUrl);
    if (!checked.ok) {
      await docker(["rm", "-f", containerName], 15000).catch(() => {});
      throw new Error("Runtime health check failed" + (checked.status ? " with HTTP " + checked.status : "."));
    }

    const runtime: Runtime = {
      deploymentId, runtimeId, projectName, containerName, image,
      hostPort, containerPort: CONTAINER_PORT, state: "running",
      healthUrl,
      publicUrl: PUBLIC_BASE_URL ? PUBLIC_BASE_URL + ":" + hostPort : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    runtimes.set(deploymentId, runtime);
    res.status(201).json({ status: "ready", observedCommit, runtime });
  } catch (error) {
    releasePort(hostPort);
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    return res.status(502).json({
      error: "Runtime deployment failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/v1/runtimes/:deploymentId", auth, async (req, res) => {
  const runtime = runtimes.get(req.params.deploymentId);
  if (!runtime) return res.status(404).json({ error: "Runtime not found." });
  const checked = await healthCheck(runtime.healthUrl);
  if (!checked.ok) runtime.state = "failed";
  runtime.updatedAt = new Date().toISOString();
  res.json({ status: "success", runtime, health: checked });
});

app.delete("/v1/runtimes/:deploymentId", auth, async (req, res) => {
  const runtime = runtimes.get(req.params.deploymentId);
  if (!runtime) return res.status(404).json({ error: "Runtime not found." });
  await docker(["rm", "-f", runtime.containerName], 15000).catch(() => {});
  releasePort(runtime.hostPort);
  runtime.state = "stopped";
  runtime.updatedAt = new Date().toISOString();
  runtimes.delete(req.params.deploymentId);
  res.status(204).end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("VelclawHost Runtime Worker listening on 0.0.0.0:" + PORT);
});
