import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Sparkles,
  ChevronDown,
  Check,
  Calendar,
  History,
  Radio
} from 'lucide-react';
import { MetricSnapshot, AlertThresholds, ChartTimeframe } from '../types';
import { generateTimeframeMetrics } from '../mockData';
import { NetworkTrafficHeatmap } from './NetworkTrafficHeatmap';
import { PeakUtilizationTimeline } from './PeakUtilizationTimeline';
import { ChartFullscreenModal, ChartType } from './ChartFullscreenModal';

interface ChartsTabProps {
  metrics: MetricSnapshot[];
  thresholds: AlertThresholds;
  isStreaming: boolean;
  onToggleStreaming: () => void;
}

interface TimeframeOption {
  id: ChartTimeframe;
  label: string;
  shortLabel: string;
  description: string;
  resolution: string;
  points: number;
  badge: string;
}

const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  {
    id: 'live',
    label: 'Thời gian thực (Live 15m)',
    shortLabel: 'Live',
    description: 'Cập nhật trực tiếp mỗi 2.5 giây từ máy chủ edge',
    resolution: '2.5s / mẫu',
    points: 25,
    badge: 'Live Stream',
  },
  {
    id: '1h',
    label: '1 Giờ qua (1h)',
    shortLabel: '1h',
    description: 'Lịch sử hiệu suất 60 phút gần nhất',
    resolution: '2 phút / mẫu',
    points: 30,
    badge: '1 Giờ',
  },
  {
    id: '6h',
    label: '6 Giờ qua (6h)',
    shortLabel: '6h',
    description: 'Dữ liệu vận hành nửa ngày làm việc',
    resolution: '10 phút / mẫu',
    points: 36,
    badge: '6 Giờ',
  },
  {
    id: '12h',
    label: '12 Giờ qua (12h)',
    shortLabel: '12h',
    description: 'Dữ liệu xu hướng 12 giờ liên tục',
    resolution: '20 phút / mẫu',
    points: 36,
    badge: '12 Giờ',
  },
  {
    id: '24h',
    label: '24 Giờ qua (24h)',
    shortLabel: '24h',
    description: 'Toàn cảnh chu kỳ 24 giờ ngày & đêm',
    resolution: '30 phút / mẫu',
    points: 48,
    badge: '24 Giờ',
  },
];

