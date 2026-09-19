import React, { useState } from 'react';
import { 
  Webhook, 
  Key, 
  Copy, 
  Check, 
  Send, 
  Terminal, 
  Code2, 
  Plus, 
  Trash2, 
  ExternalLink,
  CheckCircle2,
  Play
} from 'lucide-react';
import { ApiKeyItem, MetricSnapshot } from '../types';

interface ApiIntegrationTabProps {
  apiKeys: ApiKeyItem[];
  currentMetric: MetricSnapshot;
  onAddApiKey: (name: string, permissions: ApiKeyItem['permissions']) => void;
  onRevokeApiKey: (id: string) => void;
}

export const ApiIntegrationTab: React.FC<ApiIntegrationTabProps> = ({
  apiKeys,
  currentMetric,
  onAddApiKey,
  onRevokeApiKey,
}) => {
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerm, setNewKeyPerm] = useState<ApiKeyItem['permissions']>('read-only');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  
  // Interactive API tester state
  const [selectedEndpoint, setSelectedEndpoint] = useState<'/api/v1/metrics' | '/api/v1/health' | '/api/v1/prometheus'>('/api/v1/metrics');
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<number | null>(null);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [isLoadingApi, setIsLoadingApi] = useState(false);

  const handleCopyKey = (key: ApiKeyItem) => {
    navigator.clipboard.writeText(key.fullKey);
    setCopiedKeyId(key.id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleCreateKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    onAddApiKey(newKeyName, newKeyPerm);
    setNewKeyName('');
    setIsCreatingKey(false);
  };

  const handleRunApiTest = () => {
    setIsLoadingApi(true);
    setApiResponse(null);

    setTimeout(() => {
      setIsLoadingApi(false);
      setApiStatus(200);
      setApiLatency(14);

      if (selectedEndpoint === '/api/v1/metrics') {
        setApiResponse(JSON.stringify({
          status: 'success',
          hostname: 'prod-edge-asia1.velclaw.net',
          timestamp: new Date().toISOString(),
          system: {
            cpu_usage_percent: currentMetric.cpuUsage,
            ram_usage_percent: currentMetric.ramUsagePercent,
            ram_used_gb: currentMetric.ramUsedGb,
            ram_total_gb: currentMetric.ramTotalGb,
            disk_usage_percent: currentMetric.diskUsagePercent,
            disk_iops: currentMetric.diskIops,
            network_in_mbps: currentMetric.networkInMbps,
            network_out_mbps: currentMetric.networkOutMbps,
            active_connections: currentMetric.activeConnections
          },
          dns_status: 'PROPAGATED_100',
          ssl_status: 'TLS_1_3_ACTIVE'
        }, null, 2));
      } else if (selectedEndpoint === '/api/v1/health') {
        setApiResponse(JSON.stringify({
          status: 'HEALTHY',
          uptime_seconds: 4192800,
          dns: 'OK',
          https: 'OK',
          http_redirect: 'OK',
          cluster_nodes: 3
        }, null, 2));
      } else {
        setApiResponse([
          '# HELP velclaw_cpu_usage_percent Current CPU utilization percentage',
          '# TYPE velclaw_cpu_usage_percent gauge',
          `velclaw_cpu_usage_percent{hostname="prod-edge-asia1.velclaw.net"} ${currentMetric.cpuUsage.toFixed(1)}`,
          '# HELP velclaw_ram_usage_percent Current RAM memory usage percentage',
          '# TYPE velclaw_ram_usage_percent gauge',
          `velclaw_ram_usage_percent{hostname="prod-edge-asia1.velclaw.net"} ${currentMetric.ramUsagePercent.toFixed(1)}`,
          '# HELP velclaw_network_in_bytes Total incoming network bandwidth in megabits',
          '# TYPE velclaw_network_in_bytes counter',
          `velclaw_network_in_bytes{hostname="prod-edge-asia1.velclaw.net"} ${currentMetric.networkInMbps.toFixed(0)}`,
          '# HELP velclaw_active_connections Current active TCP socket connections',
          '# TYPE velclaw_active_connections gauge',
          `velclaw_active_connections{hostname="prod-edge-asia1.velclaw.net"} ${currentMetric.activeConnections}`
        ].join('\n'));
      }
    }, 450);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Webhook className="w-4 h-4" />
            <span>Tích Hợp API Bên Thứ Ba &amp; Prometheus / Datadog</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">
            Kết Nối Hệ Thống Giám Sát &amp; Webhook Đa Kênh
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Cung cấp chuẩn REST API và Prometheus Exporter Scrape endpoint để kết nối máy chủ Velclaw với Datadog, Grafana, Zabbix, New Relic hoặc dịch vụ DevOps nội bộ.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingKey(!isCreatingKey)}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-2 transition-all shadow-md shadow-cyan-950/50"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Khóa API Key Mới</span>
        </button>
      </div>

      {/* Create Key Form */}
      {isCreatingKey && (
        <form onSubmit={handleCreateKeySubmit} className="p-4 rounded-2xl bg-slate-900 border border-slate-700 space-y-3 animate-fade-in">
          <div className="text-xs font-bold text-white uppercase tracking-wider">
            Tạo API Key Mới Cho Ứng Dụng Giám Sát
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Tên Ứng Dụng / Agent</label>
              <input
                type="text"
                placeholder="Ví dụ: Grafana Prometheus Scraper"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                required
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Quyền Hạn (Scopes)</label>
              <select
                value={newKeyPerm}
                onChange={(e) => setNewKeyPerm(e.target.value as ApiKeyItem['permissions'])}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
              >
                <option value="read-only">read-only (Chỉ đọc số liệu giám sát)</option>
                <option value="read-write">read-write (Đọc &amp; Cập nhật cảnh báo)</option>
                <option value="admin">admin (Toàn quyền quản trị máy chủ)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCreatingKey(false)}
              className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              Tạo &amp; Kích Hoạt Key
            </button>
          </div>
        </form>
      )}

      {/* API Keys Table */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" />
            <span>Danh Sách API Keys Đã Cấp Phát</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">Bearer Token Auth</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                <th className="py-2.5 px-3">Tên Ứng Dụng</th>
                <th className="py-2.5 px-3">Khóa Bí Mật</th>
                <th className="py-2.5 px-3">Quyền Hạn</th>
                <th className="py-2.5 px-3">Sử Dụng Gần Nhất</th>
                <th className="py-2.5 px-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {apiKeys.map((k) => (
                <tr key={k.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-semibold text-white font-sans">
                    {k.name}
                  </td>
                  <td className="py-3 px-3 text-slate-300">
                    <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[11px]">
                      {k.keyMasked}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      {k.permissions}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-400 text-[11px]">
                    {k.lastUsed}
                  </td>
                  <td className="py-3 px-3 text-right space-x-2">
                    <button
                      onClick={() => handleCopyKey(k)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition-colors"
                      title="Sao chép toàn bộ mã Key"
                    >
                      {copiedKeyId === k.id ? 'Đã sao chép!' : 'Copy Key'}
                    </button>
                    <button
                      onClick={() => onRevokeApiKey(k.id)}
                      className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] transition-colors"
                    >
                      Thu hồi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive API Tester & Playground */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Trình Thử Nghiệm API Trực Tiếp (Interactive API Playground)</span>
            </h3>
            <p className="text-xs text-slate-400">Kiểm tra kết quả phản hồi của các đầu mút API theo thời gian thực</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedEndpoint}
              onChange={(e) => setSelectedEndpoint(e.target.value as any)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-300"
            >
              <option value="/api/v1/metrics">GET /api/v1/metrics (JSON Host Metrics)</option>
              <option value="/api/v1/health">GET /api/v1/health (Healthcheck)</option>
              <option value="/api/v1/prometheus">GET /api/v1/prometheus (Prometheus Exporter)</option>
            </select>

            <button
              onClick={handleRunApiTest}
              disabled={isLoadingApi}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isLoadingApi ? 'Đang gọi...' : 'Thử Nghiệm API'}</span>
            </button>
          </div>
        </div>

        {/* Response Box */}
        <div className="space-y-2">
          {apiStatus && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                HTTP {apiStatus} OK
              </span>
              <span className="text-slate-400">Thời gian phản hồi: <strong className="text-white">{apiLatency}ms</strong></span>
              <span className="text-slate-400">Content-Type: <strong className="text-slate-300">{selectedEndpoint === '/api/v1/prometheus' ? 'text/plain; version=0.0.4' : 'application/json'}</strong></span>
            </div>
          )}

          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-72">
            {apiResponse || '// Bấm nút "Thử Nghiệm API" ở trên để gửi request và nhận kết quả phản hồi...'}
          </pre>
        </div>

        {/* Prometheus snippet */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1.5">
          <div className="text-slate-400 font-semibold flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <span>Mẫu cấu hình Prometheus scrape (prometheus.yml):</span>
          </div>
          <pre className="text-[11px] font-mono text-slate-300 p-2.5 rounded bg-slate-900 border border-slate-800 overflow-x-auto">
{`scrape_configs:
  - job_name: 'velclaw_production_node'
    metrics_path: '/api/v1/prometheus'
    scheme: 'https'
    bearer_token: '${apiKeys[0]?.keyMasked || 'YOUR_API_KEY'}'
    static_configs:
      - targets: ['prod-edge-asia1.velclaw.net:443']`}
          </pre>
        </div>
      </div>
    </div>
  );
};
