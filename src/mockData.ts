import { HostNode, MetricSnapshot, DnsRecord, SslInfo, SystemLog, SlowQuery, ApiKeyItem, AlertThresholds, SystemAlert, VelclawDomainConfig, CustomDomain, ChartTimeframe } from './types';

export const INITIAL_NODES: HostNode[] = [
  {
    id: 'node-01',
    hostname: 'prod-edge-asia1.velclaw.cfd',
    ipV4: '104.21.78.142',
    ipV6: '2606:4700:3037::ac43:8e12',
    os: 'Debian GNU/Linux 12 (Bookworm x86_64)',
    kernel: 'Linux 6.1.0-21-amd64 SMP PREEMPT_DYNAMIC',
    region: 'Asia-East 1 (Tokyo, JP)',
    datacenter: 'Equinix TY2 Tier IV Datacenter',
    status: 'online',
    uptimeSeconds: 4192800, // ~48.5 days
  },
  {
    id: 'node-02',
    hostname: 'prod-api-gw.velclaw.io',
    ipV4: '172.67.190.84',
    ipV6: '2606:4700:3037::ac43:8e13',
    os: 'Ubuntu 24.04 LTS (Noble Numbat)',
    kernel: 'Linux 6.8.0-31-generic',
    region: 'Asia-Southeast 1 (Singapore)',
    datacenter: 'Singtel Global DC-1',
    status: 'online',
    uptimeSeconds: 1987200, // ~23 days
  },
  {
    id: 'node-03',
    hostname: 'prod-db-primary.velclaw.internal',
    ipV4: '10.140.0.15',
    ipV6: 'fd00:velclaw:db::1',
    os: 'Alpine Linux v3.20 (Hardened Kernel)',
    kernel: 'Linux 6.6.32-0-virt',
    region: 'Asia-East 1 (Tokyo, JP)',
    datacenter: 'Equinix TY2 Tier IV Datacenter',
    status: 'online',
    uptimeSeconds: 7824000, // ~90.5 days
  }
];

