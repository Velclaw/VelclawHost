import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  KeyRound, 
  Smartphone, 
  QrCode, 
  Copy, 
  Check, 
  RefreshCw, 
  Lock, 
  Unlock, 
  AlertTriangle,
  Download,
  Clock,
  UserCheck
} from 'lucide-react';
import { TwoFactorState } from '../types';
import { getSecondsRemainingInTotpWindow, generateCurrentTotp, verifyTotpCode } from '../utils/totp';

interface SecurityTabProps {
  twoFactor: TwoFactorState;
  onToggleTwoFactor: (enabled: boolean) => void;
  onVerifyTwoFactor: (code: string) => boolean;
  onRegenerateBackupCodes: () => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  twoFactor,
  onToggleTwoFactor,
  onVerifyTwoFactor,
  onRegenerateBackupCodes,
}) => {
  const [inputToken, setInputToken] = useState('');
  const [verifyMessage, setVerifyMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(getSecondsRemainingInTotpWindow());
  const [currentLiveCode, setCurrentLiveCode] = useState(generateCurrentTotp(twoFactor.secret));

  useEffect(() => {
    const timer = setInterval(() => {
      const sec = getSecondsRemainingInTotpWindow();
      setSecondsRemaining(sec);
      if (sec === 30) {
        setCurrentLiveCode(generateCurrentTotp(twoFactor.secret));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [twoFactor.secret]);

  const handleCopySecret = () => {
    navigator.clipboard.writeText(twoFactor.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onVerifyTwoFactor(inputToken);
    if (ok) {
      setVerifyMessage({ text: 'Xác thực mã 2FA TOTP thành công! Quyền quản trị viên tối cao đã được xác thực.', success: true });
      setInputToken('');
    } else {
      setVerifyMessage({ text: 'Mã 2FA không chính xác hoặc đã hết hạn 30 giây. Vui lòng thử lại!', success: false });
    }
  };

  const downloadBackupCodes = () => {
    const text = [
      '# VELCLAW HOSTING PLATFORM - EMERGENCY 2FA BACKUP CODES',
      `# Administrator: ${twoFactor.adminEmail}`,
      `# Generated: ${new Date().toISOString()}`,
      '# Each code can only be used once in emergency lockout scenarios.\n',
      ...twoFactor.backupCodes.map((code, i) => `${i + 1}. ${code}`)
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `velclaw-2fa-backup-codes-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Cơ Chế Xác Thực Đa Yếu Tố (2FA / MFA)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">
            Bảo Mật Tuyệt Đối Cho Quản Trị Viên Hệ Thống
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Tích hợp giao thức TOTP (Time-based One-Time Password) chuẩn RFC 6238, tương thích với Google Authenticator, Authy, Apple Keychain và 1Password để bảo vệ quyền truy cập máy chủ production.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono border flex items-center gap-1.5 ${
            twoFactor.enabled && twoFactor.verified
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
          }`}>
            {twoFactor.enabled && twoFactor.verified ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>2FA ENFORCED (ACTIVE)</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>2FA CHƯA KÍCH HOẠT</span>
              </>
            )}
          </span>
        </div>
      </div>

      {verifyMessage && (
        <div className={`p-4 rounded-xl border text-xs font-medium flex items-center gap-2 animate-fade-in ${
          verifyMessage.success
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
        }`}>
          {verifyMessage.success ? (
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          )}
          <span>{verifyMessage.text}</span>
        </div>
      )}

      {/* Main 2FA Setup Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1 & 2: QR Code & Secret */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <QrCode className="w-4 h-4 text-cyan-400" />
              <span>1. Thiết Lập Ứng Dụng Authenticator</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">RFC 6238 TOTP</span>
          </div>

          <p className="text-xs text-slate-300">
            Quét mã QR bên dưới bằng Google Authenticator hoặc ứng dụng quản lý mật khẩu của bạn để liên kết tài khoản quản trị <strong className="text-white">{twoFactor.adminEmail}</strong>:
          </p>

          {/* Realistic SVG QR code illustration */}
          <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="w-36 h-36 bg-white p-2 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
              {/* Stylized QR Code SVG */}
              <svg className="w-full h-full text-slate-950" viewBox="0 0 100 100" fill="currentColor">
                {/* Top-left corner */}
                <rect x="5" y="5" width="26" height="26" rx="3" fill="#0f172a" />
                <rect x="10" y="10" width="16" height="16" rx="2" fill="white" />
                <rect x="14" y="14" width="8" height="8" fill="#0f172a" />

                {/* Top-right corner */}
                <rect x="69" y="5" width="26" height="26" rx="3" fill="#0f172a" />
                <rect x="74" y="10" width="16" height="16" rx="2" fill="white" />
                <rect x="78" y="14" width="8" height="8" fill="#0f172a" />

                {/* Bottom-left corner */}
                <rect x="5" y="69" width="26" height="26" rx="3" fill="#0f172a" />
                <rect x="10" y="74" width="16" height="16" rx="2" fill="white" />
                <rect x="14" y="78" width="8" height="8" fill="#0f172a" />

                {/* Data pattern blocks */}
                <rect x="36" y="8" width="6" height="6" fill="#0f172a" />
                <rect x="46" y="14" width="8" height="6" fill="#0f172a" />
                <rect x="58" y="8" width="6" height="6" fill="#0f172a" />
                <rect x="36" y="24" width="8" height="8" fill="#0f172a" />
                <rect x="48" y="26" width="6" height="6" fill="#0f172a" />

                <rect x="8" y="36" width="8" height="6" fill="#0f172a" />
                <rect x="20" y="38" width="6" height="8" fill="#0f172a" />
                <rect x="8" y="48" width="6" height="8" fill="#0f172a" />
                <rect x="22" y="50" width="6" height="6" fill="#0f172a" />

                <rect x="36" y="36" width="10" height="10" fill="#0891b2" />
                <rect x="50" y="38" width="8" height="6" fill="#0f172a" />
                <rect x="40" y="50" width="6" height="8" fill="#0f172a" />
                <rect x="52" y="48" width="10" height="10" fill="#0891b2" />

                <rect x="68" y="36" width="6" height="8" fill="#0f172a" />
                <rect x="80" y="38" width="8" height="6" fill="#0f172a" />
                <rect x="72" y="48" width="8" height="8" fill="#0f172a" />
                <rect x="84" y="50" width="6" height="6" fill="#0f172a" />

                <rect x="36" y="68" width="6" height="8" fill="#0f172a" />
                <rect x="46" y="72" width="8" height="6" fill="#0f172a" />
                <rect x="38" y="82" width="6" height="6" fill="#0f172a" />
                <rect x="50" y="80" width="8" height="8" fill="#0f172a" />

                <rect x="68" y="68" width="8" height="8" fill="#0f172a" />
                <rect x="82" y="70" width="6" height="6" fill="#0f172a" />
                <rect x="72" y="82" width="6" height="6" fill="#0f172a" />
                <rect x="84" y="80" width="8" height="8" fill="#0f172a" />
              </svg>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-slate-400">Không quét được mã? Nhập khóa bí mật (Secret Key) thủ công:</div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-cyan-300 font-bold">
                <span>{twoFactor.secret}</span>
                <button
                  id="copy-secret-key-btn"
                  onClick={handleCopySecret}
                  className="hover:text-white p-1"
                  title="Sao chép khóa bí mật"
                >
                  {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[11px] text-slate-400">
                Tài khoản: <span className="text-white">{twoFactor.adminEmail}</span>
              </div>
            </div>
          </div>

          {/* Live Simulator Preview box */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
            <div>
              <div className="text-slate-400 text-[11px]">Mã TOTP Thời Gian Thực (Mô Phỏng 30s):</div>
              <div className="text-lg font-bold font-mono text-emerald-400 tracking-wider">
                {currentLiveCode.slice(0, 3)} {currentLiveCode.slice(3)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span>Đổi mã sau:</span>
              </div>
              <span className="font-mono font-bold text-cyan-300">{secondsRemaining}s</span>
            </div>
          </div>
        </div>

        {/* Step 2: Verification Input & Status */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <span>2. Xác Thực Mã 6 Chữ Số</span>
            </h3>
            <span className="text-xs text-emerald-400 font-bold">Bắt Buộc</span>
          </div>

          <p className="text-xs text-slate-300">
            Nhập mã gồm 6 số đang hiển thị trên ứng dụng xác thực của bạn (hoặc sử dụng mã đang nhảy ở khung mô phỏng bên cạnh):
          </p>

          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1.5 font-medium">Mã Xác Thực 6 Số (TOTP Token)</label>
              <input
                type="text"
                maxLength={6}
                placeholder="Ví dụ: 888999 hoặc 123456"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                className="w-full text-center tracking-[0.4em] text-2xl font-mono font-bold py-3 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 focus:outline-none focus:border-cyan-500"
                required
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-950/40 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Xác Nhận Kích Hoạt 2FA</span>
              </button>

              <button
                type="button"
                onClick={() => setInputToken(currentLiveCode)}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                title="Tự động điền mã mô phỏng"
              >
                Điền Mã Demo
              </button>
            </div>
          </form>

          {/* 2FA Protection Rules */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 text-xs space-y-2">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              <span>Chính sách bảo vệ quản trị viên Velclaw:</span>
            </div>
            <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-1">
              <li>Bắt buộc 2FA khi thực hiện cấu hình DNS trỏ IP máy chủ mới.</li>
              <li>Bắt buộc 2FA khi xoay vòng chứng chỉ bảo mật SSL/TLS.</li>
              <li>Bảo vệ chống tấn công Brute-force &amp; đánh cắp phiên Cookie.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Emergency Backup Codes */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Mã Khôi Phục Khẩn Cấp (Emergency Backup Codes)</span>
            </h3>
            <p className="text-xs text-slate-400">Sử dụng để đăng nhập khi mất điện thoại hoặc thiết bị xác thực</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRegenerateBackupCodes}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tạo Bộ Mã Mới</span>
            </button>

            <button
              id="download-backup-codes-btn"
              onClick={downloadBackupCodes}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải Mã Dưới Dạng File TXT</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          {twoFactor.backupCodes.map((code, idx) => (
            <div key={idx} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <span className="text-slate-500 text-[10px]">{idx + 1}.</span>
              <span className="text-slate-200 font-bold tracking-wider">{code}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
