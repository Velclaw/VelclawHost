import React, { useState, useMemo } from 'react';
import { 
  Wifi, 
  Flame, 
  Clock, 
  TrendingUp, 
  Calendar, 
  Filter, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  ArrowDownLeft,
  ArrowUpRight,
  Zap,
  Activity
} from 'lucide-react';
import { MetricSnapshot } from '../types';

interface NetworkTrafficHeatmapProps {
  currentMetric?: MetricSnapshot;
}

export type MetricMode = 'total' | 'inbound' | 'outbound' | 'requests';
export type DayFilter = 'all' | 'weekdays' | 'weekend';

interface HeatmapCell {
  dayIndex: number; // 0 = Mon, 6 = Sun
  dayName: string;
  dayShort: string;
  hour: number;
  hourLabel: string;
  inboundMbps: number;
  outboundMbps: number;
  totalMbps: number;
  requestsPerSec: number;
  activeSockets: number;
  isPeak: boolean;
  isOffPeak: boolean;
  isCurrent: boolean;
}

const DAYS = [
  { index: 0, name: 'Thứ Hai', short: 'T2', type: 'weekday' },
  { index: 1, name: 'Thứ Ba', short: 'T3', type: 'weekday' },
  { index: 2, name: 'Thứ Tư', short: 'T4', type: 'weekday' },
  { index: 3, name: 'Thứ Năm', short: 'T5', type: 'weekday' },
  { index: 4, name: 'Thứ Sáu', short: 'T6', type: 'weekday' },
  { index: 5, name: 'Thứ Bảy', short: 'T7', type: 'weekend' },
  { index: 6, name: 'Chủ Nhật', short: 'CN', type: 'weekend' },
];