export const VELCLAW_DOMAINS: VelclawDomainConfig[] = [
  {
    tld: 'cfd',
    domain: 'velclaw.cfd',
    role: 'Canonical & Production Ingress',
    description: 'Tên miền chính thức của nền tảng Velclaw, phục vụ cổng thông tin khách hàng và production routing.',
    badge: 'CURRENT CANONICAL',
    color: 'emerald',
    defaultHost: 'prod-edge-asia1.velclaw.cfd',
    wildcardSupported: true,
    sslStatus: 'active',
    tlsVersion: 'TLSv1.3 (RFC 8446)',
    dnsRecords: [
      { id: 'com-1', type: 'A', name: '@', content: '104.21.78.142', ttl: 300, proxied: true, status: 'active' },
      { id: 'com-2', type: 'AAAA', name: '@', content: '2606:4700:3037::ac43:8e12', ttl: 300, proxied: true, status: 'active' },
      { id: 'com-3', type: 'CNAME', name: 'www', content: 'velclaw.com', ttl: 300, proxied: true, status: 'active' },
      { id: 'com-4', type: 'CNAME', name: '*', content: 'prod-edge-asia1.velclaw.cfd', ttl: 300, proxied: true, status: 'active' },
      { id: 'com-5', type: 'TXT', name: '@', content: 'v=spf1 include:_spf.velclaw.com ~all', ttl: 3600, proxied: false, status: 'active' },
      { id: 'com-6', type: 'CAA', name: '@', content: '0 issue "letsencrypt.org"', ttl: 3600, proxied: false, status: 'active' },
      { id: 'com-7', type: 'NS', name: '@', content: 'ns1.velclaw.com', ttl: 86400, proxied: false, status: 'active' },
      { id: 'com-8', type: 'NS', name: '@', content: 'ns2.velclaw.com', ttl: 86400, proxied: false, status: 'active' },
    ]
  },
  {
    tld: 'dev',
    domain: 'velclaw.dev',
    role: 'Developer & Preview Deployments',
    description: 'Môi trường sandbox cho lập trình viên, branch preview deployments, CI/CD ephemeral environments.',
    badge: 'DEV PREVIEW',
    color: 'indigo',
    defaultHost: 'preview-router.velclaw.dev',
    wildcardSupported: true,
    sslStatus: 'active',
    tlsVersion: 'TLSv1.3 (HSTS Strict)',
    dnsRecords: [
      { id: 'dev-1', type: 'A', name: '@', content: '104.21.78.143', ttl: 300, proxied: true, status: 'active' },
      { id: 'dev-2', type: 'CNAME', name: '*', content: 'preview-router.velclaw.dev', ttl: 300, proxied: true, status: 'active' },
      { id: 'dev-3', type: 'CNAME', name: 'preview', content: 'edge-tokyo.velclaw.dev', ttl: 300, proxied: true, status: 'active' },
      { id: 'dev-4', type: 'TXT', name: '_velclaw-verify', content: 'velclaw-dev-verification-token=9d4a2f8', ttl: 3600, proxied: false, status: 'active' },
      { id: 'dev-5', type: 'CAA', name: '@', content: '0 issue "letsencrypt.org"', ttl: 3600, proxied: false, status: 'active' },
    ]
  },
  {
    tld: 'ai',
    domain: 'velclaw.ai',
    role: 'AI Agents & Model Workloads',
    description: 'Endpoint phân phối tác vụ AI, Antigravity Agent, Gemini LLM router, Real-time voice và Vector clusters.',
    badge: 'AI ENGINE',
    color: 'purple',
    defaultHost: 'agent-cluster.velclaw.ai',
    wildcardSupported: true,
    sslStatus: 'active',
    tlsVersion: 'TLSv1.3 (Zero-RTT)',
    dnsRecords: [
      { id: 'ai-1', type: 'A', name: '@', content: '104.21.78.144', ttl: 300, proxied: true, status: 'active' },
      { id: 'ai-2', type: 'CNAME', name: 'api', content: 'inference-gw.velclaw.ai', ttl: 300, proxied: true, status: 'active' },
      { id: 'ai-3', type: 'CNAME', name: 'agents', content: 'agent-cluster.velclaw.ai', ttl: 300, proxied: true, status: 'active' },
      { id: 'ai-4', type: 'CNAME', name: 'stream', content: 'live-websocket.velclaw.ai', ttl: 300, proxied: true, status: 'active' },
      { id: 'ai-5', type: 'TXT', name: '@', content: 'velclaw-ai-model-endpoint-v2', ttl: 3600, proxied: false, status: 'active' },
    ]
  },
  {
    tld: 'io',
    domain: 'velclaw.io',
    role: 'Edge Gateway & High-IOPS Ingress',
    description: 'Cụm Ingress Control Plane, API Gateway, WebSocket connections, gRPC streaming và metrics ingest.',
    badge: 'INGRESS IO',
    color: 'cyan',
    defaultHost: 'prod-api-gw.velclaw.io',
    wildcardSupported: true,
    sslStatus: 'active',
    tlsVersion: 'TLSv1.3 (HTTP/3 QUIC)',
    dnsRecords: [
      { id: 'io-1', type: 'A', name: '@', content: '172.67.190.84', ttl: 300, proxied: true, status: 'active' },
      { id: 'io-2', type: 'AAAA', name: '@', content: '2606:4700:3037::ac43:8e13', ttl: 300, proxied: true, status: 'active' },
      { id: 'io-3', type: 'CNAME', name: 'api', content: 'prod-api-gw.velclaw.io', ttl: 300, proxied: true, status: 'active' },
      { id: 'io-4', type: 'CNAME', name: 'ws', content: 'realtime-mesh.velclaw.io', ttl: 300, proxied: true, status: 'active' },
      { id: 'io-5', type: 'CNAME', name: 'metrics', content: 'prometheus-exporter.velclaw.io', ttl: 300, proxied: true, status: 'active' },
    ]
  },
  {
    tld: 'app',
    domain: 'velclaw.app',
    role: 'Client Console & Web Dashboard',
    description: 'Giao diện web người dùng cuối quản lý dịch vụ hosting, SSL, firewall và cấu hình container.',
    badge: 'SAAS PORTAL',
    color: 'rose',
    defaultHost: 'console.velclaw.app',
    wildcardSupported: true,
    sslStatus: 'active',
    tlsVersion: 'TLSv1.3 (Strict HSTS Preloaded)',
    dnsRecords: [
      { id: 'app-1', type: 'A', name: '@', content: '104.21.78.145', ttl: 300, proxied: true, status: 'active' },
      { id: 'app-2', type: 'CNAME', name: 'console', content: 'velclaw.app', ttl: 300, proxied: true, status: 'active' },
      { id: 'app-3', type: 'CNAME', name: 'auth', content: 'sso.velclaw.app', ttl: 300, proxied: true, status: 'active' },
      { id: 'app-4', type: 'CNAME', name: 'billing', content: 'portal.velclaw.app', ttl: 300, proxied: true, status: 'active' },
      { id: 'app-5', type: 'CAA', name: '@', content: '0 issue "letsencrypt.org"', ttl: 3600, proxied: false, status: 'active' },
    ]
  }
];

