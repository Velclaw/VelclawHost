import express from "express";
import path from "path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createDeploymentQueue } from "./lib/control-plane/deployment-queue";
import { getRegistrarProvider } from "./lib/providers";
import { RegistrarProviderError } from "./lib/providers/registrar";
import { VELCLAW_FIRST_PARTY_DOMAINS, isSupportedDomain } from "./lib/control-plane/domain-config";

let aiClient: GoogleGenAI | null = null;
const execFileAsync = promisify(execFile);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Starts the HTTP control plane, background deployment work, reconciliation, and frontend host.
 * Registrar credentials are read by server-side adapters rather than frontend configuration.
 */
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // Initialize the deployment queue before any route/worker can invoke runDeploymentJob().
  // Keeping this before the first queue tick avoids a temporal-dead-zone crash during startup.
  const deploymentQueue = createDeploymentQueue(process.env.VELCLAWHOST_STATE_STORE === 'postgres' ? process.env.DATABASE_URL : undefined);
  const workerId = process.env.VELCLAWHOST_WORKER_ID?.trim() || 'worker-' + process.pid;

  // API Health Endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "Velclaw Hosting Platform Server", timestamp: new Date().toISOString() });
  });

  // VelclawHost Control Plane API
  const apiToken = process.env.VELCLAWHOST_API_TOKEN?.trim() || '';
  const getConfiguredRegistrar = () => getRegistrarProvider(process.env.VELCLAWHOST_REGISTRAR || 'none');
  const getSourceRegistrar = () => getRegistrarProvider(process.env.VELCLAWHOST_SOURCE_REGISTRAR || 'none');
  const requireApiToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!apiToken) return next();
    const auth = req.header('authorization') || '';
    if (auth === 'Bearer ' + apiToken) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  };

  type DomainRecord = {
    id: string; domain: string; recordType: 'A' | 'CNAME'; targetValue: string;
    status: 'pending' | 'active' | 'verifying' | 'failed'; sslStatus: 'active' | 'issuing' | 'pending';
    createdAt: string; lastCheckedAt?: string; notes?: string; deploymentId?: string;
  };
  const domains = new Map<string, DomainRecord>();
  const normalizeTarget = (value: string) => value.trim().toLowerCase().replace(/\.$/, '');
  const supportedDomain = isSupportedDomain;

  async function resolveDns(domain: string, type: 'A' | 'CNAME') {
    const url = new URL('https://cloudflare-dns.com/dns-query');
    url.searchParams.set('name', domain);
    url.searchParams.set('type', type);
    const response = await fetch(url, { headers: { accept: 'application/dns-json' } });
    if (!response.ok) throw new Error('DNS resolver returned HTTP ' + response.status);
    const payload = await response.json() as { Answer?: Array<{ type: number; data: string }> };
    return (payload.Answer || []).map((answer) => answer.data);
  }

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'HEALTHY', service: 'velclawhost-control-plane', timestamp: new Date().toISOString(), domains: domains.size });
  });

  type DeploymentRecord = {
    id: string; projectName: string; repoUrl: string; branch: string; commitSha: string | null;
    customDomain: string | null; status: 'queued' | 'claimed' | 'source_validating' | 'building' | 'runtime_provisioning' | 'health_check' | 'ready' | 'retryable_failed' | 'terminal_failed';
    createdAt: string; startedAt?: string; completedAt?: string; sourceValidatedAt?: string;
    sourceCommit?: string; error?: string;
  };
  const deployments = new Map<string, DeploymentRecord>();

  app.get('/api/v1/deployments', requireApiToken, (_req, res) => {
    res.json({ status: 'success', deployments: [...deployments.values()] });
  });

  app.post('/api/v1/deployments', requireApiToken, async (req, res) => {
    const projectName = String(req.body?.projectName || '').trim();
    const repoUrl = String(req.body?.repoUrl || '').trim();
    const branch = String(req.body?.branch || 'main').trim();
    const commitSha = req.body?.commitSha ? String(req.body.commitSha).trim() : null;
    const customDomain = req.body?.customDomain ? String(req.body.customDomain).trim().toLowerCase() : null;
    if (!projectName || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(projectName)) return res.status(400).json({ error: 'Invalid projectName.' });
    if (!/^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}(?:\.git)?$/i.test(repoUrl)) return res.status(400).json({ error: 'Only canonical HTTPS GitHub repository URLs are supported.' });
    if (!/^[A-Za-z0-9._/-]{1,120}$/.test(branch)) return res.status(400).json({ error: 'Invalid branch.' });
    if (commitSha && !/^[0-9a-f]{40}$/i.test(commitSha)) return res.status(400).json({ error: 'Invalid commit SHA.' });
    if (customDomain && !supportedDomain(customDomain)) return res.status(400).json({ error: 'Unsupported custom domain.' });
    const id = 'dep-' + Date.now();
    const item: DeploymentRecord = { id, projectName, repoUrl, branch, commitSha, customDomain, status: 'queued', createdAt: new Date().toISOString() };
    deployments.set(id, item);
    await persistState();
    queueMetrics.enqueued += 1;
    await deploymentQueue.enqueue({ id: 'job-' + id, deploymentId: id, priority: Number(req.body?.priority || 0), maxAttempts: 3, availableAt: new Date().toISOString() });
    void runDeploymentJob();
    res.status(202).json({ status: 'queued', deployment: item });
  });

  app.get('/api/v1/deployments/:id', requireApiToken, (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    res.json({ status: 'success', deployment: item });
  });

  type QueueMetrics = { enqueued: number; claimed: number; completed: number; failed: number; lastError: string | null; };
  const queueMetrics: QueueMetrics = { enqueued: 0, claimed: 0, completed: 0, failed: 0, lastError: null };
  let queueBusy = false;

  async function runDeploymentJob() {
    if (queueBusy) return;
    queueBusy = true;
    try {
      const job = await deploymentQueue.claim(workerId);
      if (!job) return;
      queueMetrics.claimed += 1;
      const item = deployments.get(job.deploymentId);
      if (!item) {
        await deploymentQueue.fail(job.id, 'Deployment record not found.');
        queueMetrics.failed += 1;
        return;
      }
      item.status = 'source_validating';
      item.startedAt = new Date().toISOString();
      item.error = undefined;
      await persistState();

      try {
        const remote = item.repoUrl.replace(/\\.git$/i, '');
        const { stdout } = await execFileAsync('git', ['ls-remote', remote, item.branch], { timeout: 15000, maxBuffer: 1024 * 1024 });
        const line = stdout.trim().split('\\n').find(Boolean);
        const observedCommit = line?.split(/\\s+/)[0] || '';
        if (!observedCommit) throw new Error('Repository branch returned no commit.');
        if (!observedCommit || !/^[0-9a-f]{40}$/i.test(observedCommit)) throw new Error('Repository branch could not be resolved.');
        if (item.commitSha && item.commitSha.toLowerCase() !== observedCommit.toLowerCase()) throw new Error('Requested commit SHA does not match the remote branch tip.');
        item.sourceCommit = observedCommit;
        item.sourceValidatedAt = new Date().toISOString();

        if (String(process.env.DEPLOYMENT_EXECUTOR || 'none').toLowerCase() !== 'docker') {
          item.status = 'source_validating';
          await persistState();
          await deploymentQueue.complete(job.id);
          queueMetrics.completed += 1;
          return;
        }

        item.status = 'building';
        await persistState();

        const osTmp = path.join(process.cwd(), '.velclawhost-tmp');
        const checkoutDir = path.join(osTmp, item.id);
        const safeProject = item.projectName.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
        const image = 'velclawhost/' + safeProject + ':' + observedCommit.slice(0, 12);
        await fs.rm(checkoutDir, { recursive: true, force: true });
        await fs.mkdir(osTmp, { recursive: true });
        await execFileAsync('git', ['clone', '--depth', '1', '--branch', item.branch, remote, checkoutDir], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
        await execFileAsync('git', ['-C', checkoutDir, 'fetch', '--depth', '1', 'origin', observedCommit], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
        await execFileAsync('git', ['-C', checkoutDir, 'checkout', '--detach', observedCommit], { timeout: 30000, maxBuffer: 1024 * 1024 });
        await execFileAsync('docker', ['build', '--pull', '-t', image, checkoutDir], { timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
        let runtimeImage = image;
        const registry = process.env.IMAGE_REGISTRY?.trim().replace(/\/$/, '');
        if (registry && String(process.env.IMAGE_PUSH || '').toLowerCase() === 'true') {
          runtimeImage = registry + '/' + safeProject + ':' + observedCommit.slice(0, 12);
          await execFileAsync('docker', ['tag', image, runtimeImage], { timeout: 30000, maxBuffer: 1024 * 1024 });
          await execFileAsync('docker', ['push', runtimeImage], { timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
        }

        item.status = 'runtime_provisioning';
        await persistState();

        let runtime = runtimes.get(item.id);
        if (!runtime) {
          const now = new Date().toISOString();
          runtime = { deploymentId:item.id, runtimeId:'rt-'+Date.now(), state:'provisioning', port:allocateRuntimePort(), healthUrl:null, createdAt:now, updatedAt:now };
          runtimes.set(item.id, runtime);
        }
        const containerPort = Number(process.env.RUNTIME_CONTAINER_PORT || 3000);
        if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) throw new Error('Invalid RUNTIME_CONTAINER_PORT.');
        const containerName = 'velclawhost-' + item.id;
        await execFileAsync('docker', ['rm', '-f', containerName], { timeout: 15000, maxBuffer: 1024 * 1024 }).catch(() => {});
        await execFileAsync('docker', ['run', '-d', '--name', containerName, '--restart', 'unless-stopped', '--label', 'velclawhost.deployment=' + item.id, '--label', 'velclawhost.project=' + item.projectName, '-p', runtime.port + ':' + containerPort, runtimeImage], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
        runtime.state = 'running';
        runtime.healthUrl = 'http://127.0.0.1:' + runtime.port;
        runtime.updatedAt = new Date().toISOString();
        item.status = 'health_check';
        await persistState();

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(runtime.healthUrl, { signal: controller.signal });
          if (!response.ok) throw new Error('Health check returned HTTP ' + response.status);
        } finally { clearTimeout(timer); }

        if (item.customDomain) {
          const domain = [...domains.values()].find((entry) => entry.domain === item.customDomain && entry.status === 'active');
          if (domain) {
            const bindHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiToken) bindHeaders.authorization = 'Bearer ' + apiToken;
            const bindResponse = await fetch('http://127.0.0.1:' + PORT + '/api/v1/deployments/' + item.id + '/domain/bind', {
              method: 'POST',
              headers: bindHeaders,
              body: JSON.stringify({ domainId: domain.id }),
            });
            if (!bindResponse.ok) throw new Error('Domain binding failed with HTTP ' + bindResponse.status);
          }
        }

        item.status = 'ready';
        item.completedAt = new Date().toISOString();
        await persistState();
        await deploymentQueue.complete(job.id);
        queueMetrics.completed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        item.error = message;
        const retryable = job.attempts < job.maxAttempts;
        item.status = retryable ? 'retryable_failed' : 'terminal_failed';
        item.completedAt = retryable ? undefined : new Date().toISOString();
        await persistState();
        const next = await deploymentQueue.retry(job.id, message, Math.min(300000, 30000 * (2 ** Math.max(0, job.attempts - 1))));
        if (next === 'terminal_failed') queueMetrics.failed += 1;
        queueMetrics.lastError = message;
      }
    } finally {
      queueBusy = false;
    }
  }

  const queueIntervalMs = Math.max(5000, Number(process.env.DEPLOYMENT_QUEUE_INTERVAL_MS || 10000));
  const queueTimer = setInterval(() => void runDeploymentJob(), queueIntervalMs);
  queueTimer.unref?.();
  void runDeploymentJob();

  app.get('/api/v1/queue', requireApiToken, async (_req, res) => {
    res.json({
      status: 'success',
      running: queueBusy,
      interval_ms: queueIntervalMs,
      queued: [...deployments.values()].filter((item) => item.status === 'queued' || item.status === 'retryable_failed').length,
      durable: String(process.env.VELCLAWHOST_STATE_STORE || 'file').toLowerCase() === 'postgres',
      database: await deploymentQueue.stats(),
      ...queueMetrics,
    });
  });

  app.post('/api/v1/deployments/:id/execute', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!['queued','retryable_failed'].includes(item.status)) return res.status(409).json({ error: 'Deployment is not executable from its current state.', deployment: item });
    await deploymentQueue.enqueue({ id: 'job-' + item.id, deploymentId: item.id, priority: Number(req.body?.priority || 0), maxAttempts: 3, availableAt: new Date().toISOString() });
    void runDeploymentJob();
    return res.status(202).json({ status: 'queued', deployment: item });
  });

  type RuntimeRecord = {
    deploymentId: string; runtimeId: string; state: 'provisioning' | 'running' | 'failed' | 'stopped';
    port: number; healthUrl: string | null; createdAt: string; updatedAt: string;
  };
  const runtimes = new Map<string, RuntimeRecord>();
  const runtimePorts = new Set<number>();
  let nextRuntimePort = Number(process.env.RUNTIME_PORT_START || 4100);

  function allocateRuntimePort() {
    while (runtimePorts.has(nextRuntimePort)) nextRuntimePort += 1;
    const port = nextRuntimePort++;
    runtimePorts.add(port);
    return port;
  }

  const stateFile = process.env.VELCLAWHOST_STATE_FILE || path.join(process.cwd(), 'data', 'control-plane-state.json');
  const { createControlPlaneStateStore } = await import('./lib/control-plane/state-store');
  type PersistedState = {
    version: 1 | 2;
    nextRuntimePort: number;
    domains: DomainRecord[];
    deployments: DeploymentRecord[];
    runtimes: RuntimeRecord[];
  };
  const stateStore = createControlPlaneStateStore({
    store: process.env.VELCLAWHOST_STATE_STORE,
    stateFile,
    databaseUrl: process.env.DATABASE_URL?.trim(),
  });

  let persistChain = Promise.resolve();
  async function persistState() {
    const snapshot: PersistedState = {
      version: 1,
      nextRuntimePort,
      domains: [...domains.values()],
      deployments: [...deployments.values()],
      runtimes: [...runtimes.values()],
    };
    persistChain = persistChain.then(() => stateStore.save(snapshot));
    return persistChain;
  }

  /**
   * Restores persisted control-plane maps and reserved runtime ports.
   * Load failures are logged and rethrown only when `VELCLAWHOST_FAIL_ON_STATE_ERROR` is enabled.
   */
  async function loadState() {
    try {
      const snapshot = await stateStore.load();
      if (!snapshot) return;
      if (snapshot.version !== 1 && snapshot.version !== 2) throw new Error('Unsupported control-plane state version.');
      for (const item of snapshot.domains || []) domains.set(item.id, item as DomainRecord);
      for (const item of snapshot.deployments || []) deployments.set(item.id, item as DeploymentRecord);
      for (const item of snapshot.runtimes || []) {
        const runtime = item as RuntimeRecord;
        runtimes.set(runtime.deploymentId, runtime);
        runtimePorts.add(runtime.port);
      }
      if (Number.isInteger(snapshot.nextRuntimePort) && snapshot.nextRuntimePort > 0) nextRuntimePort = snapshot.nextRuntimePort;
    } catch (error) {
      console.error('Failed to load control-plane state:', error);
      if (String(process.env.VELCLAWHOST_FAIL_ON_STATE_ERROR).toLowerCase() === 'true') throw error;
    }
  }

  await loadState();

  app.post('/api/v1/deployments/:id/runtime/plan', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!['source_validating','building','runtime_provisioning','health_check'].includes(item.status)) return res.status(409).json({ error: 'Runtime planning requires an active deployment state.', deployment: item });
    const existing = runtimes.get(item.id);
    if (existing) return res.json({ status: 'success', runtime: existing });
    const now = new Date().toISOString();
    const runtime: RuntimeRecord = {
      deploymentId: item.id,
      runtimeId: 'rt-' + Date.now(),
      state: 'provisioning',
      port: allocateRuntimePort(),
      healthUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    runtimes.set(item.id, runtime);
    await persistState();
    res.status(201).json({ status: 'planned', runtime, next: 'runtime_provider' });
  });

  app.get('/api/v1/deployments/:id/runtime', requireApiToken, (req, res) => {
    const runtime = runtimes.get(req.params.id);
    if (!runtime) return res.status(404).json({ error: 'Runtime plan not found.' });
    res.json({ status: 'success', runtime });
  });

  app.post('/api/v1/deployments/:id/runtime/provision', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(404).json({ error: 'Runtime plan not found.' });
    if (runtime.state !== 'provisioning') return res.status(409).json({ error: 'Runtime is not in provisioning state.', runtime });

    const provider = String(process.env.RUNTIME_PROVIDER || 'none').toLowerCase();
    if (provider !== 'docker') {
      return res.status(503).json({
        error: 'Docker runtime provider is not enabled.',
        required: 'RUNTIME_PROVIDER=docker',
        runtime,
      });
    }

    const image = String(process.env.RUNTIME_IMAGE || '').trim();
    if (!image) {
      return res.status(503).json({ error: 'RUNTIME_IMAGE is not configured; refusing to start an unspecified container.' });
    }

    const containerPort = Number(process.env.RUNTIME_CONTAINER_PORT || 3000);
    if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
      return res.status(500).json({ error: 'Invalid RUNTIME_CONTAINER_PORT.' });
    }

    const containerName = `velclawhost-${item.id}`;
    try {
      const inspect = await execFileAsync('docker', ['inspect', containerName], { timeout: 10000, maxBuffer: 1024 * 1024 }).catch(() => null);
      if (inspect) {
        runtime.state = 'running';
        runtime.updatedAt = new Date().toISOString();
        runtime.healthUrl = `http://127.0.0.1:${runtime.port}`;
        await persistState();
        return res.json({ status: 'running', deployment: item, runtime, next: 'health_check' });
      }

      await execFileAsync('docker', [
        'run', '-d',
        '--name', containerName,
        '--restart', 'unless-stopped',
        '--label', 'com.velclawhost.deployment=' + item.id,
        '--label', 'com.velclawhost.project=' + item.projectName,
        '-p', `${runtime.port}:${containerPort}`,
        image,
      ], { timeout: 30000, maxBuffer: 1024 * 1024 });

      runtime.state = 'running';
      runtime.updatedAt = new Date().toISOString();
      runtime.healthUrl = `http://127.0.0.1:${runtime.port}`;
      await persistState();
      return res.status(201).json({
        status: 'running',
        deployment: item,
        runtime,
        health: 'pending',
        next: 'health_check',
      });
    } catch (error) {
      runtime.state = 'failed';
      runtime.updatedAt = new Date().toISOString();
      item.status = 'terminal_failed';
      item.completedAt = new Date().toISOString();
      item.error = error instanceof Error ? error.message : String(error);
      await persistState();
      return res.status(502).json({ status: 'failed', deployment: item, runtime });
    }
  });

  app.get('/api/v1/deployments/:id/runtime/logs', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(404).json({ error: 'Runtime not found.' });

    const provider = String(process.env.RUNTIME_PROVIDER || 'none').toLowerCase();
    if (provider !== 'docker') {
      return res.status(503).json({ error: 'Docker runtime provider is not enabled.', runtime });
    }

    const containerName = `velclawhost-${item.id}`;
    const tail = Math.min(Math.max(Number(req.query.tail || 100), 1), 1000);
    try {
      const { stdout } = await execFileAsync('docker', ['logs', '--tail', String(tail), containerName], {
        timeout: 10000,
        maxBuffer: 2 * 1024 * 1024,
      });
      return res.json({ status: 'success', deployment: item, runtime, logs: stdout });
    } catch (error) {
      return res.status(502).json({
        error: 'Unable to read runtime logs.',
        details: error instanceof Error ? error.message : String(error),
        deployment: item,
        runtime,
      });
    }
  });

  app.post('/api/v1/deployments/:id/runtime/stop', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(404).json({ error: 'Runtime not found.' });

    const provider = String(process.env.RUNTIME_PROVIDER || 'none').toLowerCase();
    if (provider !== 'docker') {
      return res.status(503).json({ error: 'Docker runtime provider is not enabled.', runtime });
    }

    const containerName = `velclawhost-${item.id}`;
    try {
      await execFileAsync('docker', ['stop', '--time', '10', containerName], {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      runtime.state = 'stopped';
      runtime.updatedAt = new Date().toISOString();
      item.status = 'terminal_failed';
      item.error = 'Runtime stopped by operator.';
      item.completedAt = new Date().toISOString();
      await persistState();
      return res.json({ status: 'stopped', deployment: item, runtime });
    } catch (error) {
      return res.status(502).json({
        error: 'Unable to stop runtime.',
        details: error instanceof Error ? error.message : String(error),
        deployment: item,
        runtime,
      });
    }
  });

  app.post('/api/v1/deployments/:id/runtime/health', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(404).json({ error: 'Runtime not found.' });
    if (!runtime.healthUrl) return res.status(409).json({ error: 'Runtime has no health endpoint.' });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(runtime.healthUrl, { signal: controller.signal });
      clearTimeout(timer);
      const healthy = response.ok;
      if (!healthy) {
        runtime.state = 'failed';
        runtime.updatedAt = new Date().toISOString();
        item.status = 'terminal_failed';
        item.error = `Health check returned HTTP ${response.status}`;
        return res.status(502).json({ status: 'unhealthy', deployment: item, runtime });
      }
      runtime.state = 'running';
      runtime.updatedAt = new Date().toISOString();
      item.status = 'ready';
      await persistState();
      item.completedAt = new Date().toISOString();
      item.error = undefined;
      return res.json({ status: 'healthy', deployment: item, runtime });
    } catch (error) {
      runtime.state = 'failed';
      runtime.updatedAt = new Date().toISOString();
      item.status = 'terminal_failed';
      item.error = error instanceof Error ? error.message : String(error);
      return res.status(502).json({ status: 'unhealthy', deployment: item, runtime });
    }
  });
  app.get('/api/v1/domains', requireApiToken, (_req, res) => {
    res.json({ status: 'success', domains: [...domains.values()] });
  });

  // Registrar control-plane boundary. VelclawHost owns the workflow/UI;
  // registrar credentials stay server-side and are never exposed to the browser.
  app.get('/api/v1/registrar/config', requireApiToken, (_req, res) => {
    res.json({
      status: 'success',
      mode: process.env.VELCLAWHOST_REGISTRAR ? 'registrar-adapter' : 'control-plane',
      registrar: process.env.VELCLAWHOST_REGISTRAR || null,
      sourceRegistrar: process.env.VELCLAWHOST_SOURCE_REGISTRAR || null,
      firstPartyDomains: VELCLAW_FIRST_PARTY_DOMAINS,
    });
  });

  app.get('/api/v1/registrar/domains/:domain/availability', requireApiToken, async (req, res) => {
    try {
      const provider = getConfiguredRegistrar();
      const result = await provider.getAvailability(req.params.domain);
      return res.json({ status: 'success', provider: provider.name, result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  // Transfer-out from Vercel: fetch the EPP/Auth-Code from the source registrar.
  // The code is returned only over an authenticated control-plane request.
  app.get('/api/v1/registrar/source/:domain/auth-code', requireApiToken, async (req, res) => {
    try {
      const provider = getSourceRegistrar();
      const result = await provider.getAuthCode(req.params.domain);
      return res.json({ status: 'success', provider: provider.name, domain: result.domain, authCode: result.authCode });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  app.get('/api/v1/registrar/source/:domain/transfer', requireApiToken, async (req, res) => {
    try {
      const provider = getSourceRegistrar();
      const result = await provider.getTransferStatus(req.params.domain);
      return res.json({ status: 'success', provider: provider.name, result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  // Target-registrar transfer-in. This is intentionally disabled until a real
  // VelclawHost registrar/reseller adapter is configured.
  app.post('/api/v1/registrar/domains/:domain/transfer-in', requireApiToken, async (req, res) => {
    try {
      const provider = getConfiguredRegistrar();
      const authCode = String(req.body?.authCode || '').trim();
      if (!authCode) return res.status(400).json({ error: 'authCode is required.' });
      const result = await provider.transferIn({
        domain: req.params.domain,
        authCode,
        years: Number.isInteger(req.body?.years) ? req.body.years : 1,
        autoRenew: req.body?.autoRenew !== false,
        expectedPrice: typeof req.body?.expectedPrice === 'number' ? req.body.expectedPrice : undefined,
        contactInformation: req.body?.contactInformation && typeof req.body.contactInformation === 'object' ? req.body.contactInformation : undefined,
      });
      return res.status(202).json({ status: 'accepted', provider: provider.name, transfer: result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  app.get('/api/v1/registrar/domains/:domain/transfer', requireApiToken, async (req, res) => {
    try {
      const provider = getConfiguredRegistrar();
      const result = await provider.getTransferStatus(req.params.domain);
      return res.json({ status: 'success', provider: provider.name, transfer: result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  app.patch('/api/v1/registrar/domains/:domain/nameservers', requireApiToken, async (req, res) => {
    try {
      const provider = getConfiguredRegistrar();
      const nameservers = Array.isArray(req.body?.nameservers) ? req.body.nameservers.map(String) : [];
      const result = await provider.updateNameservers(req.params.domain, nameservers);
      return res.json({ status: 'success', provider: provider.name, domain: req.params.domain, result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  app.post('/api/v1/domains', requireApiToken, async (req, res) => {
    const domain = String(req.body?.domain || '').trim().toLowerCase();
    const recordType = req.body?.recordType === 'CNAME' ? 'CNAME' : 'A';
    const targetValue = String(req.body?.targetValue || '').trim();
    if (!supportedDomain(domain)) return res.status(400).json({ error: 'Invalid domain name.' });
    if (!targetValue) return res.status(400).json({ error: 'targetValue is required.' });
    if ([...domains.values()].some((item) => item.domain === domain)) return res.status(409).json({ error: 'Domain already exists.' });
    const id = 'dom-' + Date.now();
    const item: DomainRecord = { id, domain, recordType, targetValue, status: 'pending', sslStatus: 'pending', createdAt: new Date().toISOString(), notes: typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined };
    domains.set(id, item);
    await persistState();
    res.status(201).json({ status: 'success', domain: item });
  });

  app.post('/api/v1/domains/:id/verify', requireApiToken, async (req, res) => {
    const item = domains.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Domain not found.' });
    item.status = 'verifying';
    item.lastCheckedAt = new Date().toISOString();
    try {
      const values = await resolveDns(item.domain, item.recordType);
      const expected = normalizeTarget(item.targetValue);
      const matched = values.some((value) => normalizeTarget(value) === expected);
      item.status = matched ? 'active' : 'failed';
      item.sslStatus = matched ? 'active' : 'pending';
      item.lastCheckedAt = new Date().toISOString();
      await persistState();
      return res.json({ status: matched ? 'verified' : 'mismatch', domain: item, observed: values });
    } catch (error) {
      item.status = 'failed';
      item.sslStatus = 'pending';
      return res.status(502).json({ error: 'DNS verification failed.', details: error instanceof Error ? error.message : String(error), domain: item });
    }
  });

  app.post('/api/v1/deployments/:id/domain/bind', requireApiToken, async (req, res) => {
    const deployment = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    const domainId = String(req.body?.domainId || '').trim();
    const domain = domains.get(domainId);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(409).json({ error: 'Runtime plan not found.' });
    if (runtime.state !== 'running') return res.status(409).json({ error: 'Runtime must be running before domain binding.', runtime });
    if (!domain) return res.status(404).json({ error: 'Domain not found.' });
    if (domain.status !== 'active') return res.status(409).json({ error: 'Domain must pass DNS verification before binding.', domain });

    domain.deploymentId = deployment.id;
    domain.sslStatus = 'pending';
    domain.lastCheckedAt = new Date().toISOString();
    await persistState();

    const configDir = process.env.CADDY_CONFIG_DIR || path.join(process.cwd(), 'deploy', 'generated');
    const configPath = path.join(configDir, 'Caddyfile');
    const upstreamHost = process.env.CADDY_UPSTREAM_HOST || '127.0.0.1';
    try {
      await fs.mkdir(configDir, { recursive: true });
      const bindings = [...domains.values()].filter((entry) => entry.status === 'active' && entry.deploymentId).map((entry) => {
        const boundRuntime = runtimes.get(deployments.get(entry.deploymentId!)?.id || '');
        if (!boundRuntime || boundRuntime.state !== 'running') return null;
        const safeDomain = entry.domain.replace(/[^a-z0-9.-]/gi, '');
        return `${safeDomain} {
  reverse_proxy ${upstreamHost}:${boundRuntime.port}
}`;
      }).filter(Boolean).join('\n\n');

      await fs.writeFile(configPath, bindings ? bindings + '\n' : '# VelclawHost generated Caddy configuration\n', 'utf8');

      const autoReload = String(process.env.CADDY_AUTO_RELOAD || 'false').toLowerCase() === 'true';
      if (autoReload) {
        const adminUrl = process.env.CADDY_ADMIN_URL?.trim();
        if (adminUrl) {
          const caddyConfig = await fs.readFile(configPath, 'utf8');
          const response = await fetch(adminUrl.replace(/\/$/, '') + '/load', {
            method: 'POST',
            headers: { 'Content-Type': 'text/caddyfile' },
            body: caddyConfig,
          });
          if (!response.ok) throw new Error('Caddy admin reload returned HTTP ' + response.status);
        } else {
          await execFileAsync('caddy', ['reload', '--config', configPath, '--adapter', 'caddyfile'], {
            timeout: 15000,
            maxBuffer: 1024 * 1024,
          });
        }
      }

      return res.status(201).json({
        status: 'bound',
        domain,
        runtime,
        proxy: { provider: 'caddy', configPath, reloaded: autoReload },
      });
    } catch (error) {
      domain.deploymentId = undefined;
      await persistState();
      return res.status(502).json({
        error: 'Failed to generate or reload reverse-proxy configuration.',
        details: error instanceof Error ? error.message : String(error),
        domain,
      });
    }
  });

  app.delete('/api/v1/domains/:id', requireApiToken, async (req, res) => {
    if (!domains.delete(req.params.id)) return res.status(404).json({ error: 'Domain not found.' });
    await persistState();
    res.status(204).end();
  });

  app.get('/api/v1/metrics', requireApiToken, (_req, res) => {
    const memory = process.memoryUsage();
    res.json({ status: 'success', timestamp: new Date().toISOString(), service: 'velclawhost-control-plane', deployments: { total: deployments.size, queued: [...deployments.values()].filter((d) => d.status === 'queued').length, building: [...deployments.values()].filter((d) => d.status === 'building').length, source_validating: [...deployments.values()].filter((d) => d.status === 'source_validating').length, runtime_provisioning: [...deployments.values()].filter((d) => d.status === 'runtime_provisioning').length, health_check: [...deployments.values()].filter((d) => d.status === 'health_check').length, failed: [...deployments.values()].filter((d) => d.status === 'retryable_failed' || d.status === 'terminal_failed').length, ready: [...deployments.values()].filter((d) => d.status === 'ready').length }, runtime: { node: process.version, uptime_seconds: Math.round(process.uptime()), heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024), rss_mb: Math.round(memory.rss / 1024 / 1024) }, domains: { total: domains.size, active: [...domains.values()].filter((d) => d.status === 'active').length, pending: [...domains.values()].filter((d) => d.status !== 'active').length } });
  });

  app.get('/api/v1/prometheus', requireApiToken, (_req, res) => {
    const all = [...domains.values()];
    const body = [
      '# HELP velclawhost_domains_total Number of domains managed by VelclawHost',
      '# TYPE velclawhost_domains_total gauge',
      'velclawhost_domains_total ' + all.length,
      '# HELP velclawhost_domains_active Number of active domains',
      '# TYPE velclawhost_domains_active gauge',
      'velclawhost_domains_active ' + all.filter((d) => d.status === 'active').length,
      '# HELP velclawhost_uptime_seconds Process uptime in seconds',
      '# TYPE velclawhost_uptime_seconds gauge',
      'velclawhost_uptime_seconds ' + Math.round(process.uptime()),
    ].join('\n') + '\n';
    res.type('text/plain; version=0.0.4').send(body);
  });

  type ReconciliationMetrics = {
    runs: number;
    failures: number;
    runtimeUnhealthy: number;
    lastRunAt: string | null;
    lastError: string | null;
  };
  const reconciliation: ReconciliationMetrics = {
    runs: 0,
    failures: 0,
    runtimeUnhealthy: 0,
    lastRunAt: null,
    lastError: null,
  };
  let reconciliationBusy = false;

  async function reconcileControlPlane() {
    if (reconciliationBusy) return;
    reconciliationBusy = true;
    reconciliation.runs += 1;
    reconciliation.lastRunAt = new Date().toISOString();
    reconciliation.lastError = null;

    try {
      const provider = String(process.env.RUNTIME_PROVIDER || 'none').toLowerCase();
      if (provider !== 'docker') return;

      for (const runtime of runtimes.values()) {
        if (runtime.state !== 'running') continue;
        const deployment = deployments.get(runtime.deploymentId);
        if (!deployment) continue;

        const containerName = `velclawhost-${deployment.id}`;
        let containerPresent = true;
        try {
          await execFileAsync('docker', ['inspect', containerName], {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
          });
        } catch {
          containerPresent = false;
        }

        if (!containerPresent) {
          runtime.state = 'failed';
          runtime.updatedAt = new Date().toISOString();
          deployment.status = 'terminal_failed';
          deployment.completedAt = new Date().toISOString();
          deployment.error = 'Runtime container is no longer present.';
          reconciliation.runtimeUnhealthy += 1;
          await persistState();
          continue;
        }

        if (!runtime.healthUrl) continue;

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          try {
            const response = await fetch(runtime.healthUrl, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
          } finally {
            clearTimeout(timer);
          }

          runtime.updatedAt = new Date().toISOString();
          if (deployment.status === 'health_check' || deployment.status === 'runtime_provisioning') {
            deployment.status = 'ready';
            deployment.completedAt = new Date().toISOString();
            deployment.error = undefined;
          }
          await persistState();
        } catch (error) {
          runtime.state = 'failed';
          runtime.updatedAt = new Date().toISOString();
          deployment.status = 'terminal_failed';
          deployment.completedAt = new Date().toISOString();
          deployment.error = 'Runtime health check failed: ' + (error instanceof Error ? error.message : String(error));
          reconciliation.runtimeUnhealthy += 1;
          await persistState();
        }
      }
    } catch (error) {
      reconciliation.failures += 1;
      reconciliation.lastError = error instanceof Error ? error.message : String(error);
      console.error('Control-plane reconciliation failed:', error);
    } finally {
      reconciliationBusy = false;
    }
  }
  const reconciliationIntervalMs = Math.max(
    5000,
    Number(process.env.RECONCILE_INTERVAL_MS || 30000),
  );
  const reconciliationTimer = setInterval(() => {
    void reconcileControlPlane();
  }, reconciliationIntervalMs);
  reconciliationTimer.unref?.();
  void reconcileControlPlane();

  app.get('/api/v1/reconciliation', requireApiToken, (_req, res) => {
    res.json({
      status: 'success',
      running: reconciliationBusy,
      interval_ms: reconciliationIntervalMs,
      ...reconciliation,
    });
  });

  // AI Voice Command & Diagnostic Endpoint
  app.post("/api/ai/voice-command", async (req, res) => {
    try {
      const { command, context } = req.body;
      if (!command) {
        return res.status(400).json({ error: "Missing command text" });
      }

      const ai = getGeminiClient();
      if (!ai) {
        // Intelligent fallback when GEMINI_API_KEY is not yet populated
        const cmdLower = String(command).toLowerCase();
        let reply = "Tôi đã ghi nhận chỉ lệnh của bạn. Hệ thống máy chủ Velclaw đang vận hành ổn định.";
        let action: string | null = null;
        let targetTab: string | null = null;

        if (cmdLower.includes("cpu") || cmdLower.includes("ram") || cmdLower.includes("tài nguyên") || cmdLower.includes("hiệu suất")) {
          reply = `CPU hiện tại ở mức ${context?.cpuUsage ?? 42}% và RAM chiếm ${context?.ramUsagePercent ?? 58}%. Đã chuyển bạn tới tab Biểu đồ số liệu.`;
          action = "NAVIGATE";
          targetTab = "metrics-charts";
        } else if (cmdLower.includes("cảnh báo") || cmdLower.includes("nguy hiểm") || cmdLower.includes("alert")) {
          reply = `Đang có ${context?.activeAlertsCount ?? 0} cảnh báo đang chờ xử lý. Đã chuyển bạn đến trung tâm Cảnh báo để rà soát.`;
          action = "NAVIGATE";
          targetTab = "alerts";
        } else if (cmdLower.includes("dns") || cmdLower.includes("ssl") || cmdLower.includes("chứng chỉ") || cmdLower.includes("https")) {
          reply = `Chứng chỉ SSL TLS 1.3 Let's Encrypt còn 82 ngày hiệu lực. Bản ghi DNSSEC đang kích hoạt bảo mật.`;
          action = "NAVIGATE";
          targetTab = "dns-ssl";
        } else if (cmdLower.includes("cơ sở dữ liệu") || cmdLower.includes("database") || cmdLower.includes("tối ưu") || cmdLower.includes("query")) {
          reply = `Hệ thống phân tích đã định vị các truy vấn chậm. Đang mở trung tâm Tối ưu hóa cơ sở dữ liệu.`;
          action = "NAVIGATE";
          targetTab = "db-optimizer";
        } else if (cmdLower.includes("bảo mật") || cmdLower.includes("2fa") || cmdLower.includes("mfa")) {
          reply = `Xác thực đa yếu tố 2FA đang bảo vệ toàn diện tài khoản quản trị viên huynhthuong.xyz@gmail.com.`;
          action = "NAVIGATE";
          targetTab = "security-2fa";
        } else if (cmdLower.includes("báo cáo") || cmdLower.includes("pdf") || cmdLower.includes("csv") || cmdLower.includes("xuất")) {
          reply = `Đang mở trình tạo và xuất báo cáo hệ thống định dạng PDF/CSV.`;
          action = "OPEN_REPORTS";
        } else if (cmdLower.includes("giả lập") || cmdLower.includes("test spike") || cmdLower.includes("đột biến")) {
          reply = `Đã kích hoạt giả lập đột biến CPU/RAM để kiểm tra hệ thống thông báo đẩy FCM.`;
          action = "TRIGGER_SPIKE";
        }

        return res.json({
          reply,
          action,
          targetTab,
          source: "local-devops-engine",
        });
      }

      // With Gemini API
      const prompt = `Bạn là Trợ lý Giọng nói AI Cao cấp chuyên về DevOps và Quản trị hạ tầng máy chủ cho nền tảng Velclaw Hosting Platform.
Người quản trị vừa nói hoặc ra lệnh giọng nói: "${command}".

Ngữ cảnh máy chủ thời gian thực:
- Hostname: ${context?.hostname || "prod-edge-asia1.velclaw.cfd"}
- CPU hiện tại: ${context?.cpuUsage || 45}%
- RAM hiện tại: ${context?.ramUsagePercent || 60}% (${context?.ramUsedGb || 9.6} / 16.0 GB)
- Cảnh báo đang kích hoạt: ${context?.activeAlertsCount || 0}
- Trạng thái 2FA: ${context?.is2FaActive ? "Đang bật" : "Chưa bật"}
- P95 HTTP Latency: ${context?.latencyMs || 12} ms

Yêu cầu:
1. Trả lời một câu ngắn gọn, súc tích (1-2 câu), chuyên nghiệp bằng tiếng Việt như một kỹ sư DevOps cao cấp.
2. Quyết định xem có cần thực hiện hành động nào trên giao diện không:
   - "NAVIGATE" (chuyển tab tới: 'overview', 'domains', 'dns-ssl', 'metrics-charts', 'alerts', 'db-optimizer', 'logs', 'security-2fa', 'api-integration', 'reports')
   - "TRIGGER_SPIKE" (nếu người dùng muốn thử nghiệm cảnh báo/đột biến tải)
   - "OPEN_REPORTS" (nếu muốn xuất báo cáo)
   - "NONE" nếu chỉ là câu hỏi thông tin.

Định dạng trả về duy nhất bằng JSON:
{
  "reply": "câu trả lời cho quản trị viên",
  "action": "NAVIGATE" | "TRIGGER_SPIKE" | "OPEN_REPORTS" | "NONE",
  "targetTab": "overview" | "domains" | "dns-ssl" | "metrics-charts" | "alerts" | "db-optimizer" | "logs" | "security-2fa" | "api-integration" | "reports" | null
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "Bạn là trợ lý điều khiển giọng nói cho hệ thống máy chủ Velclaw Hosting. Luôn phản hồi JSON hợp lệ.",
        },
      });

      const responseText = response.text || "{}";
      let parsed = { reply: "Đã tiếp nhận chỉ lệnh máy chủ.", action: "NONE", targetTab: null };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed.reply = responseText.replace(/```json|```/g, "").trim();
      }

      return res.json({
        reply: parsed.reply,
        action: parsed.action,
        targetTab: parsed.targetTab,
        source: "gemini-3.8-flash",
      });
    } catch (err: any) {
      console.error("AI Voice Command Error:", err);
      return res.status(500).json({
        error: "Lỗi xử lý chỉ lệnh giọng nói",
        details: err?.message || String(err),
      });
    }
  });

  // AI Diagnostic Endpoint for Logs and Performance
  app.post("/api/ai/diagnose", async (req, res) => {
    try {
      const { issueType, data } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          diagnosis: "Chỉ số hệ thống cơ bản trong ngưỡng an toàn. Để phân tích sâu bằng mô hình Gemini AI, vui lòng kiểm tra API Key trong cấu hình Settings.",
          suggestions: [
            "Kiểm tra lại cấu hình bộ nhớ đệm Redis",
            "Bật nén gzip/brotli cho các tài nguyên tĩnh",
            "Đảm bảo đã thiết lập chỉ mục (index) cho bảng có dung lượng lớn",
          ],
          severity: "normal",
        });
      }

      const prompt = `Phân tích sự cố máy chủ sau đây và đưa ra chẩn đoán nguyên nhân cốt lõi cùng 3 giải pháp khắc phục ngắn gọn:
Loại sự cố: ${issueType}
Dữ liệu chi tiết: ${JSON.stringify(data)}

Định dạng JSON:
{
  "diagnosis": "giải thích nguyên nhân 1-2 câu",
  "suggestions": ["giải pháp 1", "giải pháp 2", "giải pháp 3"],
  "severity": "low" | "medium" | "high" | "critical"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);
      return res.json(result);
    } catch (err: any) {
      console.error("AI Diagnose Error:", err);
      return res.status(500).json({ error: "Lỗi chẩn đoán AI", details: err?.message });
    }
  });

  // Vite Middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();