export const NetworkTrafficHeatmap: React.FC<NetworkTrafficHeatmapProps> = ({ currentMetric }) => {
  const [metricMode, setMetricMode] = useState<MetricMode>('total');
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  const [highlightPeaksOnly, setHighlightPeaksOnly] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);

  // Determine current day and hour (0 = Mon, ..., 6 = Sun)
  const now = new Date();
  const currentDayIndex = (now.getDay() + 6) % 7; // Convert JS Sunday=0 to Mon=0...Sun=6
  const currentHour = now.getHours();

  // Generate 7 days x 24 hours grid data with realistic server patterns
  const heatmapData = useMemo(() => {
    const data: HeatmapCell[] = [];

    // Base hourly traffic curve multiplier (0 to 1)
    const hourlyCurve = [
      0.18, 0.14, 0.11, 0.10, 0.12, 0.19, // 00h - 05h (Off-peak maintenance window)
      0.32, 0.52, 0.72, 0.78, 0.81, 0.75, // 06h - 11h (Morning business peak)
      0.65, 0.71, 0.80, 0.84, 0.82, 0.79, // 12h - 17h (Afternoon sustained load)
      0.88, 0.96, 0.99, 0.94, 0.82, 0.45  // 18h - 23h (Evening Grand Peak ~20:00-22:00)
    ];

    // Day weight factors (Friday/Saturday night surges, Sunday late evening surge)
    const dayMultipliers = [
      0.92, // T2
      0.95, // T3
      0.98, // T4
      1.02, // T5
      1.14, // T6: High traffic & night spike
      1.18, // T7: High weekend traffic & peak streaming
      1.05, // CN: High evening traffic
    ];

    DAYS.forEach((day) => {
      for (let h = 0; h < 24; h++) {
        const isCurrentCell = day.index === currentDayIndex && h === currentHour;

        // Base traffic formula with pseudorandom variance based on seed
        const pseudoRand = Math.sin(day.index * 13 + h * 7) * 0.08;
        const curve = hourlyCurve[h];
        const dayWeight = dayMultipliers[day.index];

        // Normal base throughput: min 95 Mbps to max 980 Mbps
        let total = Math.round((95 + curve * 780 * dayWeight) * (1 + pseudoRand));

        // Friday/Saturday evening extra boost
        if ((day.index === 4 || day.index === 5) && h >= 19 && h <= 22) {
          total = Math.round(total * 1.12);
        }

        // Bound to realistic bounds
        total = Math.max(90, Math.min(995, total));

        let inbound = Math.round(total * 0.42);
        let outbound = Math.round(total * 0.58);

        // If this is the current active cell and we have live metric data, blend it!
        if (isCurrentCell && currentMetric) {
          const liveTotal = Math.round(currentMetric.networkInMbps + currentMetric.networkOutMbps);
          if (liveTotal > 0) {
            total = liveTotal;
            inbound = Math.round(currentMetric.networkInMbps);
            outbound = Math.round(currentMetric.networkOutMbps);
          }
        }

        const requestsPerSec = Math.round(total * 8.4 + (h * 45));
        const activeSockets = Math.round(total * 3.2 + 250);
        const isPeak = total >= 720;
        const isOffPeak = total <= 220;

        data.push({
          dayIndex: day.index,
          dayName: day.name,
          dayShort: day.short,
          hour: h,
          hourLabel: `${h.toString().padStart(2, '0')}:00`,
          inboundMbps: inbound,
          outboundMbps: outbound,
          totalMbps: total,
          requestsPerSec,
          activeSockets,
          isPeak,
          isOffPeak,
          isCurrent: isCurrentCell,
        });
      }
    });

    return data;
  }, [currentMetric, currentDayIndex, currentHour]);

  // Filtered days
  const filteredDays = useMemo(() => {
    if (dayFilter === 'weekdays') return DAYS.filter(d => d.type === 'weekday');
    if (dayFilter === 'weekend') return DAYS.filter(d => d.type === 'weekend');
    return DAYS;
  }, [dayFilter]);

  // Aggregate statistics across cells
  const stats = useMemo(() => {
    if (!heatmapData.length) return null;

    const values = heatmapData.map(d => d.totalMbps);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const avgVal = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

    // Peak cells (sorted descending)
    const peakCells = [...heatmapData].sort((a, b) => b.totalMbps - a.totalMbps);
    const topPeak = peakCells[0];

    // Find consecutive peak hours (e.g. 19:00 - 22:00)
    const peakCount = heatmapData.filter(d => d.isPeak).length;
    const peakPercentage = ((peakCount / heatmapData.length) * 100).toFixed(1);

    // Maintenance window: lowest 4 consecutive hours across the week
    const maintenanceWindow = "02:00 - 05:00";

    // Estimated weekly data transfer (GB / TB)
    const avgBytesPerSec = (avgVal * 1000 * 1000) / 8;
    const weeklyBytes = avgBytesPerSec * 7 * 24 * 3600;
    const weeklyTb = (weeklyBytes / (1024 * 1024 * 1024 * 1024)).toFixed(1);

    return {
      maxVal,
      minVal,
      avgVal,
      topPeak,
      peakCount,
      peakPercentage,
      maintenanceWindow,
      weeklyTb,
    };
  }, [heatmapData]);

  // Hourly averages (across the 7 days)
  const hourlyAverages = useMemo(() => {
    const avgs: { hour: number; avgTotal: number; isPeak: boolean }[] = [];
    for (let h = 0; h < 24; h++) {
      const cellsForHour = heatmapData.filter(d => d.hour === h);
      const avg = Math.round(cellsForHour.reduce((sum, c) => sum + c.totalMbps, 0) / cellsForHour.length);
      avgs.push({
        hour: h,
        avgTotal: avg,
        isPeak: avg >= 700,
      });
    }
    return avgs;
  }, [heatmapData]);

  // Daily averages
  const dailyAverages = useMemo(() => {
    const avgs: Record<number, number> = {};
    DAYS.forEach(day => {
      const cells = heatmapData.filter(c => c.dayIndex === day.index);
      const avg = Math.round(cells.reduce((sum, c) => sum + c.totalMbps, 0) / cells.length);
      avgs[day.index] = avg;
    });
    return avgs;
  }, [heatmapData]);

  // Color mapper based on throughput (Continuous DevOps Color scale)
  const getCellVisual = (cell: HeatmapCell) => {
    let val = cell.totalMbps;
    if (metricMode === 'inbound') val = cell.inboundMbps;
    if (metricMode === 'outbound') val = cell.outboundMbps;
    if (metricMode === 'requests') val = cell.requestsPerSec;

    // Levels:
    // Level 0: < 200 Mbps (Dark Slate Teal - Low/Off-Peak)
    // Level 1: 200 - 450 Mbps (Cyan/Blue - Normal Operational)
    // Level 2: 450 - 700 Mbps (Indigo/Violet - Moderate High)
    // Level 3: 700 - 850 Mbps (Amber/Orange - High Peak)
    // Level 4: >= 850 Mbps (Rose/Crimson - Critical Grand Peak)

    if (val < 200) {
      return {
        bg: 'bg-slate-800/70 hover:bg-slate-700/80 text-slate-400 border-slate-700/40',
        ring: 'ring-cyan-500/20',
        colorClass: 'text-slate-400',
        badge: 'bg-slate-800 text-slate-300',
        label: 'Thấp điểm (Off-peak)',
      };
    }
    if (val < 450) {
      return {
        bg: 'bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border-cyan-800/40',
        ring: 'ring-cyan-500/30',
        colorClass: 'text-cyan-400',
        badge: 'bg-cyan-950 text-cyan-300',
        label: 'Bình thường',
      };
    }
    if (val < 700) {
      return {
        bg: 'bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 border-indigo-700/50',
        ring: 'ring-indigo-500/40',
        colorClass: 'text-indigo-400',
        badge: 'bg-indigo-950 text-indigo-300',
        label: 'Tải tăng dần',
      };
    }
    if (val < 850) {
      return {
        bg: 'bg-amber-950/80 hover:bg-amber-900/90 text-amber-200 border-amber-600/50',
        ring: 'ring-amber-500/50',
        colorClass: 'text-amber-400',
        badge: 'bg-amber-950 text-amber-300',
        label: 'Cao điểm (Peak)',
      };
    }
    return {
      bg: 'bg-rose-950/90 hover:bg-rose-900 text-rose-100 border-rose-500/60 shadow-md shadow-rose-950/40',
      ring: 'ring-rose-500/60',
      colorClass: 'text-rose-400',
      badge: 'bg-rose-950 text-rose-300',
      label: 'Đỉnh tải cực đại (Extreme Peak)',
    };
  };

  const activeFocusCell = selectedCell || hoveredCell;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-5">
      {/* Component Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Wifi className="w-4 h-4" />
            <span>Bản Đồ Nhiệt Lưu Lượng Mạng (Network Traffic Heatmap)</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
            <span>Phát Hiện Khung Giờ Cao Điểm &amp; Phân Bổ Băng Thông</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-sans font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>7x24 Matrix</span>
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Theo dõi cường độ lưu lượng inbound/outbound qua 168 giờ trong tuần để tối ưu CDN caching, lập lịch sao lưu và chống nghẽn mạng.
          </p>
        </div>

        {/* View mode & highlight toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric mode toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <button
              id="heatmap-metric-total"
              onClick={() => setMetricMode('total')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                metricMode === 'total'
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tổng (Rx+Tx)
            </button>
            <button
              id="heatmap-metric-inbound"
              onClick={() => setMetricMode('inbound')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                metricMode === 'inbound'
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tải vào (Rx)
            </button>
            <button
              id="heatmap-metric-outbound"
              onClick={() => setMetricMode('outbound')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                metricMode === 'outbound'
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tải ra (Tx)
            </button>
            <button
              id="heatmap-metric-requests"
              onClick={() => setMetricMode('requests')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                metricMode === 'requests'
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Req/s
            </button>
          </div>

          {/* Highlight peak switch */}
          <button
            id="heatmap-toggle-peaks"
            onClick={() => setHighlightPeaksOnly(!highlightPeaksOnly)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              highlightPeaksOnly
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-sm shadow-rose-900/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Đánh dấu các khung giờ vượt ngưỡng 700 Mbps"
          >
            <Flame className={`w-3.5 h-3.5 ${highlightPeaksOnly ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
            <span>Glow Cao Điểm</span>
          </button>
        </div>
      </div>

      {/* Analytical KPI Cards for Peak Hours & Maintenance */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Top Peak Window */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 relative overflow-hidden group hover:border-rose-500/40 transition-colors">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>Khung Giờ Đỉnh Tải</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                Peak Alert
              </span>
            </div>
            <div className="text-base sm:text-lg font-bold text-white font-mono flex items-baseline gap-1.5">
              <span>{stats.topPeak.hourLabel}</span>
              <span className="text-xs text-slate-400 font-normal">({stats.topPeak.dayName})</span>
            </div>
            <div className="text-xs text-rose-400 font-mono mt-1 font-semibold flex items-center gap-1">
              <span>{stats.topPeak.totalMbps} Mbps</span>
              <span className="text-slate-500 font-normal">• {stats.topPeak.requestsPerSec.toLocaleString()} req/s</span>
            </div>
          </div>

          {/* Maintenance Window */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cửa Sổ Bảo Trì Lý Tưởng</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                Off-Peak
              </span>
            </div>
            <div className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
              {stats.maintenanceWindow}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span>Lưu lượng thấp nhất ~{stats.minVal} Mbps</span>
            </div>
          </div>

          {/* Average Throughput */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 relative overflow-hidden group hover:border-cyan-500/40 transition-colors">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Băng Thông Trung Bình</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                Avg 7D
              </span>
            </div>
            <div className="text-base sm:text-lg font-bold text-white font-mono flex items-baseline gap-1">
              <span>{stats.avgVal}</span>
              <span className="text-xs text-slate-400 font-normal">Mbps</span>
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span>Tỷ lệ giờ cao điểm: <b className="text-amber-400">{stats.peakPercentage}%</b></span>
            </div>
          </div>

          {/* Weekly Transfer */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 relative overflow-hidden group hover:border-indigo-500/40 transition-colors">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                <span>Tổng Lưu Lượng Tuần</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                Egress+Ingress
              </span>
            </div>
            <div className="text-base sm:text-lg font-bold text-indigo-300 font-mono flex items-baseline gap-1">
              <span>{stats.weeklyTb}</span>
              <span className="text-xs text-slate-400 font-normal">TB / tuần</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span>Khoảng ~{Math.round(parseFloat(stats.weeklyTb) * 1024 / 7)} GB / ngày</span>
            </div>
          </div>
        </div>
      )}

      {/* Day Filter Chips & Instructions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-y border-slate-800/80 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Lọc ngày:</span>
          {(['all', 'weekdays', 'weekend'] as const).map(f => (
            <button
              key={f}
              id={`day-filter-${f}`}
              onClick={() => setDayFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                dayFilter === f
                  ? 'bg-slate-800 text-cyan-300 border border-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'Tất cả 7 ngày' : f === 'weekdays' ? 'Ngày trong tuần (T2-T6)' : 'Cuối tuần (T7-CN)'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span>Giờ hiện tại ({currentHour.toString().padStart(2, '0')}:00)</span>
          </div>
          <span className="text-slate-600">|</span>
          <span>Di chuột / Chạm vào ô để xem chi tiết</span>
        </div>
      </div>

      {/* Heatmap Matrix Canvas */}
      <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="min-w-[760px] space-y-1.5">
          {/* Header Row: 24 Hours */}
          <div className="grid grid-cols-[64px_repeat(24,1fr)_72px] gap-1 items-center text-center text-[10px] font-mono text-slate-400 font-semibold mb-2">
            <div className="text-left pl-1">Ngày</div>
            {Array.from({ length: 24 }).map((_, h) => (
              <div 
                key={h} 
                className={`py-0.5 ${h === currentHour ? 'text-cyan-300 font-bold bg-cyan-950/60 rounded' : ''}`}
                title={`Khung giờ ${h.toString().padStart(2, '0')}:00`}
              >
                {h % 2 === 0 ? `${h}h` : ''}
              </div>
            ))}
            <div className="text-right pr-1">T.Bình</div>
          </div>

          {/* Days Rows */}
          {filteredDays.map((day) => {
            const isToday = day.index === currentDayIndex;
            const dayCells = heatmapData.filter(c => c.dayIndex === day.index);
            const dayAvg = dailyAverages[day.index] || 0;

            return (
              <div 
                key={day.index} 
                className={`grid grid-cols-[64px_repeat(24,1fr)_72px] gap-1 items-center p-1 rounded-xl transition-colors ${
                  isToday ? 'bg-cyan-950/20 border border-cyan-500/20' : 'hover:bg-slate-950/40'
                }`}
              >
                {/* Day Label */}
                <div className="flex items-center gap-1 text-xs font-mono font-bold">
                  <span className={isToday ? 'text-cyan-400' : 'text-slate-300'}>
                    {day.short}
                  </span>
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" title="Hôm nay" />
                  )}
                </div>

                {/* 24 Hourly Cells */}
                {dayCells.map((cell) => {
                  const visual = getCellVisual(cell);
                  const isHovered = hoveredCell?.dayIndex === cell.dayIndex && hoveredCell?.hour === cell.hour;
                  const isSelected = selectedCell?.dayIndex === cell.dayIndex && selectedCell?.hour === cell.hour;
                  const showPeakGlow = highlightPeaksOnly && cell.isPeak;

                  return (
                    <button
                      key={cell.hour}
                      onClick={() => setSelectedCell(isSelected ? null : cell)}
                      onMouseEnter={() => setHoveredCell(cell)}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={`h-7 sm:h-8 rounded-lg border transition-all relative flex items-center justify-center text-[10px] font-mono font-bold focus:outline-none ${
                        visual.bg
                      } ${
                        cell.isCurrent ? 'ring-2 ring-cyan-400 shadow-md shadow-cyan-500/30 z-10' : ''
                      } ${
                        isSelected ? 'ring-2 ring-white scale-110 z-20' : ''
                      } ${
                        isHovered ? 'scale-105 z-10' : ''
                      } ${
                        showPeakGlow ? 'shadow-sm shadow-rose-600/30' : ''
                      }`}
                      title={`${cell.dayName} ${cell.hourLabel} - ${cell.totalMbps} Mbps`}
                    >
                      {/* Show flame indicator for extreme peaks */}
                      {cell.totalMbps >= 850 && (
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                      )}

                      {/* Cell text or indicator */}
                      <span className="truncate px-0.5 text-[9px] sm:text-[10px]">
                        {metricMode === 'total' && Math.round(cell.totalMbps)}
                        {metricMode === 'inbound' && Math.round(cell.inboundMbps)}
                        {metricMode === 'outbound' && Math.round(cell.outboundMbps)}
                        {metricMode === 'requests' && `${(cell.requestsPerSec / 1000).toFixed(1)}k`}
                      </span>
                    </button>
                  );
                })}

                {/* Day Average Summary Column */}
                <div className="text-right pr-1 font-mono text-xs font-bold text-slate-300">
                  <span className={dayAvg >= 650 ? 'text-amber-400' : 'text-slate-300'}>
                    {dayAvg}
                  </span>
                  <span className="text-[9px] text-slate-500 font-normal ml-0.5">M</span>
                </div>
              </div>
            );
          })}

          {/* Bottom Row: Hourly Averages Curve */}
          <div className="grid grid-cols-[64px_repeat(24,1fr)_72px] gap-1 items-center pt-2 mt-2 border-t border-slate-800 text-center text-[10px] font-mono">
            <div className="text-left pl-1 text-slate-400 font-bold">
              T.Bình
            </div>
            {hourlyAverages.map((hAvg) => {
              const isPeakHour = hAvg.avgTotal >= 700;
              return (
                <div
                  key={hAvg.hour}
                  className={`py-1 rounded text-[9px] font-bold ${
                    isPeakHour 
                      ? 'bg-rose-950/60 text-rose-300 border border-rose-500/30' 
                      : hAvg.avgTotal <= 220
                      ? 'bg-slate-800/40 text-slate-400'
                      : 'bg-cyan-950/40 text-cyan-300'
                  }`}
                  title={`Trung bình khung giờ ${hAvg.hour}:00 là ${hAvg.avgTotal} Mbps`}
                >
                  {Math.round(hAvg.avgTotal)}
                </div>
              );
            })}
            <div className="text-right pr-1 text-cyan-400 font-bold">
              {stats?.avgVal}M
            </div>
          </div>
        </div>
      </div>

      {/* Color Scale Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs border-t border-slate-800/80">
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">Thang đo băng thông:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700"></span>
              <span>&lt; 200 Mbps (Thấp)</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-cyan-950 border border-cyan-800"></span>
              <span>200 - 450 Mbps</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-indigo-950 border border-indigo-700"></span>
              <span>450 - 700 Mbps</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-950 border border-amber-600"></span>
              <span>700 - 850 Mbps (Cao)</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-rose-950 border border-rose-500"></span>
              <span>&gt; 850 Mbps (Đỉnh Cao Điểm)</span>
            </span>
          </div>
        </div>

        {selectedCell && (
          <button
            onClick={() => setSelectedCell(null)}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono"
          >
            Bỏ chọn ô ghim
          </button>
        )}
      </div>

      {/* Interactive Selected / Hovered Detail Panel */}
      {activeFocusCell && (
        <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/40 shadow-xl animate-fade-in flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>{activeFocusCell.dayName} • Khung giờ {activeFocusCell.hourLabel}</span>
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                activeFocusCell.isPeak 
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                  : activeFocusCell.isOffPeak 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              }`}>
                {activeFocusCell.isPeak ? 'Giờ Cao Điểm (Peak Hour)' : activeFocusCell.isOffPeak ? 'Thấp Điểm (Off-Peak)' : 'Lưu Lượng Tiêu Chuẩn'}
              </span>
              {activeFocusCell.isCurrent && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/40">
                  Thời Gian Thực
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400">
              {activeFocusCell.isPeak 
                ? 'Lưu lượng trong khung giờ này tiệm cận giới hạn phân phối; khuyến nghị kích hoạt Edge Caching và cân bằng tải CDN.'
                : activeFocusCell.isOffPeak 
                ? 'Lưu lượng ở mức tối thiểu; khoảng thời gian hoàn hảo để sao lưu cơ sở dữ liệu lớn, reboot cập nhật kernel hoặc chạy batch job.'
                : 'Mức tải mạng ổn định, băng thông phân phối đều đặn cho các vi dịch vụ.'}
            </p>
          </div>

          {/* Quick Metrics of this hour */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto flex-shrink-0">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center min-w-[100px]">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Tổng Băng Thông</div>
              <div className="text-sm font-bold text-white font-mono">{activeFocusCell.totalMbps} Mbps</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center min-w-[100px]">
              <div className="text-[10px] text-slate-400 uppercase font-mono flex items-center justify-center gap-0.5">
                <ArrowDownLeft className="w-3 h-3 text-cyan-400" />
                <span>Inbound (Rx)</span>
              </div>
              <div className="text-sm font-bold text-cyan-400 font-mono">{activeFocusCell.inboundMbps} Mbps</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center min-w-[100px]">
              <div className="text-[10px] text-slate-400 uppercase font-mono flex items-center justify-center gap-0.5">
                <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                <span>Outbound (Tx)</span>
              </div>
              <div className="text-sm font-bold text-emerald-400 font-mono">{activeFocusCell.outboundMbps} Mbps</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center min-w-[100px]">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Tần Suất Req</div>
              <div className="text-sm font-bold text-indigo-300 font-mono">{activeFocusCell.requestsPerSec.toLocaleString()} /s</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
