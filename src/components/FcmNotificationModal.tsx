import React, { useState } from 'react';
import { 
  X, 
  Bell, 
  Send, 
  Smartphone, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  RefreshCw,
  Flame,
  ShieldAlert
} from 'lucide-react';
import { SystemAlert } from '../types';

interface FcmNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: SystemAlert[];
  onTriggerTestPush: (title: string, message: string) => void;
}

export const FcmNotificationModal: React.FC<FcmNotificationModalProps> = ({
  isOpen,
  onClose,
  alerts,
  onTriggerTestPush,
}) => {
  const [fcmToken, setFcmToken] = useState('cZ_91xA4K-f82_e:APA91bF9x_K8z7V1-qLm0N4P2rS8tU1vW3xY5z7A9bC1dE3fG5hI7jK9lM1nO3pQ5rS7tU9vW1xY3z5A7bC9dE1fG3hI5jK7lM9nO1pQ3');
  const [vapidKey] = useState('BLp9zV7_K8xY2-qLm0N4P2rS8tU1vW3xY5z7A9bC1dE3fG5hI7jK9lM1nO3pQ5');
  const [permission, setPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [copiedToken, setCopiedToken] = useState(false);
  const [testSent, setTestSent] = useState(false);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        setPermission(result);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSendTestNotification = () => {
    onTriggerTestPush(
      '⚠️ Cảnh báo CPU vượt ngưỡng 85%!',
      'Node prod-edge-asia1.velclaw.cfd ghi nhận tải CPU 87.2% vượt ngưỡng khẩn cấp!'
    );
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(fcmToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Firebase Cloud Messaging (FCM) Push</h2>
              <p className="text-xs text-slate-400">Hệ thống thông báo đẩy theo thời gian thực khi có biến cố</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Permission Status */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white">Quyền Thông Báo Trình Duyệt (Web Push Permission)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Trạng thái: <strong className={permission === 'granted' ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>{permission.toUpperCase()}</strong>
            </div>
          </div>

          {permission !== 'granted' ? (
            <button
              onClick={handleRequestPermission}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              Cấp Quyền Push
            </button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold font-mono">
              <CheckCircle2 className="w-4 h-4" />
              Đã Cho Phép
            </span>
          )}
        </div>

        {/* Token and VAPID display */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-400 font-semibold block mb-1">FCM Client Registration Token (Web)</label>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300">
              <span className="truncate flex-1">{fcmToken}</span>
              <button
                onClick={handleCopyToken}
                className="text-slate-400 hover:text-white p-1"
                title="Sao chép Token"
              >
                {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-slate-400 font-semibold block mb-1">VAPID Public Key</label>
            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400 truncate">
              {vapidKey}
            </div>
          </div>
        </div>

        {/* Send Test Push Button */}
        <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-white">Kiểm Tra Gửi Thông Báo Đẩy (Simulate Push)</div>
            <div className="text-[11px] text-cyan-300/80">Kích hoạt tin báo đẩy khẩn cấp gửi tới thiết bị quản trị</div>
          </div>

          <button
            onClick={handleSendTestNotification}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-cyan-950/50 flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Bắn Thử FCM Push</span>
          </button>
        </div>

        {testSent && (
          <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Đã gửi thông báo đẩy Firebase Cloud Messaging thành công!</span>
          </div>
        )}

        {/* Recent Push Notifications */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Nhật Ký Thông Báo Đẩy Gần Đây ({alerts.length})
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {alerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-start gap-2.5 text-xs">
                <div className={`p-1 rounded mt-0.5 ${alert.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  <Bell className="w-3 h-3" />
                </div>
                <div>
                  <div className="font-semibold text-white">{alert.title}</div>
                  <div className="text-[11px] text-slate-400">{alert.message}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{alert.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
