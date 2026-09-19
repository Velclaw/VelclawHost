import React, { useState } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  Legend
} from 'recharts';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Activity, 
  Wifi, 
  ShieldCheck, 
  Lock, 
  Globe, 
  AlertTriangle, 
  RefreshCw, 
  ExternalLink,
  Copy,
  Check,
  Zap,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Flame,
  LineChart as LineChartIcon
} from 'lucide-react';
import { HostNode, MetricSnapshot, SslInfo, AlertThresholds, SystemAlert } from '../types';

interface OverviewTabProps {
  node: HostNode;
  metric: MetricSnapshot;
  metrics?: MetricSnapshot[];
  ssl: SslInfo;
  thresholds: AlertThresholds;
  alerts: SystemAlert[];
  onSimulateSpike: () => void;
  onOpenReports: () => void;
  onOpenSecurity: () => void;
  onNavigateToCharts?: () => void;
  isTwoFactorActive: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  node,
  metric,
  metrics = [],
  ssl,
  thresholds,
  alerts,
  onSimulateSpike,
  onOpenReports,
  onOpenSecurity,
  onNavigateToCharts,
  isTwoFactorActive,
}) => {
  const [copiedIp, setCopiedIp] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleCopyIp = () => {
    navigator.clipboard.writeText(node.ipV4);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const handleQuickAction = (name: string) => {
    setActionSuccess(`${name} thành công!`);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const isCpuExceeded = metric.cpuUsage >= thresholds.cpuWarning;
  const isRamExceeded = metric.ramUsagePercent >= thresholds.ramWarning;

  const days = Math.floor(node.uptimeSeconds / 86400);
  const hours = Math.floor((node.uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((node.uptimeSeconds % 3600) / 60);

  return (
    <div className="space-y-6">
      {/* Action toast feedback */}
      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 shadow-lg animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Threshold Warning Banner (Auto Alert) */}
      {(isCpuExceeded || isRamExceeded) && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-rose-950/40 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-rose-100">
                Cảnh báo tự động: Tài nguyên hệ thống vượt ngưỡng cho phép!
              </div>
              <div className="text-xs text-rose-300/90 mt-0.5">
                {isCpuExceeded && `CPU hiện tại: ${metric.cpuUsage}% (Ngưỡng cảnh báo: ${thresholds.cpuWarning}%) `}
                {isRamExceeded && `| RAM hiện tại: ${metric.ramUsagePercent}% (Ngưỡng: ${thresholds.ramWarning}%)`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2.5 py-1 rounded bg-rose-900/60 border border-rose-500/40 text-rose-200 font-mono">
              FCM Push Đã Gửi
            </span>
          </div>
        </div>
      )}

      {/* Hostname Hero Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                PRODUCTION ACTIVE
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {node.region}
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                {node.datacenter}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white font-mono">
                {node.hostname}
              </h1>
              <a 
                href={`https://${node.hostname}`} 
                target="_blank" 
                rel="noreferrer" 
                className="text-slate-400 hover:text-cyan-400 transition-colors p-1"
                title="Mở hostname trên tab mới"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
              <div className="flex items-center gap-1.5 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
                <span className="text-slate-500">IPv4:</span>
                <span className="text-cyan-300 font-semibold">{node.ipV4}</span>
                <button 
                  id="copy-ipv4-btn"
                  onClick={handleCopyIp} 
                  className="hover:text-white ml-1"
                  title="Sao chép IP"
                >
                  {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
                <span className="text-slate-500">OS:</span>
                <span className="text-slate-300">{node.os}</span>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
                <span className="text-slate-500">Uptime:</span>
                <span className="text-emerald-400 font-semibold">{days}d {hours}h {minutes}m</span>
              </div>
            </div>
          </div>

          {/* Quick interactive action buttons */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            <button
              id="simulate-spike-btn"
              onClick={onSimulateSpike}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-all flex items-center gap-1.5 shadow-sm"
              title="Kích hoạt đột biến tải CPU & RAM để kiểm tra hệ thống cảnh báo tự động"
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Thử Đột Biến CPU/RAM</span>
            </button>

            <button
              id="quick-flush-dns-btn"
              onClick={() => handleQuickAction('Xả bộ đệm DNS')}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 hover:bg-slate-700/60 transition-all flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Xả DNS</span>
            </button>

            <button
              id="quick-export-reports-btn"
              onClick={onOpenReports}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center gap-1.5 shadow-md shadow-cyan-900/30"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Xuất Báo Cáo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pre-configured Protocols Grid: DNS + HTTPS + HTTP */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* HTTPS Card */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">HTTPS / TLS 1.3</div>
                <div className="text-[11px] text-emerald-400 font-medium">Bảo mật kết nối tối đa</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
              PORT 443
            </span>
          </div>
          <div className="text-xs text-slate-300 space-y-1 font-mono pt-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Issuer:</span>
              <span className="text-slate-200">Let's Encrypt E6</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Hạn dùng:</span>
              <span className="text-emerald-400">{ssl.daysRemaining} ngày (Tự động gia hạn)</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">HSTS Preload:</span>
              <span className="text-cyan-400">31,536,000s (A+)</span>
            </div>
          </div>
        </div>

        {/* HTTP Card */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">HTTP Redirect 301</div>
                <div className="text-[11px] text-cyan-400 font-medium">Chuyển hướng bắt buộc</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">
              PORT 80
            </span>
          </div>
          <div className="text-xs text-slate-300 space-y-1 font-mono pt-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">HTTP/80 Behavior:</span>
              <span className="text-slate-200">301 Permanent -&gt; 443</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">HTTP/2 &amp; HTTP/3:</span>
              <span className="text-emerald-400">QUIC ALPN Enabled</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Gzip &amp; Brotli:</span>
              <span className="text-cyan-400">Level 6 Active (92% hit)</span>
            </div>
          </div>
        </div>

        {/* DNS Card */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">DNS / Anycast</div>
                <div className="text-[11px] text-blue-400 font-medium">Phân giải toàn cầu 100%</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
              DNSSEC OK
            </span>
          </div>
          <div className="text-xs text-slate-300 space-y-1 font-mono pt-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">A / AAAA Records:</span>
              <span className="text-slate-200">Đã trỏ chính xác</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Edge Proxying:</span>
              <span className="text-emerald-400">Bật (Cloudflare Argo)</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Avg Propagation:</span>
              <span className="text-cyan-400">&lt; 14ms Global</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time System Resource Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Metric Card */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isCpuExceeded 
            ? 'bg-rose-950/30 border-rose-500/50 shadow-lg shadow-rose-950/30' 
            : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Sử Dụng CPU</span>
            </div>
            <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
              metric.cpuUsage >= thresholds.cpuCritical 
                ? 'bg-rose-500 text-white' 
                : metric.cpuUsage >= thresholds.cpuWarning 
                ? 'bg-amber-500/20 text-amber-300' 
                : 'bg-emerald-500/15 text-emerald-400'
            }`}>
              {metric.cpuUsage >= thresholds.cpuCritical ? 'CRITICAL' : metric.cpuUsage >= thresholds.cpuWarning ? 'WARNING' : 'NORMAL'}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
              {metric.cpuUsage.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Load: {metric.load1m} / {metric.load5m}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                metric.cpuUsage >= thresholds.cpuCritical 
                  ? 'bg-rose-500' 
                  : metric.cpuUsage >= thresholds.cpuWarning 
                  ? 'bg-amber-400' 
                  : 'bg-gradient-to-r from-cyan-500 to-blue-500'
              }`}
              style={{ width: `${Math.min(100, metric.cpuUsage)}%` }}
            />
          </div>

          {/* 4 cores breakdown */}
          <div className="grid grid-cols-4 gap-1.5 mt-3 pt-2 border-t border-slate-800/80">
            {metric.cpuCores.map((coreVal, idx) => (
              <div key={idx} className="text-center">
                <div className="text-[9px] text-slate-500 font-mono">C{idx}</div>
                <div className="text-[11px] font-mono font-medium text-slate-300">
                  {coreVal.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RAM Metric Card */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isRamExceeded 
            ? 'bg-rose-950/30 border-rose-500/50 shadow-lg shadow-rose-950/30' 
            : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Bộ Nhớ RAM</span>
            </div>
            <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
              metric.ramUsagePercent >= thresholds.ramCritical 
                ? 'bg-rose-500 text-white' 
                : metric.ramUsagePercent >= thresholds.ramWarning 
                ? 'bg-amber-500/20 text-amber-300' 
                : 'bg-emerald-500/15 text-emerald-400'
            }`}>
              {metric.ramUsagePercent.toFixed(0)}%
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
              {metric.ramUsedGb} <span className="text-sm font-normal text-slate-400">/ {metric.ramTotalGb} GB</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                metric.ramUsagePercent >= thresholds.ramCritical 
                  ? 'bg-rose-500' 
                  : metric.ramUsagePercent >= thresholds.ramWarning 
                  ? 'bg-amber-400' 
                  : 'bg-gradient-to-r from-purple-500 to-indigo-500'
              }`}
              style={{ width: `${Math.min(100, metric.ramUsagePercent)}%` }}
            />
          </div>

          <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
            <span>Swap: {metric.swapUsedGb} / {metric.swapTotalGb} GB</span>
            <span className="text-emerald-400">Buffers: 2.1 GB</span>
          </div>
        </div>

        {/* Disk NVMe Card */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <span>Ổ Cứng NVMe SSD</span>
            </div>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
              {metric.diskUsagePercent.toFixed(0)}%
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
              {metric.diskUsedGb} <span className="text-sm font-normal text-slate-400">/ {metric.diskTotalGb} GB</span>
            </div>
          </div>

          <div className="w-full h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, metric.diskUsagePercent)}%` }}
            />
          </div>

          <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
            <span>I/O Operations:</span>
            <span className="text-slate-200 font-semibold">{metric.diskIops} IOPS</span>
          </div>
        </div>

        {/* Network & Active Sockets Card */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Wifi className="w-4 h-4 text-blue-400" />
              <span>Băng Thông Mạng</span>
            </div>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
              {metric.latencyMs} ms
            </span>
          </div>

          <div className="space-y-1 mt-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1 text-emerald-400">
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Rx In:
              </span>
              <span className="font-bold text-white">{metric.networkInMbps.toFixed(0)} Mbps</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1 text-cyan-400">
                <ArrowUpRight className="w-3.5 h-3.5" />
                Tx Out:
              </span>
              <span className="font-bold text-white">{metric.networkOutMbps.toFixed(0)} Mbps</span>
            </div>
          </div>

          <div className="flex justify-between items-center mt-4 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
            <span>TCP Sockets:</span>
            <span className="text-cyan-300 font-semibold">{metric.activeConnections} active</span>
          </div>
        </div>
      </div>

      {/* Real-time Telemetry Trend (Recharts Engine) */}
      {metrics && metrics.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-0.5">
                <LineChartIcon className="w-4 h-4" />
                <span>Theo Dõi Tài Nguyên Thời Gian Thực (Recharts)</span>
              </div>
              <p className="text-xs text-slate-400">
                Tương quan phụ tải CPU (%) và Bộ nhớ RAM (%) trực tiếp trên node {node.hostname}
              </p>
            </div>
            {onNavigateToCharts && (
              <button
                id="overview-view-all-charts-btn"
                onClick={onNavigateToCharts}
                className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <span>Mở Toàn Bộ Biểu Đồ</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="ovCpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="ovRamGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                <ReferenceLine y={thresholds.cpuCritical} stroke="#f43f5e" strokeDasharray="3 3" />
                <ReferenceLine y={thresholds.ramCritical} stroke="#fb7185" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="cpuUsage" name="CPU Usage %" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#ovCpuGrad)" />
                <Area type="monotone" dataKey="ramUsagePercent" name="RAM Usage %" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#ovRamGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Security & 2FA Status Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isTwoFactorActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-200">
              {isTwoFactorActive ? 'Hệ thống được bảo vệ bởi xác thực hai yếu tố (2FA)' : 'Cảnh báo: Chưa kích hoạt xác thực hai yếu tố (2FA)'}
            </div>
            <div className="text-slate-400 text-[11px]">
              {isTwoFactorActive 
                ? 'Mọi thay đổi nhạy cảm về DNS, SSL và Hostname đều yêu cầu mã TOTP Authenticator 6 số.' 
                : 'Khuyến nghị kích hoạt 2FA ngay để đảm bảo an toàn tuyệt đối cho người quản trị.'}
            </div>
          </div>
        </div>

        <button
          id="configure-2fa-btn"
          onClick={onOpenSecurity}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700 transition-colors self-start sm:self-auto"
        >
          {isTwoFactorActive ? 'Quản lý 2FA' : 'Kích hoạt ngay'}
        </button>
      </div>
    </div>
  );
};
