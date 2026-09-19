import { HostNode, MetricSnapshot, DnsRecord, SslInfo, SystemLog, SlowQuery, ApiKeyItem, AlertThresholds, SystemAlert } from './types';

export const INITIAL_NODES: HostNode[] = [
  {
    id: 'node-01',
    hostname: 'prod-edge-asia1.velclaw.net',
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
    hostname: 'prod-api-gw.velclaw.net',
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

export const INITIAL_SSL: SslInfo = {
  domain: 'velclaw.net',
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

export const INITIAL_DNS_RECORDS: DnsRecord[] = [
  {
    id: 'dns-1',
    type: 'A',
    name: '@',
    content: '104.21.78.142',
    ttl: 300,
    proxied: true,
    status: 'active',
  },
  {
    id: 'dns-2',
    type: 'AAAA',
    name: '@',
    content: '2606:4700:3037::ac43:8e12',
    ttl: 300,
    proxied: true,
    status: 'active',
  },
  {
    id: 'dns-3',
    type: 'CNAME',
    name: 'app',
    content: 'prod-edge-asia1.velclaw.net',
    ttl: 300,
    proxied: true,
    status: 'active',
  },
  {
    id: 'dns-4',
    type: 'CNAME',
    name: 'api',
    content: 'prod-api-gw.velclaw.net',
    ttl: 300,
    proxied: true,
    status: 'active',
  },
  {
    id: 'dns-5',
    type: 'TXT',
    name: '@',
    content: 'v=spf1 include:_spf.velclaw.net ~all',
    ttl: 3600,
    proxied: false,
    status: 'active',
  },
  {
    id: 'dns-6',
    type: 'CAA',
    name: '@',
    content: '0 issue "letsencrypt.org"',
    ttl: 3600,
    proxied: false,
    status: 'active',
  },
  {
    id: 'dns-7',
    type: 'NS',
    name: '@',
    content: 'ns1.velclaw-dns.com',
    ttl: 86400,
    proxied: false,
    status: 'active',
  },
  {
    id: 'dns-8',
    type: 'NS',
    name: '@',
    content: 'ns2.velclaw-dns.com',
    ttl: 86400,
    proxied: false,
    status: 'active',
  }
];

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
    message: 'Tải CPU của node prod-edge-asia1.velclaw.net đã vượt ngưỡng cảnh báo 75% trong 3 phút.',
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
