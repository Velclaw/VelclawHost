import React, { useState } from 'react';
import { 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  Legend
} from 'recharts';
import { 
  LineChart as LineChartIcon, 
  Cpu, 
  Layers, 
  Wifi, 
  HardDrive, 
  Play, 
  Pause, 
  RefreshCw,
  Clock,
  TrendingUp,
  Activity,
  Maximize2,
  Minimize2,
  X,
  Sparkles
} from 'lucide-react';
import { MetricSnapshot, AlertThresholds } from '../types';
import { NetworkTrafficHeatmap } from './NetworkTrafficHeatmap';
import { PeakUtilizationTimeline } from './PeakUtilizationTimeline';
import { ChartFullscreenModal, ChartType } from './ChartFullscreenModal';

interface ChartsTabProps {
  metrics: MetricSnapshot[];
  thresholds: AlertThresholds;
  isStreaming: boolean;
  onToggleStreaming: () => void;
}

export const ChartsTab: React.FC<ChartsTabProps> = ({
  metrics,
  thresholds,
  isStreaming,
  onToggleStreaming,
}) => {
  const [timeframe, setTimeframe] = useState<'5m' | '1h' | '24h' | '7d'>('5m');
  const [maximizedChart, setMaximizedChart] = useState<ChartType | null>(null);

  // Compute summary stats
  const cpuValues = metrics.map(m => m.cpuUsage);
  const avgCpu = cpuValues.length ? (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length).toFixed(1) : '0';
  const maxCpu = cpuValues.length ? Math.max(...cpuValues).toFixed(1) : '0';

  const ramValues = metrics.map(m => m.ramUsagePercent);
  const avgRam = ramValues.length ? (ramValues.reduce((a, b) => a + b, 0) / ramValues.length).toFixed(1) : '0';
  const peakRam = ramValues.length ? Math.max(...ramValues).toFixed(1) : '0';

  const currentMetric = metrics[metrics.length - 1] || metrics[0];

  return (
    <div className="space-y-6">
      {/* Header with timeframe & streaming controls */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
            <LineChartIcon className="w-4 h-4" />
            <span>Phân Tích Hiệu Suất Hệ Thống (Recharts Engine)</span>
          </div>
          <h2 className="text-xl font-bold text-white font-mono">
            Trực Quan Hóa Số Liệu Tài Nguyên Theo Thời Gian Thực
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe pill selector */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            {(['5m', '1h', '24h', '7d'] as const).map((tf) => (
              <button
                key={tf}
                id={`timeframe-btn-${tf}`}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  timeframe === tf
                    ? 'bg-cyan-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf === '5m' ? '5 Phút (Live)' : tf === '1h' ? '1 Giờ' : tf === '24h' ? '24 Giờ' : '7 Ngày'}
              </button>
            ))}
          </div>

          {/* Pause / Resume Live Stream */}
          <button
            id="toggle-streaming-btn"
            onClick={onToggleStreaming}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              isStreaming
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
            }`}
          >
            {isStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Tạm Dừng Live</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Tiếp Tục Live</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>CPU Trung Bình / Đỉnh</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {avgCpu}% <span className="text-xs text-rose-400 font-normal">(Max: {maxCpu}%)</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>RAM Trung Bình / Đỉnh</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {avgRam}% <span className="text-xs text-purple-400 font-normal">(Max: {peakRam}%)</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>Lưu Lượng Rx / Tx</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {currentMetric.networkInMbps.toFixed(0)} <span className="text-xs text-slate-400">/ {currentMetric.networkOutMbps.toFixed(0)} Mbps</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>P95 HTTP Latency</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {currentMetric.latencyMs} <span className="text-xs text-emerald-400 font-normal">ms (A+ SLA)</span>
          </div>
        </div>
      </div>

      {/* 24-Hour Peak Utilization Horizontal Timeline */}
      <PeakUtilizationTimeline thresholds={thresholds} currentMetric={currentMetric} />

      {/* Chart 1: CPU Utilization with Warning & Critical Lines */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Biểu Đồ Phụ Tải CPU (%) Theo Thời Gian</span>
            </h3>
            <p className="text-xs text-slate-400">Đường chuẩn cảnh báo vàng ({thresholds.cpuWarning}%) và đỏ ({thresholds.cpuCritical}%)</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3 text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-amber-400"></span>
                Warning ({thresholds.cpuWarning}%)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-rose-500"></span>
                Critical ({thresholds.cpuCritical}%)
              </span>
            </div>
            <button
              id="maximize-chart-cpu-btn"
              onClick={() => setMaximizedChart('cpu')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 border border-slate-700 hover:border-cyan-500/50 transition-all shadow-sm"
              title="Phóng to biểu đồ CPU toàn màn hình"
            >
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Phóng to</span>
            </button>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <ReferenceLine y={thresholds.cpuWarning} stroke="#fbbf24" strokeDasharray="3 3" />
              <ReferenceLine y={thresholds.cpuCritical} stroke="#f43f5e" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="cpuUsage" name="CPU Usage %" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#cpuGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: RAM Memory Utilization (Used vs Free GB) */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Biểu Đồ Bộ Nhớ RAM &amp; Tỷ Lệ Chiếm Dụng (%)</span>
            </h3>
            <p className="text-xs text-slate-400">Giám sát RAM Used so với Tổng dung lượng 16.0 GB</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-purple-300 font-semibold">
              Hiện tại: {currentMetric.ramUsedGb} GB ({currentMetric.ramUsagePercent}%)
            </div>
            <button
              id="maximize-chart-ram-btn"
              onClick={() => setMaximizedChart('ram')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 border border-slate-700 hover:border-purple-500/50 transition-all shadow-sm"
              title="Phóng to biểu đồ RAM toàn màn hình"
            >
              <Maximize2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Phóng to</span>
            </button>
          </div>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
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
              <ReferenceLine y={thresholds.ramWarning} stroke="#fbbf24" strokeDasharray="3 3" />
              <ReferenceLine y={thresholds.ramCritical} stroke="#f43f5e" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="ramUsagePercent" name="RAM Usage %" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#ramGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid of 2 Charts: Network Throughput & Disk IOPS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Network In/Out */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span>Băng Thông Mạng (Mbps Rx/Tx)</span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-emerald-400">Dual-stream</span>
              <button
                id="maximize-chart-network-btn"
                onClick={() => setMaximizedChart('network')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 border border-slate-700 hover:border-emerald-500/50 transition-all shadow-sm"
                title="Phóng to biểu đồ Băng thông mạng toàn màn hình"
              >
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phóng to</span>
              </button>
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="networkInMbps" name="Rx In (Mbps)" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="networkOutMbps" name="Tx Out (Mbps)" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Disk IOPS */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400" />
              <span>Disk I/O Operations (IOPS)</span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-amber-400">NVMe SSD</span>
              <button
                id="maximize-chart-disk-btn"
                onClick={() => setMaximizedChart('disk')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 border border-slate-700 hover:border-amber-500/50 transition-all shadow-sm"
                title="Phóng to biểu đồ Disk IOPS toàn màn hình"
              >
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Phóng to</span>
              </button>
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="diskIops" name="Read/Write IOPS" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Network Traffic Heatmap for Peak Hours Detection */}
      <NetworkTrafficHeatmap currentMetric={currentMetric} />

      {/* Additional Deep Dive Charts: Multi-Core CPU & Latency/Connections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Core 0-3 Load Distribution */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Phân Bổ Tải Theo Từng Lõi CPU (Cores 0-3)</span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-indigo-400">4 vCPU Cores</span>
              <button
                id="maximize-chart-cores-btn"
                onClick={() => setMaximizedChart('cores')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 border border-slate-700 hover:border-indigo-500/50 transition-all shadow-sm"
                title="Phóng to biểu đồ phân bổ lõi CPU toàn màn hình"
              >
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Phóng to</span>
              </button>
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={metrics.map(m => ({
                  timeLabel: m.timeLabel,
                  core0: m.cpuCores[0] || m.cpuUsage,
                  core1: m.cpuCores[1] || m.cpuUsage,
                  core2: m.cpuCores[2] || m.cpuUsage,
                  core3: m.cpuCores[3] || m.cpuUsage,
                }))} 
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="core0" name="Core 0" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="core1" name="Core 1" stroke="#818cf8" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="core2" name="Core 2" stroke="#c084fc" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="core3" name="Core 3" stroke="#f472b6" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* HTTP Latency & Active TCP Connections */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Độ Trễ Phản Hồi HTTP &amp; Kết Nối Đồng Thời</span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-emerald-400">P95 / Sockets</span>
              <button
                id="maximize-chart-latency-btn"
                onClick={() => setMaximizedChart('latency')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 border border-slate-700 hover:border-emerald-500/50 transition-all shadow-sm"
                title="Phóng to biểu đồ Độ trễ HTTP toàn màn hình"
              >
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phóng to</span>
              </button>
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Area type="monotone" dataKey="latencyMs" name="P95 Latency (ms)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#latencyGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Fullscreen Chart Modal */}
      <ChartFullscreenModal
        chartType={maximizedChart}
        onClose={() => setMaximizedChart(null)}
        metrics={metrics}
        thresholds={thresholds}
        isStreaming={isStreaming}
        onToggleStreaming={onToggleStreaming}
        timeframe={timeframe}
        setTimeframe={setTimeframe}
      />
    </div>
  );
};
