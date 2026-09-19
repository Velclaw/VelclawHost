import React, { useEffect, useMemo } from 'react';
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
  X, 
  Minimize2, 
  Cpu, 
  Layers, 
  Wifi, 
  HardDrive, 
  Activity, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  Play, 
  Pause,
  Info,
  CheckCircle2,
  Table,
  Zap,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';
import { MetricSnapshot, AlertThresholds, ChartTimeframe } from '../types';

export type ChartType = 'cpu' | 'ram' | 'network' | 'disk' | 'cores' | 'latency';

interface ChartFullscreenModalProps {
  chartType: ChartType | null;
  onClose: () => void;
  metrics: MetricSnapshot[];
  thresholds: AlertThresholds;
  isStreaming: boolean;
  onToggleStreaming: () => void;
  timeframe: ChartTimeframe;
  setTimeframe: (tf: ChartTimeframe) => void;
}

export const ChartFullscreenModal: React.FC<ChartFullscreenModalProps> = ({
  chartType,
  onClose,
  metrics,
  thresholds,
  isStreaming,
  onToggleStreaming,
  timeframe,
  setTimeframe,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // If no chart selected, render nothing
  if (!chartType) return null;

  const currentMetric = metrics[metrics.length - 1] || metrics[0];

  // Metadata per chart type
  const chartMeta = useMemo(() => {
    switch (chartType) {
      case 'cpu':
        return {
          title: 'Phân Tích Chi Tiết Phụ Tải CPU (%)',
          subtitle: 'Giám sát mức sử dụng vCPU theo thời gian thực kết hợp ngưỡng cảnh báo Warning và Critical',
          icon: <Cpu className="w-5 h-5 text-cyan-400" />,
          badge: 'vCPU Metrics',
          color: '#06b6d4',
          unit: '%',
          currentVal: `${currentMetric.cpuUsage.toFixed(1)}%`,
          warningLine: thresholds.cpuWarning,
          criticalLine: thresholds.cpuCritical,
        };
      case 'ram':
        return {
          title: 'Phân Tích Chi Tiết Bộ Nhớ RAM (Used vs Free GB)',
          subtitle: 'Theo dõi dung lượng RAM vật lý sử dụng và tỷ lệ phần trăm chiếm dụng của các tiến trình hệ thống',
          icon: <Layers className="w-5 h-5 text-purple-400" />,
          badge: 'Memory Usage',
          color: '#a855f7',
          unit: '%',
          currentVal: `${currentMetric.ramUsedGb} GB (${currentMetric.ramUsagePercent}%)`,
          warningLine: thresholds.ramWarning,
          criticalLine: thresholds.ramCritical,
        };
      case 'network':
        return {
          title: 'Phân Tích Chi Tiết Băng Thông Mạng (Rx/Tx Mbps)',
          subtitle: 'Lưu lượng mạng Inbound (tải vào) và Outbound (tải ra) qua card mạng ảo vNIC',
          icon: <Wifi className="w-5 h-5 text-emerald-400" />,
          badge: 'Network Dual-Stream',
          color: '#10b981',
          unit: 'Mbps',
          currentVal: `Rx: ${currentMetric.networkInMbps.toFixed(0)} / Tx: ${currentMetric.networkOutMbps.toFixed(0)} Mbps`,
        };
      case 'disk':
        return {
          title: 'Phân Tích Chi Tiết Thao Tác Đọc/Ghi Đĩa (NVMe SSD IOPS)',
          subtitle: 'Số thao tác Input/Output mỗi giây trên ổ cứng thể rắn chuẩn NVMe tốc độ cao',
          icon: <HardDrive className="w-5 h-5 text-amber-400" />,
          badge: 'Disk I/O Operations',
          color: '#f59e0b',
          unit: 'IOPS',
          currentVal: `${currentMetric.diskIops} IOPS`,
        };
      case 'cores':
        return {
          title: 'Phân Bổ Tải Chi Tiết Trên Từng Lõi CPU (Cores 0-3)',
          subtitle: 'So sánh mức độ bận rộn giữa 4 nhân vCPU để phát hiện hiện tượng lệch tải (Core Unbalance)',
          icon: <Cpu className="w-5 h-5 text-indigo-400" />,
          badge: 'Multi-Core SMP',
          color: '#6366f1',
          unit: '%',
          currentVal: `C0: ${currentMetric.cpuCores[0]}% | C1: ${currentMetric.cpuCores[1]}% | C2: ${currentMetric.cpuCores[2]}% | C3: ${currentMetric.cpuCores[3]}%`,
        };
      case 'latency':
        return {
          title: 'Phân Tích Chi Tiết Độ Trễ HTTP P95 & Sockets Kết Nối',
          subtitle: 'Thời gian đáp ứng của Gateway Reverse Proxy và số lượng kết nối TCP đồng thời',
          icon: <Activity className="w-5 h-5 text-emerald-400" />,
          badge: 'HTTP SLA & Sockets',
          color: '#10b981',
          unit: 'ms',
          currentVal: `${currentMetric.latencyMs} ms (${currentMetric.activeConnections} Connections)`,
        };
    }
  }, [chartType, currentMetric, thresholds]);

  // Calculate deep dive statistics for the selected metric
  const stats = useMemo(() => {
    if (!metrics.length) return null;

    if (chartType === 'cpu') {
      const vals = metrics.map(m => m.cpuUsage);
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const peakItem = metrics.find(m => m.cpuUsage === max);
      return {
        max: `${max.toFixed(1)}%`,
        min: `${min.toFixed(1)}%`,
        avg: `${avg.toFixed(1)}%`,
        peakTime: peakItem?.timeLabel || 'N/A',
        status: max >= thresholds.cpuCritical ? 'Nguy cấp' : max >= thresholds.cpuWarning ? 'Cảnh báo' : 'Ổn định',
        recommendation: max >= thresholds.cpuCritical 
          ? 'Tải CPU tiệm cận 100%. Khuyến nghị bật Horizontal Pod Autoscaler (HPA) hoặc tối ưu các câu truy vấn chậm.' 
          : 'Tải CPU nằm trong biên độ an toàn của hệ thống máy chủ.',
      };
    }

    if (chartType === 'ram') {
      const vals = metrics.map(m => m.ramUsagePercent);
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const peakItem = metrics.find(m => m.ramUsagePercent === max);
      return {
        max: `${max.toFixed(1)}%`,
        min: `${min.toFixed(1)}%`,
        avg: `${avg.toFixed(1)}%`,
        peakTime: peakItem?.timeLabel || 'N/A',
        status: max >= thresholds.ramCritical ? 'Nguy cấp' : max >= thresholds.ramWarning ? 'Cảnh báo' : 'Ổn định',
        recommendation: max >= thresholds.ramCritical
          ? 'RAM sắp cạn kiệt. Cần kích hoạt bộ dọn dẹp bộ nhớ đệm hoặc nâng cấp gói RAM lên 32GB để tránh kích hoạt OOM Killer.'
          : 'Mức tiêu thụ bộ nhớ ổn định, tiến trình cache hoạt động hiệu quả.',
      };
    }

    if (chartType === 'network') {
      const inVals = metrics.map(m => m.networkInMbps);
      const outVals = metrics.map(m => m.networkOutMbps);
      const maxIn = Math.max(...inVals);
      const maxOut = Math.max(...outVals);
      const avgIn = inVals.reduce((a, b) => a + b, 0) / inVals.length;
      const avgOut = outVals.reduce((a, b) => a + b, 0) / outVals.length;
      return {
        max: `Rx ${maxIn.toFixed(0)} / Tx ${maxOut.toFixed(0)} Mbps`,
        min: `Rx ${Math.min(...inVals).toFixed(0)} / Tx ${Math.min(...outVals).toFixed(0)} Mbps`,
        avg: `Rx ${avgIn.toFixed(0)} / Tx ${avgOut.toFixed(0)} Mbps`,
        peakTime: metrics[metrics.length - 1]?.timeLabel || 'N/A',
        status: 'Bình thường',
        recommendation: 'Lưu lượng mạng đối xứng cân bằng. Không phát hiện dấu hiệu tấn công SYN Flood hoặc DDoS.',
      };
    }

    if (chartType === 'disk') {
      const vals = metrics.map(m => m.diskIops);
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return {
        max: `${max} IOPS`,
        min: `${min} IOPS`,
        avg: `${Math.round(avg)} IOPS`,
        peakTime: metrics.find(m => m.diskIops === max)?.timeLabel || 'N/A',
        status: max > 2500 ? 'Tải cao' : 'Ổn định',
        recommendation: max > 2500 
          ? 'Đĩa cứng chịu nhiều thao tác ghi ngẫu nhiên. Cần kiểm tra write-buffer và tần suất sync WAL của cơ sở dữ liệu.'
          : 'Băng thông đĩa NVMe SSD hoạt động dồi dào, hàng đợi I/O trống trải.',
      };
    }

    if (chartType === 'cores') {
      return {
        max: '4 Cores',
        min: 'Tải cân bằng',
        avg: `${currentMetric.cpuUsage.toFixed(1)}%`,
        peakTime: currentMetric.timeLabel,
        status: 'Ổn định',
        recommendation: 'Bộ điều phối Linux CFS phân bổ tải đều trên cả 4 nhân vCPU, không có lõi nào bị nghẽn đơn luồng.',
      };
    }

    // Latency
    const lVals = metrics.map(m => m.latencyMs);
    const maxL = Math.max(...lVals);
    const avgL = lVals.reduce((a, b) => a + b, 0) / lVals.length;
    return {
      max: `${maxL} ms`,
      min: `${Math.min(...lVals)} ms`,
      avg: `${Math.round(avgL)} ms`,
      peakTime: metrics.find(m => m.latencyMs === maxL)?.timeLabel || 'N/A',
      status: maxL > 50 ? 'Cảnh báo độ trễ' : 'A+ SLA Tối Ưu',
      recommendation: maxL > 50
        ? 'Độ trễ P95 tăng đột biến. Kiểm tra kết nối cơ sở dữ liệu và thời gian phản hồi của upstream vi dịch vụ.'
        : 'Độ trễ phản hồi < 30ms đáp ứng tiêu chuẩn SLA cao nhất cho ứng dụng web.',
    };
  }, [metrics, chartType, thresholds, currentMetric]);

  // Last 8 data points for detail data table
  const recentPoints = useMemo(() => {
    return [...metrics].slice(-8).reverse();
  }, [metrics]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col p-3 sm:p-6 overflow-y-auto animate-fade-in">
      {/* Modal Container */}
      <div className="w-full max-w-7xl mx-auto flex flex-col flex-1 space-y-4">
        
        {/* Top Fullscreen Header */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
              {chartMeta.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white font-mono">
                  {chartMeta.title}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {chartMeta.badge}
                </span>
                <span className="hidden sm:inline-flex text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Chế độ Toàn Màn Hình
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {chartMeta.subtitle}
              </p>
            </div>
          </div>

          {/* Controls: Timeframe, Live stream toggle, and Close */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Timeframe pill selector */}
            <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              {([
                { id: 'live', label: 'Live' },
                { id: '1h', label: '1 Giờ' },
                { id: '6h', label: '6 Giờ' },
                { id: '12h', label: '12 Giờ' },
                { id: '24h', label: '24 Giờ' },
              ] as const).map((tf) => (
                <button
                  key={tf.id}
                  id={`fullscreen-timeframe-${tf.id}`}
                  onClick={() => setTimeframe(tf.id)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    timeframe === tf.id
                      ? 'bg-cyan-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Pause / Resume Live Stream */}
            <button
              id="fullscreen-toggle-streaming"
              onClick={onToggleStreaming}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                isStreaming
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
              }`}
            >
              {isStreaming ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tạm Dừng</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tiếp Tục</span>
                </>
              )}
            </button>

            {/* Minimize / Close Fullscreen Button */}
            <button
              id="close-fullscreen-chart-btn"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-rose-500"
              title="Đóng toàn màn hình (Phím ESC)"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Thu Nhỏ (Esc)</span>
            </button>
          </div>
        </div>

        {/* Statistical Summary Bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Hiện tại / Giá trị thực</span>
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-lg font-bold font-mono text-white mt-1">
                {chartMeta.currentVal}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Đỉnh cao nhất (Peak)</span>
                <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-lg font-bold font-mono text-rose-400 mt-1 flex items-baseline gap-2">
                <span>{stats.max}</span>
                <span className="text-xs text-slate-400 font-normal">({stats.peakTime})</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Mức trung bình (Avg)</span>
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                {stats.avg}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Trạng thái đánh giá</span>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-lg font-bold font-mono text-amber-300 mt-1">
                {stats.status}
              </div>
            </div>
          </div>
        )}

        {/* Large High-Resolution Chart Stage */}
        <div className="p-4 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono pb-1 border-b border-slate-800">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span>Dữ liệu thời gian thực ({metrics.length} điểm lấy mẫu)</span>
            </span>
            {chartMeta.warningLine && chartMeta.criticalLine && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-amber-400"></span>
                  <span>Ngưỡng cảnh báo: {chartMeta.warningLine}%</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-rose-500"></span>
                  <span>Ngưỡng nguy cấp: {chartMeta.criticalLine}%</span>
                </span>
              </div>
            )}
          </div>

          <div className="h-[48vh] min-h-[380px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'cpu' ? (
                <AreaChart data={metrics} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpuFullGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '13px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <ReferenceLine y={thresholds.cpuWarning} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: 'Warning', fill: '#fbbf24', fontSize: 11 }} />
                  <ReferenceLine y={thresholds.cpuCritical} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Critical', fill: '#f43f5e', fontSize: 11 }} />
                  <Area type="monotone" dataKey="cpuUsage" name="CPU Usage %" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#cpuFullGrad)" />
                </AreaChart>
              ) : chartType === 'ram' ? (
                <AreaChart data={metrics} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ramFullGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '13px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <ReferenceLine y={thresholds.ramWarning} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: 'Warning', fill: '#fbbf24', fontSize: 11 }} />
                  <ReferenceLine y={thresholds.ramCritical} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Critical', fill: '#f43f5e', fontSize: 11 }} />
                  <Area type="monotone" dataKey="ramUsagePercent" name="RAM Usage %" stroke="#a855f7" strokeWidth={2.5} fillOpacity={1} fill="url(#ramFullGrad)" />
                </AreaChart>
              ) : chartType === 'network' ? (
                <LineChart data={metrics} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '13px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                  <Line type="monotone" dataKey="networkInMbps" name="Lưu lượng Inbound Rx (Mbps)" stroke="#10b981" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="networkOutMbps" name="Lưu lượng Outbound Tx (Mbps)" stroke="#06b6d4" strokeWidth={2.5} dot={false} />
                </LineChart>
              ) : chartType === 'disk' ? (
                <BarChart data={metrics} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '13px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="diskIops" name="Đọc / Ghi Disk IOPS" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : chartType === 'cores' ? (
                <LineChart 
                  data={metrics.map(m => ({
                    timeLabel: m.timeLabel,
                    core0: m.cpuCores[0] || m.cpuUsage,
                    core1: m.cpuCores[1] || m.cpuUsage,
                    core2: m.cpuCores[2] || m.cpuUsage,
                    core3: m.cpuCores[3] || m.cpuUsage,
                  }))} 
                  margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '13px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                  <Line type="monotone" dataKey="core0" name="Core 0 (vCPU 1)" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="core1" name="Core 1 (vCPU 2)" stroke="#818cf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="core2" name="Core 2 (vCPU 3)" stroke="#c084fc" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="core3" name="Core 3 (vCPU 4)" stroke="#f472b6" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <AreaChart data={metrics} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="latencyFullGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '13px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                  <Area type="monotone" dataKey="latencyMs" name="P95 Latency (ms)" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#latencyFullGrad)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom Split: Diagnostic Recommendation & Recent Sampled Points Table */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pb-4">
          {/* DevOps Diagnostic Panel */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-cyan-400 uppercase font-mono flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              <span>Khuyến Nghị Tối Ưu Hệ Thống</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {stats?.recommendation}
            </p>
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Độ tin cậy cảm biến:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 100% Khả dụng
              </span>
            </div>
          </div>

          {/* Detailed Data Table of Recent Samples */}
          <div className="lg:col-span-2 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-white uppercase font-mono flex items-center gap-1.5">
                <Table className="w-4 h-4 text-cyan-400" />
                <span>Bảng Số Liệu Mới Nhất ({recentPoints.length} Mẫu Gần Đây)</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">Đồng bộ tự động</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                    <th className="py-1.5 px-2">Thời gian</th>
                    <th className="py-1.5 px-2">CPU (%)</th>
                    <th className="py-1.5 px-2">RAM (%)</th>
                    <th className="py-1.5 px-2">Mạng (Rx/Tx)</th>
                    <th className="py-1.5 px-2">Disk IOPS</th>
                    <th className="py-1.5 px-2">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentPoints.map((pt, idx) => (
                    <tr key={idx} className={idx === 0 ? 'bg-cyan-950/20 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800/40'}>
                      <td className="py-1.5 px-2 flex items-center gap-1.5">
                        {idx === 0 && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>}
                        <span>{pt.timeLabel}</span>
                      </td>
                      <td className={`py-1.5 px-2 ${pt.cpuUsage >= thresholds.cpuWarning ? 'text-amber-400 font-bold' : ''}`}>
                        {pt.cpuUsage.toFixed(1)}%
                      </td>
                      <td className={`py-1.5 px-2 ${pt.ramUsagePercent >= thresholds.ramWarning ? 'text-purple-400 font-bold' : ''}`}>
                        {pt.ramUsagePercent}% ({pt.ramUsedGb} GB)
                      </td>
                      <td className="py-1.5 px-2 text-emerald-400">
                        {pt.networkInMbps.toFixed(0)} / {pt.networkOutMbps.toFixed(0)} M
                      </td>
                      <td className="py-1.5 px-2 text-amber-300">
                        {pt.diskIops}
                      </td>
                      <td className="py-1.5 px-2 text-indigo-300">
                        {pt.latencyMs} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