export const INITIAL_SSL: SslInfo = {
  domain: 'velclaw.com',
  issuer: "Let's Encrypt Authority E6 (ISRG Root X1)",
  type: 'ECDSA 384 bits (High Security)',
  validFrom: '2026-08-15',
  validTo: '2026-11-13',
  daysRemaining: 55,
  tlsVersion: 'TLSv1.3 (RFC 8446)',
  cipherSuite: 'TLS_AES_256_GCM_SHA384',
  hstsEnabled: true,
  httpRedirectEnabled: true,
  autoRenew: true,
  fingerprint: '3B:4E:91:72:AA:F4:1C:89:90:DF:11:5A:22:98:C3:7E:8A:4F:91:D2',
  status: 'secure',
};

export const INITIAL_DNS_RECORDS: DnsRecord[] = VELCLAW_DOMAINS[0].dnsRecords;

export const INITIAL_THRESHOLDS: AlertThresholds = {
  cpuWarning: 75,
  cpuCritical: 85,
  ramWarning: 80,
  ramCritical: 90,
  diskCritical: 88,
  autoAlertEnabled: true,
  notifyFCM: true,
  notifyEmail: true,
  notifyWebhook: true,
  soundAlert: false,
};

export const INITIAL_ALERTS: SystemAlert[] = [
  {
    id: 'alt-101',
    type: 'CPU_HIGH',
    severity: 'warning',
    title: 'Cảnh báo phụ tải CPU chạm 78.4%',
    message: 'Tải CPU của node prod-edge-asia1.velclaw.cfd đã vượt ngưỡng cảnh báo 75% trong 3 phút.',
    timestamp: 'Hôm nay, 14:15:20',
    value: 78.4,
    threshold: 75,
    resolved: true,
    resolvedAt: '14:22:10',
  },
  {
    id: 'alt-102',
    type: 'SSL_EXPIRING',
    severity: 'info',
    title: 'Kiểm tra gia hạn tự động SSL Certificate',
    message: 'Chứng chỉ SSL Let\'s Encrypt đã được lập lịch gia hạn tự động qua ACME Protocol vào ngày 20/10/2026.',
    timestamp: 'Hôm qua, 09:00:00',
    value: 55,
    threshold: 30,
    resolved: true,
  }
];

export const INITIAL_SLOW_QUERIES: SlowQuery[] = [
  {
    id: 'q-1',
    query: 'SELECT * FROM host_traffic_logs WHERE hostname = $1 AND timestamp >= NOW() - INTERVAL \'24 hours\' ORDER BY timestamp DESC;',
    table: 'host_traffic_logs',
    avgTimeMs: 412.5,
    callsPerMinute: 1420,
    impact: 'high',
    missingIndex: 'CREATE INDEX CONCURRENTLY idx_traffic_host_ts ON host_traffic_logs (hostname, timestamp DESC);',
    optimized: false,
    optimizedTimeMs: 9.4,
  },
  {
    id: 'q-2',
    query: 'SELECT u.id, u.email, s.session_token, s.mfa_status FROM system_admins u JOIN admin_sessions s ON u.id = s.admin_id WHERE s.expires_at > NOW();',
    table: 'admin_sessions',
    avgTimeMs: 185.0,
    callsPerMinute: 850,
    impact: 'medium',
    missingIndex: 'CREATE INDEX idx_sessions_expires_admin ON admin_sessions (expires_at, admin_id);',
    optimized: false,
    optimizedTimeMs: 4.8,
  },
  {
    id: 'q-3',
    query: 'SELECT node_id, AVG(cpu_usage), MAX(ram_usage) FROM cluster_metric_snapshots GROUP BY node_id, date_trunc(\'hour\', created_at);',
    table: 'cluster_metric_snapshots',
    avgTimeMs: 320.2,
    callsPerMinute: 310,
    impact: 'high',
    missingIndex: 'CREATE INDEX idx_snapshots_composite ON cluster_metric_snapshots (node_id, created_at);',
    optimized: false,
    optimizedTimeMs: 14.1,
  },
  {
    id: 'q-4',
    query: 'SELECT alert_id, severity, resolved FROM system_audit_alerts WHERE resolved = false ORDER BY created_at DESC LIMIT 50;',
    table: 'system_audit_alerts',
    avgTimeMs: 98.4,
    callsPerMinute: 620,
    impact: 'low',
    missingIndex: 'CREATE INDEX idx_alerts_unresolved ON system_audit_alerts (resolved, created_at DESC) WHERE resolved = false;',
    optimized: true,
    optimizedTimeMs: 2.1,
  }
];

