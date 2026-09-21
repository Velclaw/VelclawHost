export type TabType = 
  | 'overview'
  | 'domains'
  | 'dns-ssl'
  | 'metrics-charts'
  | 'alerts'
  | 'logs'
  | 'db-optimizer'
  | 'security-2fa'
  | 'api-integration'
  | 'reports';

export interface HostNode {
  id: string;
  hostname: string;
  ipV4: string;
  ipV6: string;
  os: string;
  kernel: string;
  region: string;
  datacenter: string;
  status: 'online' | 'degraded' | 'maintenance';
  uptimeSeconds: number;
}

export interface MetricSnapshot {
  timestamp: string;
  timeLabel: string;
  cpuUsage: number; // %
  cpuCores: number[];
  ramUsagePercent: number; // %
  ramUsedGb: number;
  ramTotalGb: number;
  swapUsedGb: number;
  swapTotalGb: number;
  diskUsagePercent: number; // %
  diskUsedGb: number;
  diskTotalGb: number;
  diskIops: number;
  networkInMbps: number;
  networkOutMbps: number;
  load1m: number;
  load5m: number;
  load15m: number;
  activeConnections: number;
  latencyMs: number;
}

export type ChartTimeframe = 'live' | '1h' | '6h' | '12h' | '24h';

export interface AlertThresholds {
  cpuWarning: number;
  cpuCritical: number;
  ramWarning: number;
  ramCritical: number;
  diskCritical: number;
  autoAlertEnabled: boolean;
  notifyFCM: boolean;
  notifyEmail: boolean;
  notifyWebhook: boolean;
  soundAlert: boolean;
}

export interface SystemAlert {
  id: string;
  type: 'CPU_HIGH' | 'RAM_HIGH' | 'DISK_HIGH' | 'SSL_EXPIRING' | 'DNS_FAIL' | 'UNAUTHORIZED_ACCESS';
  severity: 'warning' | 'critical' | 'info';
  title: string;
  message: string;
  timestamp: string;
  value: number;
  threshold: number;
  resolved: boolean;
  resolvedAt?: string;
}

export type VelclawTld = 'cfd' | 'com' | 'dev' | 'ai' | 'io' | 'app';

export interface CustomDomain {
  id: string;
  domain: string;
  tld: VelclawTld;
  recordType: 'A' | 'CNAME';
  targetValue: string;
  status: 'pending' | 'active' | 'verifying' | 'failed';
  sslStatus: 'active' | 'issuing' | 'pending';
  createdAt: string;
  lastCheckedAt?: string;
  notes?: string;
}

export interface VelclawDomainConfig {
  tld: VelclawTld;
  domain: string;
  role: string;
  description: string;
  badge: string;
  color: 'emerald' | 'indigo' | 'purple' | 'cyan' | 'rose';
  defaultHost: string;
  wildcardSupported: boolean;
  sslStatus: 'active' | 'generating' | 'expired';
  tlsVersion: string;
  dnsRecords: DnsRecord[];
}

export interface DnsRecord {
  id: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'CAA' | 'NS' | 'MX';
  name: string;
  content: string;
  ttl: number; // seconds
  proxied: boolean;
  status: 'active' | 'propagating';
}

export interface SslInfo {
  domain: string;
  issuer: string;
  type: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  tlsVersion: string;
  cipherSuite: string;
  hstsEnabled: boolean;
  httpRedirectEnabled: boolean;
  autoRenew: boolean;
  fingerprint: string;
  status: 'secure' | 'warning' | 'expired';
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'CRITICAL' | 'ERROR';
  category: 'SYSTEM' | 'SECURITY' | 'NGINX' | 'DATABASE' | '2FA' | 'DNS' | 'SSL' | 'MAINTENANCE';
  message: string;
  source: string;
  ip?: string;
}

export interface SlowQuery {
  id: string;
  query: string;
  table: string;
  avgTimeMs: number;
  callsPerMinute: number;
  impact: 'high' | 'medium' | 'low';
  missingIndex?: string;
  optimized: boolean;
  optimizedTimeMs?: number;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  keyMasked: string;
  fullKey: string;
  createdDate: string;
  lastUsed: string;
  permissions: 'read-only' | 'read-write' | 'admin';
  status: 'active' | 'revoked';
}

export interface FcmConfig {
  enabled: boolean;
  vapidKey: string;
  clientToken: string;
  registeredAt: string;
  notificationsReceived: number;
  permissionStatus: NotificationPermission | 'default';
}

export interface TwoFactorState {
  enabled: boolean;
  verified: boolean;
  secret: string;
  qrCodeText: string;
  backupCodes: string[];
  adminEmail: string;
  lastVerifiedAt?: string;
}
