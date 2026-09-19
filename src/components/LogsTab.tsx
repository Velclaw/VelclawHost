import React, { useState } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  Download, 
  Plus, 
  Clock, 
  Terminal, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Check
} from 'lucide-react';
import { SystemLog, SystemAlert } from '../types';

interface LogsTabProps {
  logs: SystemLog[];
  alerts: SystemAlert[];
  onAddLog: (log: Omit<SystemLog, 'id' | 'timestamp'>) => void;
  onExportCsv: () => void;
}

export const LogsTab: React.FC<LogsTabProps> = ({
  logs,
  alerts,
  onAddLog,
  onExportCsv,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteCategory, setNoteCategory] = useState<SystemLog['category']>('MAINTENANCE');
  const [noteLevel, setNoteLevel] = useState<SystemLog['level']>('INFO');
  const [noteMessage, setNoteMessage] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('Admin (huynhthuong.xyz@gmail.com)');

  const handleAddNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteMessage.trim()) return;
    onAddLog({
      level: noteLevel,
      category: noteCategory,
      message: noteMessage,
      source: `manual-entry: ${noteAuthor}`,
      ip: '113.185.42.19',
    });
    setNoteMessage('');
    setIsAddingNote(false);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.ip && log.ip.includes(searchTerm));
    const matchesLevel = selectedLevel === 'ALL' || log.level === selectedLevel;
    const matchesCategory = selectedCategory === 'ALL' || log.category === selectedCategory;
    return matchesSearch && matchesLevel && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-blue-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
            <FileText className="w-4 h-4" />
            <span>Nhật Ký Sự Kiện Chi Tiết &amp; Bảo Trì</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">
            Audit Logs, Bảo Trì Hệ Thống &amp; Nhật Ký Truy Cập
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Ghi nhận toàn diện nhật ký nhân Linux kernel, chứng chỉ SSL, phân giải DNS, xác thực 2FA của quản trị viên và tường lửa WAF nhằm phục vụ công tác giám sát và bảo trì.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsAddingNote(!isAddingNote)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950/50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Ghi Chú Bảo Trì</span>
          </button>

          <button
            onClick={onExportCsv}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV Logs</span>
          </button>
        </div>
      </div>

      {/* Manual Maintenance Entry Form */}
      {isAddingNote && (
        <form onSubmit={handleAddNoteSubmit} className="p-4 rounded-2xl bg-slate-900 border border-slate-700 space-y-3 animate-fade-in">
          <div className="text-xs font-bold text-white uppercase tracking-wider">
            Tạo Bản Ghi Nhật Ký Bảo Trì Thủ Công (Maintenance Audit Record)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Cấp Độ (Severity)</label>
              <select
                value={noteLevel}
                onChange={(e) => setNoteLevel(e.target.value as SystemLog['level'])}
                className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
              >
                <option value="INFO">INFO (Thông tin thông thường)</option>
                <option value="WARN">WARN (Cảnh báo chú ý)</option>
                <option value="CRITICAL">CRITICAL (Nghiêm trọng)</option>
                <option value="ERROR">ERROR (Lỗi thao tác)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Danh Mục (Category)</label>
              <select
                value={noteCategory}
                onChange={(e) => setNoteCategory(e.target.value as SystemLog['category'])}
                className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
              >
                <option value="MAINTENANCE">MAINTENANCE (Bảo trì)</option>
                <option value="SYSTEM">SYSTEM (Hệ thống)</option>
                <option value="SECURITY">SECURITY (Bảo mật)</option>
                <option value="NGINX">NGINX (Web Ingress)</option>
                <option value="DATABASE">DATABASE (Cơ sở dữ liệu)</option>
                <option value="2FA">2FA (Xác thực 2 yếu tố)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Người Thực Hiện</label>
              <input
                type="text"
                value={noteAuthor}
                onChange={(e) => setNoteAuthor(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Nội Dung Thao Tác Bảo Trì</label>
            <textarea
              rows={2}
              value={noteMessage}
              onChange={(e) => setNoteMessage(e.target.value)}
              placeholder="Ví dụ: Đã nâng cấp nhân Linux kernel lên phiên bản 6.1.0-21-amd64 và khởi động lại Nginx không gián đoạn..."
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddingNote(false)}
              className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              Lưu Vào Nhật Ký
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm kiếm theo nội dung, tiến trình, địa chỉ IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
          >
            <option value="ALL">Mọi Mức Độ (All Levels)</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="ERROR">ERROR</option>
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
          >
            <option value="ALL">Mọi Danh Mục (All Categories)</option>
            <option value="SYSTEM">SYSTEM</option>
            <option value="SECURITY">SECURITY</option>
            <option value="NGINX">NGINX</option>
            <option value="DATABASE">DATABASE</option>
            <option value="2FA">2FA</option>
            <option value="DNS">DNS</option>
            <option value="SSL">SSL</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
          </select>
        </div>
      </div>

      {/* Logs Stream List */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>Event Tail Stream: {filteredLogs.length} sự kiện</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Real-time Ingestion
          </span>
        </div>

        <div className="space-y-2 font-mono text-xs max-h-[500px] overflow-y-auto pr-1">
          {filteredLogs.map((log) => {
            const levelColor = 
              log.level === 'CRITICAL' || log.level === 'ERROR'
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                : log.level === 'WARN'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20';

            return (
              <div 
                key={log.id} 
                className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="text-slate-500">{log.timestamp}</span>
                    <span className={`px-1.5 py-0.2 rounded border font-bold ${levelColor}`}>
                      {log.level}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                      [{log.category}]
                    </span>
                    <span className="text-slate-400">src: {log.source}</span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed font-sans sm:font-mono">
                    {log.message}
                  </p>
                </div>

                {log.ip && (
                  <div className="text-[10px] text-slate-500 font-mono self-start sm:self-auto bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    IP: {log.ip}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