export const INITIAL_API_KEYS: ApiKeyItem[] = [
  {
    id: 'key-1',
    name: 'Datadog Agent Scraper',
    keyMasked: 'velclaw_live_dd_9a87••••••••••••••••3f21',
    fullKey: 'velclaw_live_dd_9a87f61c28e93012bb81c9443f21',
    createdDate: '2026-08-01',
    lastUsed: '1 phút trước',
    permissions: 'read-only',
    status: 'active',
  },
  {
    id: 'key-2',
    name: 'Prometheus Node Exporter Hub',
    keyMasked: 'velclaw_prom_exporter_41d0••••••••••••••••77a9',
    fullKey: 'velclaw_prom_exporter_41d08e5539c8147d1b22e15577a9',
    createdDate: '2026-08-10',
    lastUsed: '15 giây trước',
    permissions: 'read-only',
    status: 'active',
  },
  {
    id: 'key-3',
    name: 'CI/CD Auto Deploy Hook',
    keyMasked: 'velclaw_deploy_sec_77c2••••••••••••••••99e1',
    fullKey: 'velclaw_deploy_sec_77c244aa9910f443818e312499e1',
    createdDate: '2026-09-02',
    lastUsed: '6 giờ trước',
    permissions: 'read-write',
    status: 'active',
  }
];

export const INITIAL_LOGS: SystemLog[] = [
  {
    id: 'log-101',
    timestamp: '2026-09-19 14:50:12',
    level: 'INFO',
    category: 'NGINX',
    message: 'HTTP/3 ALPN negotiation successful for 142 clients. HTTP->HTTPS redirect 301 cache hit ratio 99.8%.',
    source: 'nginx-ingress-core',
    ip: '104.21.78.142',
  },
  {
    id: 'log-102',
    timestamp: '2026-09-19 14:48:05',
    level: 'INFO',
    category: 'SSL',
    message: 'TLS 1.3 handshake verified. OCSP stapling response refreshed from ocsp.int-x3.letsencrypt.org.',
    source: 'certbot-daemon',
    ip: '127.0.0.1',
  },
  {
    id: 'log-103',
    timestamp: '2026-09-19 14:45:22',
    level: 'INFO',
    category: 'DNS',
    message: 'DNS over HTTPS (DoH) resolver sync: 8 authoritative edge nodes validated DNSSEC signature RRSIG.',
    source: 'bind9-edge-resolver',
    ip: '1.1.1.1',
  },
  {
    id: 'log-104',
    timestamp: '2026-09-19 14:39:51',
    level: 'INFO',
    category: '2FA',
    message: 'Quản trị viên huynhthuong.xyz@gmail.com hoàn tất xác thực 2FA TOTP (6-digit token) thành công.',
    source: 'auth-guardian-mfa',
    ip: '113.185.42.19',
  },
  {
    id: 'log-105',
    timestamp: '2026-09-19 14:30:10',
    level: 'WARN',
    category: 'SYSTEM',
    message: 'Tài nguyên RAM vượt ngưỡng 78.5% (12.56GB / 16.0GB) do buffer cache worker threads xử lý batch metrics.',
    source: 'kernel-oom-watchdog',
    ip: '10.140.0.15',
  },
  {
    id: 'log-106',
    timestamp: '2026-09-19 14:20:00',
    level: 'INFO',
    category: 'MAINTENANCE',
    message: 'Tiến trình sao lưu định kỳ Snapshot database cluster hoàn thành: 4.8GB nén zstd, hash checksum sha256 OK.',
    source: 'backup-cron-job',
    ip: '127.0.0.1',
  },
  {
    id: 'log-107',
    timestamp: '2026-09-19 14:10:44',
    level: 'WARN',
    category: 'SECURITY',
    message: 'WAF chặn 38 lượt quét cổng bất thường qua Port 22 SSH từ IP 194.26.29.11 (Fail2ban đã ban 24h).',
    source: 'velclaw-waf-shield',
    ip: '194.26.29.11',
  }
];

