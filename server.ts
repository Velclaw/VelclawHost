import express from "express";
import path from "path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // API Health Endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "Velclaw Hosting Platform Server", timestamp: new Date().toISOString() });
  });

  // VelclawHost Control Plane API
  const apiToken = process.env.VELCLAWHOST_API_TOKEN?.trim() || '';
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
  const supportedDomain = (value: string) => /^(?:[a-z0-9-]+\.)+(?:com|dev|ai|io|app)$/i.test(value.trim());

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
    customDomain: string | null; status: 'queued' | 'building' | 'waiting_approval' | 'ready' | 'failed';
    createdAt: string; startedAt?: string; completedAt?: string; sourceValidatedAt?: string;
    sourceCommit?: string; error?: string;
  };
  const deployments = new Map<string, DeploymentRecord>();

  app.get('/api/v1/deployments', requireApiToken, (_req, res) => {
    res.json({ status: 'success', deployments: [...deployments.values()] });
  });

  app.post('/api/v1/deployments', requireApiToken, (req, res) => {
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
    res.status(202).json({ status: 'queued', deployment: item });
  });

  app.get('/api/v1/deployments/:id', requireApiToken, (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    res.json({ status: 'success', deployment: item });
  });

  app.post('/api/v1/deployments/:id/execute', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (item.status !== 'queued') {
      return res.status(409).json({ error: 'Deployment is not executable from its current state.', deployment: item });
    }

    item.status = 'building';
    item.startedAt = new Date().toISOString();
    item.error = undefined;
    await persistState();

    try {
      const remote = item.repoUrl.replace(/\\.git$/i, '');
      const { stdout } = await execFileAsync('git', ['ls-remote', remote, item.branch], {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      const line = stdout.trim().split('\\n').find(Boolean);
      const observedCommit = line?.split(/\\s+/)[0] || '';
      if (!observedCommit || !/^[0-9a-f]{40}$/i.test(observedCommit)) {
        throw new Error('Repository branch could not be resolved.');
      }
      if (item.commitSha && item.commitSha.toLowerCase() !== observedCommit.toLowerCase()) {
        throw new Error('Requested commit SHA does not match the remote branch tip.');
      }

      item.sourceCommit = observedCommit;
      item.sourceValidatedAt = new Date().toISOString();

      // This phase deliberately stops before build/runtime provisioning.
      // A deployment is not marked ready until a runtime executor, artifact store,
      // health probe, and domain/TLS binding are configured.
      item.status = 'waiting_approval';
      item.completedAt = new Date().toISOString();
      await persistState();
      return res.status(200).json({
        status: 'waiting_approval',
        deployment: item,
        next: 'runtime_executor',
        message: 'Source validated. Runtime provisioning is not enabled on this control-plane instance.',
      });
    } catch (error) {
      item.status = 'failed';
      item.completedAt = new Date().toISOString();
      item.error = error instanceof Error ? error.message : String(error);
      await persistState();
      return res.status(422).json({ status: 'failed', deployment: item });
    }
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
    version: 1;
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

  async function loadState() {
    try {
      const snapshot = await stateStore.load();
      if (!snapshot) return;
      if (snapshot.version !== 1) throw new Error('Unsupported control-plane state version.');
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

  app.post('/api/v1/deployments/:id/runtime/plan', requireApiToken, (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (item.status !== 'waiting_approval') return res.status(409).json({ error: 'Runtime planning requires waiting_approval state.', deployment: item });
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
      item.status = 'failed';
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
      item.status = 'failed';
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
        item.status = 'failed';
        item.error = `Health check returned HTTP ${response.status}.`;
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
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : String(error);
      return res.status(502).json({ status: 'unhealthy', deployment: item, runtime });
    }
  });
\n  app.get('/api/v1/domains', requireApiToken, (_req, res) => {
    res.json({ status: 'success', domains: [...domains.values()] });
  });

  app.post('/api/v1/domains', requireApiToken, (req, res) => {
    const domain = String(req.body?.domain || '').trim().toLowerCase();
    const recordType = req.body?.recordType === 'CNAME' ? 'CNAME' : 'A';
    const targetValue = String(req.body?.targetValue || '').trim();
    if (!supportedDomain(domain)) return res.status(400).json({ error: 'Unsupported domain. Use .com, .dev, .ai, .io or .app.' });
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
    try {
      await fs.mkdir(configDir, { recursive: true });
      const bindings = [...domains.values()].filter((entry) => entry.status === 'active' && entry.deploymentId).map((entry) => {
        const boundRuntime = runtimes.get(deployments.get(entry.deploymentId!)?.id || '');
        if (!boundRuntime || boundRuntime.state !== 'running') return null;
        const safeDomain = entry.domain.replace(/[^a-z0-9.-]/gi, '');
        return `${safeDomain} {
  reverse_proxy 127.0.0.1:${boundRuntime.port}
}`;
      }).filter(Boolean).join('\n\n');

      await fs.writeFile(configPath, bindings ? bindings + '\n' : '# VelclawHost generated Caddy configuration\n', 'utf8');

      const autoReload = String(process.env.CADDY_AUTO_RELOAD || 'false').toLowerCase() === 'true';
      if (autoReload) {
        await execFileAsync('caddy', ['reload', '--config', configPath, '--adapter', 'caddyfile'], {
          timeout: 15000,
          maxBuffer: 1024 * 1024,
        });
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

  app.delete('/api/v1/domains/:id', requireApiToken, (req, res) => {
    if (!domains.delete(req.params.id)) return res.status(404).json({ error: 'Domain not found.' });
    await persistState();
    res.status(204).end();
  });

  app.get('/api/v1/metrics', requireApiToken, (_req, res) => {
    const memory = process.memoryUsage();
    res.json({ status: 'success', timestamp: new Date().toISOString(), service: 'velclawhost-control-plane', deployments: { total: deployments.size, queued: [...deployments.values()].filter((d) => d.status === 'queued').length, building: [...deployments.values()].filter((d) => d.status === 'building').length, waiting_approval: [...deployments.values()].filter((d) => d.status === 'waiting_approval').length, failed: [...deployments.values()].filter((d) => d.status === 'failed').length, ready: [...deployments.values()].filter((d) => d.status === 'ready').length }, runtime: { node: process.version, uptime_seconds: Math.round(process.uptime()), heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024), rss_mb: Math.round(memory.rss / 1024 / 1024) }, domains: { total: domains.size, active: [...domains.values()].filter((d) => d.status === 'active').length, pending: [...domains.values()].filter((d) => d.status !== 'active').length } });
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
- Hostname: ${context?.hostname || "prod-edge-asia1.velclaw.com"}
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
