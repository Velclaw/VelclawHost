import React, { useState } from 'react';
import { 
  BellRing, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  Flame, 
  Send, 
  Volume2, 
  VolumeX, 
  Mail, 
  Webhook, 
  Smartphone,
  Check,
  RotateCcw,
  Zap,
  Info
} from 'lucide-react';
import { AlertThresholds, SystemAlert, MetricSnapshot } from '../types';

interface AlertsTabProps {
  thresholds: AlertThresholds;
  alerts: SystemAlert[];
  currentMetric: MetricSnapshot;
  onUpdateThresholds: (updated: Partial<AlertThresholds>) => void;
  onSimulateCpuSpike: () => void;
  onSimulateRamSpike: () => void;
  onResolveAlert: (id: string) => void;
  onClearResolvedAlerts: () => void;
}

export const AlertsTab: React.FC<AlertsTabProps> = ({
  thresholds,
  alerts,
  currentMetric,
  onUpdateThresholds,
  onSimulateCpuSpike,
  onSimulateRamSpike,
  onResolveAlert,
  onClearResolvedAlerts,
}) => {
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('https://hooks.slack.com/services/T000/B000/XXXX');
  const [adminEmail, setAdminEmail] = useState('huynhthuong.xyz@gmail.com');

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const activeAlerts = alerts.filter(a => !a.resolved);
  const resolvedAlerts = alerts.filter(a => a.resolved);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-rose-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider mb-1">
            <BellRing className="w-4 h-4" />
            <span>Hệ Thống Cảnh Báo Tự Động &amp; Ngưỡng Cho Phép</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">
            Tự Động Gửi Cảnh Báo Khi CPU Hoặc RAM Vượt Ngưỡng
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Khi phụ tải vượt quá mức an toàn, hệ thống lập tức kích hoạt thông báo đẩy FCM, gửi Webhook đến Slack/Discord và phát còi cảnh báo quản trị viên.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="simulate-cpu-spike-btn"
            onClick={onSimulateCpuSpike}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-all flex items-center gap-1.5"
          >
            <Flame className="w-4 h-4 text-rose-400" />
            <span>Đột Biến CPU</span>
          </button>
          <button
            id="simulate-ram-spike-btn"
            onClick={onSimulateRamSpike}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition-all flex items-center gap-1.5"
          >
            <Zap className="w-4 h-4 text-purple-400" />
            <span>Đột Biến RAM</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Đã lưu cấu hình ngưỡng cảnh báo hệ thống thành công!</span>
        </div>
      )}

      {/* Threshold Sliders & Notification Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sliders Configuration */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>Thiết Lập Ngưỡng Kích Hoạt Cảnh Báo (%)</span>
            </h3>
            <span className="text-[11px] font-mono text-cyan-400 font-semibold">
              Real-time Watchdog
            </span>
          </div>

          <div className="space-y-4">
            {/* CPU Warning */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Ngưỡng Cảnh Báo CPU (Warning):</span>
                <span className="font-mono font-bold text-amber-400">{thresholds.cpuWarning}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="1"
                value={thresholds.cpuWarning}
                onChange={(e) => onUpdateThresholds({ cpuWarning: Number(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="text-[11px] text-slate-500 flex justify-between">
                <span>50%</span>
                <span>Hiện tại: {currentMetric.cpuUsage.toFixed(1)}%</span>
                <span>95%</span>
              </div>
            </div>

            {/* CPU Critical */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Ngưỡng Khẩn Cấp CPU (Critical / OOM Guard):</span>
                <span className="font-mono font-bold text-rose-400">{thresholds.cpuCritical}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="99"
                step="1"
                value={thresholds.cpuCritical}
                onChange={(e) => onUpdateThresholds({ cpuCritical: Number(e.target.value) })}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <div className="text-[11px] text-slate-500 flex justify-between">
                <span>70%</span>
                <span>Gửi cảnh báo khẩn cấp ngay lập tức</span>
                <span>99%</span>
              </div>
            </div>

            {/* RAM Warning */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Ngưỡng Cảnh Báo RAM (Warning):</span>
                <span className="font-mono font-bold text-purple-400">{thresholds.ramWarning}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="1"
                value={thresholds.ramWarning}
                onChange={(e) => onUpdateThresholds({ ramWarning: Number(e.target.value) })}
                className="w-full accent-purple-400 cursor-pointer"
              />
              <div className="text-[11px] text-slate-500 flex justify-between">
                <span>50%</span>
                <span>Hiện tại: {currentMetric.ramUsagePercent.toFixed(1)}% ({currentMetric.ramUsedGb} GB)</span>
                <span>95%</span>
              </div>
            </div>

            {/* RAM Critical */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Ngưỡng Khẩn Cấp RAM (Critical):</span>
                <span className="font-mono font-bold text-rose-400">{thresholds.ramCritical}%</span>
              </div>
              <input
                type="range"
                min="75"
                max="99"
                step="1"
                value={thresholds.ramCritical}
                onChange={(e) => onUpdateThresholds({ ramCritical: Number(e.target.value) })}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md shadow-cyan-950/40"
            >
              Lưu Cấu Hình Ngưỡng
            </button>
          </div>
        </div>

        {/* Notification Channels Card */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-cyan-400" />
              <span>Kênh Gửi Thông Báo Tức Thì</span>
            </h3>
            <p className="text-xs text-slate-400">Các kênh tiếp nhận cảnh báo tự động</p>
          </div>

          <div className="space-y-3">
            {/* FCM Push */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Firebase Cloud Messaging</div>
                  <div className="text-[10px] text-slate-400">Web Push theo thời gian thực</div>
                </div>
              </div>
              <button
                onClick={() => onUpdateThresholds({ notifyFCM: !thresholds.notifyFCM })}
                className={`text-xs px-2.5 py-1 rounded font-mono font-bold ${
                  thresholds.notifyFCM ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {thresholds.notifyFCM ? 'BẬT' : 'TẮT'}
              </button>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Email Quản Trị</div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{adminEmail}</div>
                </div>
              </div>
              <button
                onClick={() => onUpdateThresholds({ notifyEmail: !thresholds.notifyEmail })}
                className={`text-xs px-2.5 py-1 rounded font-mono font-bold ${
                  thresholds.notifyEmail ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {thresholds.notifyEmail ? 'BẬT' : 'TẮT'}
              </button>
            </div>

            {/* Webhook */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Webhook className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Webhook Endpoint</div>
                  <div className="text-[10px] text-slate-400">Slack / Discord / OpsGenie</div>
                </div>
              </div>
              <button
                onClick={() => onUpdateThresholds({ notifyWebhook: !thresholds.notifyWebhook })}
                className={`text-xs px-2.5 py-1 rounded font-mono font-bold ${
                  thresholds.notifyWebhook ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {thresholds.notifyWebhook ? 'BẬT' : 'TẮT'}
              </button>
            </div>

            {/* Sound */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  {thresholds.soundAlert ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Âm Thanh Báo Động</div>
                  <div className="text-[10px] text-slate-400">Bíp còi khi phát hiện quá tải</div>
                </div>
              </div>
              <button
                onClick={() => onUpdateThresholds({ soundAlert: !thresholds.soundAlert })}
                className={`text-xs px-2.5 py-1 rounded font-mono font-bold ${
                  thresholds.soundAlert ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {thresholds.soundAlert ? 'BẬT' : 'TẮT'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Active Alerts List */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Cảnh Báo Đang Hoạt Động ({activeAlerts.length})</span>
            </h3>
            <p className="text-xs text-slate-400">Danh sách sự cố vượt ngưỡng cần quản trị viên xử lý</p>
          </div>

          {resolvedAlerts.length > 0 && (
            <button
              onClick={onClearResolvedAlerts}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Xóa Lịch Sử Đã Xử Lý
            </button>
          )}
        </div>

        {activeAlerts.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-950/50 border border-slate-800/80">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
            <div className="text-sm font-bold text-white">Hệ Thống Đang Ổn Định Tuyệt Đối</div>
            <div className="text-xs text-slate-400 mt-1">
              Không có cảnh báo vượt ngưỡng CPU hay RAM nào tại thời điểm này.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <div 
                key={alert.id}
                className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500 text-white uppercase">
                      {alert.severity}
                    </span>
                    <span className="text-xs font-bold text-white">{alert.title}</span>
                    <span className="text-[11px] text-slate-400 font-mono">({alert.timestamp})</span>
                  </div>
                  <p className="text-xs text-rose-200/90">{alert.message}</p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => onResolveAlert(alert.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Đánh Dấu Đã Xử Lý</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved Alerts History */}
      {resolvedAlerts.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Nhật Ký Cảnh Báo Gần Đây (Đã Giải Quyết)
          </h3>
          <div className="space-y-2">
            {resolvedAlerts.map((alert) => (
              <div key={alert.id} className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-slate-300 font-medium">{alert.title}</span>
                  <span className="text-slate-500 font-mono text-[11px] hidden sm:inline">- {alert.timestamp}</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  ĐÃ KHẮC PHỤC
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
