import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  Cpu, 
  Layers, 
  AlertTriangle, 
  RotateCw, 
  TrendingUp, 
  CheckCircle2, 
  Filter, 
  ChevronRight, 
  Zap, 
  ShieldAlert, 
  Activity, 
  Calendar,
  Sparkles,
  Info,
  ArrowRight
} from 'lucide-react';
import { MetricSnapshot, AlertThresholds } from '../types';

export interface PeakEvent {
  id: string;
  type: 'CPU' | 'RAM' | 'COMBINED';
  title: string;
  severity: 'critical' | 'warning';
  startHour: number; // 0 to 23
  startMinute: number;
  durationMinutes: number;
  timeRangeLabel: string;
  hoursAgo: number; // e.g. 2.5
  cpuPeak: number;
  ramPeak: number;
  isRecurring: boolean;
  recurrenceText: string;
  rootCause: string;
  impactService: string;
  recommendation: string;
}

interface PeakUtilizationTimelineProps {
  thresholds?: AlertThresholds;
  currentMetric?: MetricSnapshot;
  onSelectEvent?: (event: PeakEvent) => void;
}

export const PeakUtilizationTimeline: React.FC<PeakUtilizationTimelineProps> = ({
  thresholds,
  currentMetric,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'cpu' | 'ram' | 'recurring'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>('peak-evening-surge');
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // Reference current time
  const now = new Date();
  const currentHour = now.getHours();

  // 24-hour peak incidents with realistic recurring DevOps patterns
  const peakEvents: PeakEvent[] = useMemo(() => [
    {
      id: 'peak-db-backup',
      type: 'COMBINED',
      title: 'Sao Lưu Tự Động & Hút Chân Không PostgreSQL',
      severity: 'warning',
      startHour: 2,
      startMinute: 15,
      durationMinutes: 35,
      timeRangeLabel: '02:15 - 02:50',
      hoursAgo: 13,
      cpuPeak: 86.4,
      ramPeak: 83.2,
      isRecurring: true,
      recurrenceText: 'Lặp lại hàng ngày (Daily Cron lúc 02:15)',
      rootCause: 'pg_dump kết hợp VACUUM FULL và re-indexing trên cụm cơ sở dữ liệu chính',
      impactService: 'PostgreSQL Primary Cluster (Port 5432)',
      recommendation: 'Kích hoạt cờ --jobs đa luồng và chuyển ngưỡng autovacuum sang chế độ ANALYZE tuần tự để giảm tải đỉnh'
    },
    {
      id: 'peak-cache-warming',
      type: 'RAM',
      title: 'Tái Cấu Trúc Bộ Nhớ Đệm & Đồng Bộ Elasticsearch',
      severity: 'warning',
      startHour: 5,
      startMinute: 45,
      durationMinutes: 25,
      timeRangeLabel: '05:45 - 06:10',
      hoursAgo: 9.5,
      cpuPeak: 68.2,
      ramPeak: 87.5,
      isRecurring: true,
      recurrenceText: 'Lặp lại hàng ngày trước giờ làm việc (05:45 AM)',
      rootCause: 'Redis snapshotting BGSAVE kết hợp tải danh mục sản phẩm vào bộ nhớ đệm phục vụ buổi sáng',
      impactService: 'Redis Sentinel & Elasticsearch Ingestion',
      recommendation: 'Phân tách node cache read-only và cấu hình maxmemory-policy volatile-lru chặt chẽ hơn'
    },
    {
      id: 'peak-log-rotation',
      type: 'CPU',
      title: 'Nén & Luân Chuyển Tệp Nhật Ký Hệ Thống',
      severity: 'warning',
      startHour: 8,
      startMinute: 10,
      durationMinutes: 20,
      timeRangeLabel: '08:10 - 08:30',
      hoursAgo: 7,
      cpuPeak: 84.1,
      ramPeak: 64.0,
      isRecurring: true,
      recurrenceText: 'Lặp lại hàng ngày lúc giao ca (08:00 AM)',
      rootCause: 'Logrotate thực thi gzip compression trên hơn 12 GB file log Nginx và Container stdout',
      impactService: 'Systemd Journald & Nginx Log Collector',
      recommendation: 'Sử dụng pigz (parallel gzip) hoặc chuyển sang nén Zstandard (zstd) với mức tiêu thụ CPU thấp hơn 40%'
    },
    {
      id: 'peak-lunch-surge',
      type: 'COMBINED',
      title: 'Đỉnh Tải Truy Cập Buổi Trưa (Midday Burst)',
      severity: 'critical',
      startHour: 11,
      startMinute: 40,
      durationMinutes: 50,
      timeRangeLabel: '11:40 - 12:30',
      hoursAgo: 3.5,
      cpuPeak: 93.8,
      ramPeak: 89.2,
      isRecurring: true,
      recurrenceText: 'Lặp lại vào ngày làm việc (11:30 - 13:00)',
      rootCause: 'Đột biến lượt request từ người dùng đặt đơn hàng và tra cứu giao dịch',
      impactService: 'Nginx Reverse Proxy & Node.js API Workers',
      recommendation: 'Bật tự động mở rộng Pod HPA (Horizontal Pod Autoscaler) khi tải vượt quá 75% trong 3 phút'
    },
    {
      id: 'peak-rogue-query',
      type: 'CPU',
      title: 'Đột Biến CPU Do Truy Vấn Thiếu Chỉ Mục (Slow Query)',
      severity: 'critical',
      startHour: 14,
      startMinute: 15,
      durationMinutes: 22,
      timeRangeLabel: '14:15 - 14:37',
      hoursAgo: 1,
      cpuPeak: 91.5,
      ramPeak: 72.8,
      isRecurring: false,
      recurrenceText: 'Sự cố đơn lẻ (Không có tính chu kỳ)',
      rootCause: 'Báo cáo tài chính chạy Full Table Scan trên bảng orders (hơn 4.2 triệu bản ghi)',
      impactService: 'Analytics Reporting Worker (Job #8419)',
      recommendation: 'Thêm composite index (tenant_id, created_at, status) đã được ghi nhận trong tab Tối Ưu Hóa CSDL'
    },
    {
      id: 'peak-evening-surge',
      type: 'COMBINED',
      title: 'Đỉnh Cao Điểm Tối (Prime-Time Peak)',
      severity: 'critical',
      startHour: 20,
      startMinute: 0,
      durationMinutes: 65,
      timeRangeLabel: '20:00 - 21:05',
      hoursAgo: 19,
      cpuPeak: 96.2,
      ramPeak: 92.4,
      isRecurring: true,
      recurrenceText: 'Lặp lại hàng tối (20:00 - 22:00)',
      rootCause: 'Lượng truy cập đồng thời đạt 14,200 active sockets; tải streaming và thanh toán trực tuyến',
      impactService: 'Gateway Edge API & Session Store',
      recommendation: 'Kích hoạt Edge CDN Static Caching cho 85% asset tĩnh và tối ưu Connection Pool Keep-Alive'
    },
    {
      id: 'peak-batch-sync',
      type: 'RAM',
      title: 'Đồng Bộ Hóa Dữ Liệu Kho Hàng Đối Tác (Batch Sync)',
      severity: 'warning',
      startHour: 23,
      startMinute: 20,
      durationMinutes: 30,
      timeRangeLabel: '23:20 - 23:50',
      hoursAgo: 15.5,
      cpuPeak: 74.5,
      ramPeak: 86.8,
      isRecurring: true,
      recurrenceText: 'Lặp lại hàng đêm lúc 23:20',
      rootCause: 'Quá trình parse file JSON kích thước lớn (>850MB) bằng streaming parser chưa giải phóng buffer kịp thời',
      impactService: 'Data Integration Service',
      recommendation: 'Tăng tần suất garbage collection thủ công trong worker process hoặc chuyển sang streaming chunking 64KB'
    }
  ], []);

  // Filtered peak events
  const filteredEvents = useMemo(() => {
    return peakEvents.filter(ev => {
      if (filterType === 'cpu') return ev.type === 'CPU' || ev.type === 'COMBINED';
      if (filterType === 'ram') return ev.type === 'RAM' || ev.type === 'COMBINED';
      if (filterType === 'recurring') return ev.isRecurring;
      return true;
    });
  }, [peakEvents, filterType]);

  // Selected event object
  const activeEvent = useMemo(() => {
    return peakEvents.find(e => e.id === (hoveredEventId || selectedEventId)) || peakEvents[0];
  }, [peakEvents, hoveredEventId, selectedEventId]);

  // Generate 24 hourly marks from (currentHour - 23) up to currentHour
  const timelineHours = useMemo(() => {
    const hours: { hour24: number; label: string; hoursAgo: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const h = (currentHour - i + 24) % 24;
      hours.push({
        hour24: h,
        label: `${h.toString().padStart(2, '0')}:00`,
        hoursAgo: i,
      });
    }
    return hours;
  }, [currentHour]);

  // Summary statistics
  const recurringCount = peakEvents.filter(e => e.isRecurring).length;
  const criticalCount = peakEvents.filter(e => e.severity === 'critical').length;
  const maxCpuEver = Math.max(...peakEvents.map(e => e.cpuPeak));
  const maxRamEver = Math.max(...peakEvents.map(e => e.ramPeak));

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
      {/* Component Title & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Clock className="w-4 h-4" />
            <span>Trục Thời Gian 24 Giờ (24h Peak Utilization Timeline)</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
            <span>Nhận Diện Đỉnh Tải CPU / RAM &amp; Phát Hiện Sự Cố Định Kỳ</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-sans font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              <RotateCw className="w-3 h-3 text-purple-400" />
              <span>{recurringCount} Chu Kỳ Lặp</span>
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Phân tích các đợt tăng vọt tài nguyên trong 24 giờ qua nhằm cô lập nguyên nhân giữa tác vụ định kỳ (Cron/Backup) và các đột biến bất thường.
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <button
              id="peak-filter-all"
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterType === 'all'
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tất Cả ({peakEvents.length})
            </button>
            <button
              id="peak-filter-cpu"
              onClick={() => setFilterType('cpu')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                filterType === 'cpu'
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3 h-3 text-cyan-300" />
              <span>Đỉnh CPU</span>
            </button>
            <button
              id="peak-filter-ram"
              onClick={() => setFilterType('ram')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                filterType === 'ram'
                  ? 'bg-purple-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3 text-purple-300" />
              <span>Đỉnh RAM</span>
            </button>
            <button
              id="peak-filter-recurring"
              onClick={() => setFilterType('recurring')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                filterType === 'recurring'
                  ? 'bg-amber-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <RotateCw className="w-3 h-3 text-amber-300" />
              <span>Định Kỳ ({recurringCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Highlight Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Tổng số đợt tăng vọt (24h)</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white font-mono mt-1">
            {peakEvents.length} sự cố <span className="text-xs text-rose-400 font-normal">({criticalCount} nghiêm trọng)</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Sự cố có tính chu kỳ (Recurring)</span>
            <RotateCw className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-purple-300 font-mono mt-1">
            {recurringCount} / {peakEvents.length} <span className="text-xs text-slate-400 font-normal">({Math.round((recurringCount / peakEvents.length) * 100)}%)</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Đỉnh CPU cao nhất 24h</span>
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-bold text-rose-400 font-mono mt-1">
            {maxCpuEver}% <span className="text-xs text-slate-400 font-normal">(20:00)</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Đỉnh RAM cao nhất 24h</span>
            <Layers className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-purple-300 font-mono mt-1">
            {maxRamEver}% <span className="text-xs text-slate-400 font-normal">(20:30)</span>
          </div>
        </div>
      </div>

      {/* Horizontal Interactive 24-Hour Timeline Track */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-600"></span>
            <span>-24 Giờ Trước</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500"></span>
              <span className="text-[11px]">Đỉnh CPU</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-500"></span>
              <span className="text-[11px]">Đỉnh RAM</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
              <span className="text-[11px]">Cả Hai Đỉnh (Combined)</span>
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <RotateCw className="w-3 h-3" />
              <span className="text-[11px]">Có tính chu kỳ</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-cyan-400 font-bold">
            <span>Hiện Tại (Now)</span>
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          </div>
        </div>

        {/* The Scrollable Track Wrapper */}
        <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="min-w-[820px] relative pt-6 pb-4 px-2">
            {/* Hour ticks line */}
            <div className="h-1.5 w-full bg-slate-800 rounded-full relative">
              {/* Hour Grid Markers */}
              {timelineHours.map((th, idx) => {
                const leftPercent = (idx / 23) * 100;
                const isMajor = th.hour24 % 3 === 0;
                return (
                  <div
                    key={idx}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${leftPercent}%` }}
                  >
                    <div className={`w-0.5 ${isMajor ? 'h-3 bg-slate-500' : 'h-1.5 bg-slate-700'}`} />
                    {isMajor && (
                      <span className="absolute top-3 text-[10px] font-mono text-slate-400 whitespace-nowrap">
                        {th.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Peak Event Badges / Pins on the Timeline */}
            <div className="relative h-20 mt-6">
              {filteredEvents.map((ev) => {
                // Calculate position on timeline: (23 - hoursAgo) / 23 * 100%
                // Bound safely between 2% and 98%
                const leftPos = Math.max(3, Math.min(96, ((24 - ev.hoursAgo) / 24) * 100));
                const isSelected = selectedEventId === ev.id;
                const isHovered = hoveredEventId === ev.id;

                let colorClasses = 'bg-cyan-950 text-cyan-300 border-cyan-500/50 hover:border-cyan-400';
                if (ev.type === 'RAM') {
                  colorClasses = 'bg-purple-950 text-purple-300 border-purple-500/50 hover:border-purple-400';
                } else if (ev.type === 'COMBINED') {
                  colorClasses = 'bg-rose-950 text-rose-300 border-rose-500/60 hover:border-rose-400';
                }

                return (
                  <div
                    key={ev.id}
                    className="absolute top-0 -translate-x-1/2 cursor-pointer transition-all duration-200"
                    style={{ left: `${leftPos}%` }}
                    onClick={() => setSelectedEventId(ev.id)}
                    onMouseEnter={() => setHoveredEventId(ev.id)}
                    onMouseLeave={() => setHoveredEventId(null)}
                  >
                    {/* Vertical connecting line to the axis */}
                    <div className={`w-0.5 h-4 mx-auto -mt-4 transition-colors ${
                      isSelected ? 'bg-white' : ev.severity === 'critical' ? 'bg-rose-500' : 'bg-slate-600'
                    }`} />

                    {/* Event Pin Card */}
                    <div className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-all shadow-lg flex items-center gap-1.5 ${colorClasses} ${
                      isSelected 
                        ? 'ring-2 ring-white scale-110 z-30 shadow-cyan-500/20' 
                        : isHovered 
                        ? 'scale-105 z-20' 
                        : 'z-10'
                    }`}>
                      {ev.isRecurring && (
                        <span title="Định kỳ (Recurring)"><RotateCw className="w-3 h-3 text-amber-400 flex-shrink-0 animate-spin-slow" /></span>
                      )}

                      {ev.type === 'CPU' && <Cpu className="w-3 h-3 text-cyan-400 flex-shrink-0" />}
                      {ev.type === 'RAM' && <Layers className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                      {ev.type === 'COMBINED' && <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />}

                      <div className="flex flex-col text-left">
                        <span className="font-bold text-[11px] leading-tight text-white flex items-center gap-1">
                          <span>{ev.timeRangeLabel.split(' - ')[0]}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-900/80 font-normal">
                            {ev.durationMinutes}m
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-300 whitespace-nowrap">
                          {ev.type === 'CPU' && `CPU ${ev.cpuPeak}%`}
                          {ev.type === 'RAM' && `RAM ${ev.ramPeak}%`}
                          {ev.type === 'COMBINED' && `${ev.cpuPeak}% / ${ev.ramPeak}%`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Selected / Inspected Peak Detail Box */}
      {activeEvent && (
        <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/30 shadow-2xl transition-all animate-fade-in space-y-3">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className={`p-2 rounded-lg ${
                activeEvent.type === 'CPU' 
                  ? 'bg-cyan-500/20 text-cyan-400' 
                  : activeEvent.type === 'RAM' 
                  ? 'bg-purple-500/20 text-purple-400' 
                  : 'bg-rose-500/20 text-rose-400'
              }`}>
                {activeEvent.type === 'CPU' && <Cpu className="w-5 h-5" />}
                {activeEvent.type === 'RAM' && <Layers className="w-5 h-5" />}
                {activeEvent.type === 'COMBINED' && <ShieldAlert className="w-5 h-5" />}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm sm:text-base font-bold text-white font-mono">
                    {activeEvent.title}
                  </h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                    activeEvent.severity === 'critical' 
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {activeEvent.severity}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    <span>Khung giờ: <b>{activeEvent.timeRangeLabel}</b> ({activeEvent.durationMinutes} phút)</span>
                  </span>
                  <span>•</span>
                  <span>Xảy ra cách đây ~{activeEvent.hoursAgo} giờ</span>
                </div>
              </div>
            </div>

            {/* Recurrence Badge */}
            <div className="flex items-center gap-1.5 self-start sm:self-center">
              {activeEvent.isRecurring ? (
                <div className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
                  <span>Sự Cố Chu Kỳ (Recurring)</span>
                </div>
              ) : (
                <div className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                  <span>Đột Biến Đơn Lẻ (Single Anomaly)</span>
                </div>
              )}
            </div>
          </div>

          {/* Peak Metrics row & Root cause analysis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Metric Peaks */}
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase font-mono">
                Thông Số Đỉnh Điểm
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-cyan-400" /> CPU Đỉnh:
                </span>
                <span className="text-sm font-bold font-mono text-cyan-400">
                  {activeEvent.cpuPeak}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-purple-400" /> RAM Đỉnh:
                </span>
                <span className="text-sm font-bold font-mono text-purple-400">
                  {activeEvent.ramPeak}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Dịch vụ chịu tải:</span>
                <span className="text-[11px] font-mono text-slate-300 font-semibold truncate max-w-[120px]">
                  {activeEvent.impactService.split(' ')[0]}
                </span>
              </div>
            </div>

            {/* Root Cause Diagnosis */}
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-rose-300 uppercase font-mono flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Chẩn Đoán Nguyên Nhân Gốc (Root Cause)</span>
                </div>
                <span className="text-[11px] font-mono text-amber-400">
                  {activeEvent.recurrenceText}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeEvent.rootCause}
              </p>

              <div className="pt-2 border-t border-slate-800/80">
                <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mb-1">
                  <Zap className="w-3 h-3" />
                  <span>Khuyến Nghị Khắc Phục (DevOps Mitigation):</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {activeEvent.recommendation}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
