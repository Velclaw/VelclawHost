import React, { useState } from 'react';
import { 
  X, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Calendar, 
  Mail, 
  CheckCircle2, 
  Clock,
  Sparkles,
  Check
} from 'lucide-react';
import { HostNode, MetricSnapshot, SslInfo, AlertThresholds, SystemAlert, SystemLog } from '../types';
import { generatePdfReport } from '../utils/pdfExport';
import { downloadMetricsCsv, downloadLogsCsv } from '../utils/csvExport';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: HostNode;
  metrics: MetricSnapshot[];
  ssl: SslInfo;
  thresholds: AlertThresholds;
  alerts: SystemAlert[];
  logs: SystemLog[];
  isTwoFactorActive: boolean;
}

export const ReportsModal: React.FC<ReportsModalProps> = ({
  isOpen,
  onClose,
  node,
  metrics,
  ssl,
  thresholds,
  alerts,
  logs,
  isTwoFactorActive,
}) => {
  const [scheduleFreq, setScheduleFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [scheduleFormat, setScheduleFormat] = useState<'pdf' | 'csv' | 'both'>('pdf');
  const [emailTo, setEmailTo] = useState('huynhthuong.xyz@gmail.com');
  const [scheduleSuccess, setScheduleSuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentMetric = metrics[metrics.length - 1] || metrics[0];

  const handleDownloadPdf = () => {
    generatePdfReport({
      node,
      currentMetric,
      ssl,
      thresholds,
      alerts,
      isTwoFactorActive,
    });
    setDownloadSuccess('Đã tải xuống báo cáo định dạng PDF thành công!');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleDownloadMetricsCsv = () => {
    downloadMetricsCsv(metrics, node.hostname);
    setDownloadSuccess('Đã tải xuống tập tin CSV số liệu hiệu suất!');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleDownloadLogsCsv = () => {
    downloadLogsCsv(logs, alerts);
    setDownloadSuccess('Đã tải xuống tập tin CSV nhật ký sự kiện & cảnh báo!');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleSuccess(true);
    setTimeout(() => setScheduleSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Xuất Báo Cáo Định Kỳ &amp; Tải Xuống (CSV / PDF)</h2>
              <p className="text-xs text-slate-400">Trích xuất số liệu giám sát tài nguyên máy chủ production</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {downloadSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fade-in">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{downloadSuccess}</span>
          </div>
        )}

        {/* Section 1: Instant Downloads */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-white uppercase tracking-wider">
            1. Tải Xuống Báo Cáo Ngay Lập Tức
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* PDF Report */}
            <button
              onClick={handleDownloadPdf}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900 text-left space-y-2 transition-all group"
            >
              <div className="flex items-center justify-between">
                <FileText className="w-5 h-5 text-rose-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold">
                  PDF
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-white">Báo Cáo Kiểm Toán PDF</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Tổng quan kiến trúc, SLA, SSL &amp; tài nguyên</div>
              </div>
            </button>

            {/* Metrics CSV */}
            <button
              onClick={handleDownloadMetricsCsv}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 text-left space-y-2 transition-all group"
            >
              <div className="flex items-center justify-between">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                  CSV
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-white">Số Liệu Metrics CSV</div>
                <div className="text-[10px] text-slate-400 mt-0.5">CPU, RAM, Disk, IOPS &amp; chuỗi thời gian</div>
              </div>
            </button>

            {/* Logs CSV */}
            <button
              onClick={handleDownloadLogsCsv}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900 text-left space-y-2 transition-all group"
            >
              <div className="flex items-center justify-between">
                <FileSpreadsheet className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                  CSV
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-white">Nhật Ký &amp; Cảnh Báo CSV</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Sự kiện bảo trì, lỗi và audit trails</div>
              </div>
            </button>
          </div>
        </div>

        {/* Section 2: Automated Periodic Scheduling */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                2. Lập Lịch Gửi Báo Cáo Tự Động Định Kỳ
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">
              CRON ACTIVE
            </span>
          </div>

          <form onSubmit={handleSaveSchedule} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Tần Suất Báo Cáo</label>
                <select
                  value={scheduleFreq}
                  onChange={(e) => setScheduleFreq(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                >
                  <option value="daily">Hàng Ngày (08:00 AM UTC+7)</option>
                  <option value="weekly">Hàng Tuần (Thứ 2 hàng tuần)</option>
                  <option value="monthly">Hàng Tháng (Ngày 01 đầu tháng)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Định Dạng File Đính Kèm</label>
                <select
                  value={scheduleFormat}
                  onChange={(e) => setScheduleFormat(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                >
                  <option value="pdf">File PDF (Bản in đẹp)</option>
                  <option value="csv">File CSV (Số liệu thô)</option>
                  <option value="both">Cả hai file (PDF + CSV)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Email Tiếp Nhận Báo Cáo</label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Báo cáo tiếp theo: Thứ Hai, 08:00 AM</span>
              </div>

              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950/40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Lưu Lịch Gửi Tự Động</span>
              </button>
            </div>
          </form>

          {scheduleSuccess && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Đã kích hoạt lịch gửi định kỳ thành công tới {emailTo}!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