export const ChartsTab: React.FC<ChartsTabProps> = ({
  metrics,
  thresholds,
  isStreaming,
  onToggleStreaming,
}) => {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('live');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [maximizedChart, setMaximizedChart] = useState<ChartType | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute display metrics based on selected timeframe
  const displayMetrics = useMemo(() => {
    if (timeframe === 'live') {
      return metrics;
    }
    // Generate historical dataset corresponding to timeframe
    return generateTimeframeMetrics(timeframe, metrics);
  }, [timeframe, metrics, refreshKey]);

  const activeOption = TIMEFRAME_OPTIONS.find(opt => opt.id === timeframe) || TIMEFRAME_OPTIONS[0];

  // Compute summary stats dynamically for the active timeframe dataset
  const cpuValues = displayMetrics.map(m => m.cpuUsage);
  const avgCpu = cpuValues.length ? (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length).toFixed(1) : '0';
  const maxCpu = cpuValues.length ? Math.max(...cpuValues).toFixed(1) : '0';

  const ramValues = displayMetrics.map(m => m.ramUsagePercent);
  const avgRam = ramValues.length ? (ramValues.reduce((a, b) => a + b, 0) / ramValues.length).toFixed(1) : '0';
  const peakRam = ramValues.length ? Math.max(...ramValues).toFixed(1) : '0';

  const currentMetric = displayMetrics[displayMetrics.length - 1] || metrics[metrics.length - 1] || metrics[0];

  const handleSelectTimeframe = (tf: ChartTimeframe) => {
    setTimeframe(tf);
    setIsDropdownOpen(false);
  };

  const handleRefreshHistorical = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header with timeframe dropdown & controls */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
          {/* Custom Time Range Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="timeframe-dropdown-btn"
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-xs font-mono font-semibold text-slate-200 border border-slate-700 hover:border-cyan-500/50 transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400 font-normal">Phạm vi:</span>
              <span className="text-white font-bold">{activeOption.shortLabel}</span>
              <span className="text-[10px] text-cyan-400/90 hidden sm:inline bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                {activeOption.resolution}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-cyan-400' : ''}`} />
            </button>

            {/* Dropdown Menu Popup */}
            {isDropdownOpen && (
              <div 
                id="timeframe-dropdown-menu"
                className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                role="listbox"
              >
                <div className="px-3 py-2 text-[11px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3 h-3 text-cyan-400" />
                    Chọn Khoảng Thời Gian
                  </span>
                  <span className="text-[10px] text-cyan-400">{activeOption.points} mẫu</span>
                </div>

                <div className="py-1 space-y-1">
                  {TIMEFRAME_OPTIONS.map((opt) => {
                    const isSelected = timeframe === opt.id;
                    return (
                      <button
                        key={opt.id}
                        id={`timeframe-option-${opt.id}`}
                        type="button"
                        onClick={() => handleSelectTimeframe(opt.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-start justify-between gap-2 text-xs font-mono ${
                          isSelected
                            ? 'bg-cyan-500/15 border border-cyan-500/30 text-white font-bold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                        }`}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            {opt.id === 'live' ? (
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            ) : (
                              <Clock className="w-3 h-3 text-cyan-400" />
                            )}
                            <span className={isSelected ? 'text-cyan-300' : 'text-slate-200'}>
                              {opt.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-sans pl-5">
                            {opt.description}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                            {opt.resolution}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Quick-select pills for instant 1-click filtering */}
          <div className="hidden sm:flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            {TIMEFRAME_OPTIONS.map((tf) => (
              <button
                key={tf.id}
                id={`quick-timeframe-btn-${tf.id}`}
                onClick={() => setTimeframe(tf.id)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  timeframe === tf.id
                    ? 'bg-cyan-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={tf.description}
              >
                {tf.shortLabel}
              </button>
            ))}
          </div>

          {/* Controls: Stream Pause / Resume or Historical Refresh */}
          {timeframe === 'live' ? (
            <button
              id="toggle-streaming-btn"
              onClick={onToggleStreaming}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
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
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                id="refresh-historical-btn"
                onClick={handleRefreshHistorical}
                className="px-3 py-2 rounded-xl text-xs font-mono font-medium flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-cyan-500/50 transition-all shadow-sm"
                title="Làm mới tập dữ liệu lịch sử"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>Làm Mới</span>
              </button>
              <button
                id="back-to-live-btn"
                onClick={() => setTimeframe('live')}
                className="px-3 py-2 rounded-xl text-xs font-mono font-medium flex items-center gap-1.5 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/60 hover:border-cyan-500 transition-all shadow-sm"
                title="Quay lại luồng trực tiếp thời gian thực"
              >
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Về Live</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Historical Filter Active Notice */}
      {timeframe !== 'live' && (
        <div className="px-4 py-2.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-cyan-300">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>
              Đang lọc dữ liệu lịch sử <strong className="text-white">{activeOption.label}</strong>: {displayMetrics.length} điểm mẫu ({activeOption.resolution})
            </span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span>Từ: <span className="text-slate-200">{displayMetrics[0]?.timeLabel}</span></span>
            <span>-</span>
            <span>Đến: <span className="text-slate-200">{displayMetrics[displayMetrics.length - 1]?.timeLabel}</span></span>
          </div>
        </div>
      )}

      {/* Summary KPI Cards (computed dynamically from active timeframe metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>CPU Trung Bình / Đỉnh ({activeOption.shortLabel})</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {avgCpu}% <span className="text-xs text-rose-400 font-normal">(Max: {maxCpu}%)</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>RAM Trung Bình / Đỉnh ({activeOption.shortLabel})</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {avgRam}% <span className="text-xs text-purple-400 font-normal">(Max: {peakRam}%)</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>Lưu Lượng Rx / Tx ({activeOption.shortLabel})</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {currentMetric.networkInMbps.toFixed(0)} <span className="text-xs text-slate-400">/ {currentMetric.networkOutMbps.toFixed(0)} Mbps</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>P95 HTTP Latency ({activeOption.shortLabel})</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {currentMetric.latencyMs} <span className="text-xs text-emerald-400 font-normal">ms (A+ SLA)</span>
          </div>
        </div>
      </div>

      {/* 24-Hour Peak Utilization Horizontal Timeline */}
      <PeakUtilizationTimeline thresholds={thresholds} currentMetric={currentMetric} />

      {/* 7x24 Matrix Network Traffic Heatmap & Peak Pattern Analysis */}
      <NetworkTrafficHeatmap currentMetric={currentMetric} />

      {/* Chart 1: CPU Utilization with Warning & Critical Lines */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Biểu Đồ Phụ Tải CPU (%) - {activeOption.label}</span>
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
            <AreaChart data={displayMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <span>Biểu Đồ Bộ Nhớ RAM &amp; Tỷ Lệ Chiếm Dụng (%) - {activeOption.label}</span>
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
            <AreaChart data={displayMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <span className="text-xs font-mono text-emerald-400">{activeOption.shortLabel}</span>
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
              <LineChart data={displayMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <span className="text-xs font-mono text-amber-400">{activeOption.shortLabel}</span>
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
              <BarChart data={displayMetrics} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                data={displayMetrics.map(m => ({
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
              <AreaChart data={displayMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
        metrics={displayMetrics}
        thresholds={thresholds}
        isStreaming={isStreaming}
        onToggleStreaming={onToggleStreaming}
        timeframe={timeframe}
        setTimeframe={setTimeframe}
      />
    </div>
  );
};