export function generateHistoricalMetrics(count: number = 25): MetricSnapshot[] {
  const result: MetricSnapshot[] = [];
  const now = Date.now();
  
  for (let i = count - 1; i >= 0; i--) {
    const time = new Date(now - i * 15000); // every 15s
    const hours = time.getHours().toString().padStart(2, '0');
    const minutes = time.getMinutes().toString().padStart(2, '0');
    const seconds = time.getSeconds().toString().padStart(2, '0');
    const timeLabel = `${hours}:${minutes}:${seconds}`;

    // realistic variance
    const baseCpu = 35 + Math.sin(i * 0.4) * 12 + (Math.random() * 8);
    const cpuUsage = Math.min(99, Math.max(15, parseFloat(baseCpu.toFixed(1))));

    const ramUsedGb = parseFloat((9.8 + Math.cos(i * 0.3) * 1.5 + Math.random() * 0.8).toFixed(2));
    const ramTotalGb = 16.0;
    const ramUsagePercent = parseFloat(((ramUsedGb / ramTotalGb) * 100).toFixed(1));

    const diskUsedGb = 78.4;
    const diskTotalGb = 256.0;
    const diskUsagePercent = parseFloat(((diskUsedGb / diskTotalGb) * 100).toFixed(1));

    result.push({
      timestamp: time.toISOString(),
      timeLabel,
      cpuUsage,
      cpuCores: [
        parseFloat((cpuUsage + (Math.random() * 6 - 3)).toFixed(1)),
        parseFloat((cpuUsage + (Math.random() * 8 - 4)).toFixed(1)),
        parseFloat((cpuUsage + (Math.random() * 5 - 2)).toFixed(1)),
        parseFloat((cpuUsage + (Math.random() * 7 - 3)).toFixed(1)),
      ],
      ramUsagePercent,
      ramUsedGb,
      ramTotalGb,
      swapUsedGb: 0.45,
      swapTotalGb: 8.0,
      diskUsagePercent,
      diskUsedGb,
      diskTotalGb,
      diskIops: Math.floor(850 + Math.random() * 400),
      networkInMbps: parseFloat((140 + Math.random() * 65).toFixed(1)),
      networkOutMbps: parseFloat((210 + Math.random() * 85).toFixed(1)),
      load1m: parseFloat((1.24 + Math.random() * 0.3).toFixed(2)),
      load5m: parseFloat((1.18 + Math.random() * 0.15).toFixed(2)),
      load15m: 1.05,
      activeConnections: Math.floor(1840 + Math.random() * 250),
      latencyMs: parseFloat((12.4 + Math.random() * 4.2).toFixed(1)),
    });
  }

  return result;
}

export function generateTimeframeMetrics(timeframe: ChartTimeframe, liveMetrics?: MetricSnapshot[]): MetricSnapshot[] {
  if (timeframe === 'live') {
    return liveMetrics && liveMetrics.length > 0 ? liveMetrics : generateHistoricalMetrics(25);
  }

  const now = Date.now();
  let count = 30;
  let intervalMs = 2 * 60 * 1000; // default 2 minutes for 1h

  switch (timeframe) {
    case '1h':
      count = 30; // 30 points * 2 min = 60 min
      intervalMs = 2 * 60 * 1000;
      break;
    case '6h':
      count = 36; // 36 points * 10 min = 360 min (6 hours)
      intervalMs = 10 * 60 * 1000;
      break;
    case '12h':
      count = 36; // 36 points * 20 min = 720 min (12 hours)
      intervalMs = 20 * 60 * 1000;
      break;
    case '24h':
      count = 48; // 48 points * 30 min = 1440 min (24 hours)
      intervalMs = 30 * 60 * 1000;
      break;
  }

  const result: MetricSnapshot[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const time = new Date(now - i * intervalMs);
    const hours = time.getHours().toString().padStart(2, '0');
    const minutes = time.getMinutes().toString().padStart(2, '0');
    const timeLabel = `${hours}:${minutes}`;

    // Wave pattern for organic daily workload fluctuations
    const wave = Math.sin((i / count) * Math.PI * 2) * 16;
    const microJitter = (Math.random() - 0.5) * 8;
    const baseCpu = 42 + wave + microJitter;
    const cpuUsage = Math.min(96, Math.max(16, parseFloat(baseCpu.toFixed(1))));

    const ramBase = 10.2 + Math.cos((i / count) * Math.PI * 2) * 1.8 + (Math.random() - 0.5) * 0.6;
    const ramUsedGb = parseFloat(Math.min(15.4, Math.max(7.2, ramBase)).toFixed(2));
    const ramTotalGb = 16.0;
    const ramUsagePercent = parseFloat(((ramUsedGb / ramTotalGb) * 100).toFixed(1));

    const diskUsedGb = 78.4 + parseFloat(((i / count) * 1.8).toFixed(2));
    const diskTotalGb = 256.0;
    const diskUsagePercent = parseFloat(((diskUsedGb / diskTotalGb) * 100).toFixed(1));

    result.push({
      timestamp: time.toISOString(),
      timeLabel,
      cpuUsage,
      cpuCores: [
        parseFloat((cpuUsage + (Math.random() * 6 - 3)).toFixed(1)),
        parseFloat((cpuUsage + (Math.random() * 8 - 4)).toFixed(1)),
        parseFloat((cpuUsage + (Math.random() * 5 - 2)).toFixed(1)),
        parseFloat((cpuUsage + (Math.random() * 7 - 3)).toFixed(1)),
      ],
      ramUsagePercent,
      ramUsedGb,
      ramTotalGb,
      swapUsedGb: 0.45,
      swapTotalGb: 8.0,
      diskUsagePercent,
      diskUsedGb,
      diskTotalGb,
      diskIops: Math.floor(750 + Math.abs(wave) * 25 + Math.random() * 300),
      networkInMbps: parseFloat((120 + Math.abs(wave) * 6 + Math.random() * 50).toFixed(1)),
      networkOutMbps: parseFloat((180 + Math.abs(wave) * 9 + Math.random() * 70).toFixed(1)),
      load1m: parseFloat((1.15 + (cpuUsage / 100) * 0.9).toFixed(2)),
      load5m: parseFloat((1.10 + (cpuUsage / 100) * 0.7).toFixed(2)),
      load15m: 1.05,
      activeConnections: Math.floor(1600 + Math.abs(wave) * 45 + Math.random() * 200),
      latencyMs: parseFloat((11.2 + (cpuUsage > 70 ? 6 : 0) + Math.random() * 3.5).toFixed(1)),
    });
  }

  return result;
}

export const INITIAL_CUSTOM_DOMAINS: CustomDomain[] = [
  {
    id: 'cd-1',
    domain: 'portal.enterprise-saas.com',
    tld: 'com',
    recordType: 'A',
    targetValue: '104.21.78.142',
    status: 'active',
    sslStatus: 'active',
    createdAt: '2026-09-15 08:30:00',
    lastCheckedAt: '2026-09-19 15:10:00',
    notes: 'Cổng thông tin khách hàng doanh nghiệp sản xuất'
  },
  {
    id: 'cd-2',
    domain: 'branch-preview.my-devteam.dev',
    tld: 'dev',
    recordType: 'CNAME',
    targetValue: 'preview.velclaw.dev',
    status: 'active',
    sslStatus: 'active',
    createdAt: '2026-09-17 14:20:00',
    lastCheckedAt: '2026-09-19 14:45:00',
    notes: 'Môi trường preview tự động cho PRs'
  },
  {
    id: 'cd-3',
    domain: 'inference.omni-agent.ai',
    tld: 'ai',
    recordType: 'CNAME',
    targetValue: 'agents.velclaw.ai',
    status: 'active',
    sslStatus: 'active',
    createdAt: '2026-09-18 09:15:00',
    lastCheckedAt: '2026-09-19 15:25:00',
    notes: 'Endpoint điều phối LLM & Vector Retrieval'
  },
  {
    id: 'cd-4',
    domain: 'stream-hub.iot-edge.io',
    tld: 'io',
    recordType: 'A',
    targetValue: '172.67.190.84',
    status: 'pending',
    sslStatus: 'issuing',
    createdAt: '2026-09-19 11:00:00',
    lastCheckedAt: '2026-09-19 15:30:00',
    notes: 'Gateway truyền dữ liệu telemetry cảm biến'
  },
  {
    id: 'cd-5',
    domain: 'mobile-web.fintech-wallet.app',
    tld: 'app',
    recordType: 'CNAME',
    targetValue: 'console.velclaw.app',
    status: 'pending',
    sslStatus: 'pending',
    createdAt: '2026-09-19 13:40:00',
    lastCheckedAt: '2026-09-19 15:35:00',
    notes: 'PWA Web application cho người dùng cuối'
  }
];
