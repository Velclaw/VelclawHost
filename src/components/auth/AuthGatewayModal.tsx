import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle, LogIn, LogOut, ShieldCheck, X } from 'lucide-react';

export interface AuthGatewayUser {
  id: string;
  email: string;
  email_verified: boolean;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthGatewayModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: AuthGatewayUser | null;
  onAuthenticated: (user: AuthGatewayUser) => void;
  onSignedOut: () => void;
}

const AUTH_API_BASE = (import.meta.env.VITE_AUTH_API_BASE_URL || '').trim().replace(/\/+$/, '');

async function requestJson(path: string, init?: RequestInit) {
  if (!AUTH_API_BASE) throw new Error('Auth Gateway chưa được cấu hình cho môi trường này.');
  const response = await fetch(\`\${AUTH_API_BASE}\${path}\`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.message === 'string' ? payload.message
      : response.status === 401 ? 'Email hoặc mật khẩu không chính xác.'
      : response.status === 403 ? 'Yêu cầu bị từ chối. Hãy xác minh email hoặc tải lại phiên bảo mật.'
      : 'Không thể kết nối Auth Gateway.';
    throw new Error(message);
  }
  return payload;
}

async function postSecure(path: string, body: Record<string, string>) {
  const csrf = await requestJson('/api/v1/auth/csrf');
  if (typeof csrf.csrfToken !== 'string') throw new Error('Auth Gateway không cấp được CSRF token.');
  return requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrfToken },
    body: JSON.stringify(body),
  });
}

export const AuthGatewayModal: React.FC<AuthGatewayModalProps> = ({
  open, onClose, currentUser, onAuthenticated, onSignedOut,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [verifiedNotice, setVerifiedNotice] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setMessage('');
    if (!AUTH_API_BASE) return;
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const verificationToken = params.get('verify');
    const resetToken = params.get('reset');
    if (resetToken) {
      setMode('reset');
      setMessage('Nhập mật khẩu mới có ít nhất 12 ký tự.');
      return () => { active = false; };
    }
    if (verificationToken) {
      setBusy(true);
      postSecure('/api/v1/auth/verify-email', { token: verificationToken })
        .then(() => {
          if (!active) return;
          setMode('login');
          setVerifiedNotice(true);
          setMessage('Email đã được xác minh. Bạn có thể đăng nhập.');
          window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Không thể xác minh email.'); })
        .finally(() => { if (active) setBusy(false); });
    } else if (!currentUser) {
      requestJson('/api/v1/me')
        .then((result) => {
          if (active && result.user && typeof result.user.email === 'string') onAuthenticated(result.user as AuthGatewayUser);
        })
        .catch(() => undefined);
    }
    return () => { active = false; };
  }, [open, currentUser]);

  if (!open) return null;

  const clearFeedback = () => { setError(''); setMessage(''); };
  const changeMode = (next: AuthMode) => {
    setMode(next);
    setPassword('');
    setConfirmPassword('');
    clearFeedback();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    clearFeedback();
    try {
      if (mode === 'register') {
        const result = await postSecure('/api/v1/auth/register', { email: email.trim(), password });
        setMessage(result.message || 'Kiểm tra email để xác minh tài khoản.');
      } else if (mode === 'forgot') {
        const result = await postSecure('/api/v1/auth/request-password-reset', { email: email.trim() });
        setMessage(result.message || 'Nếu tài khoản tồn tại, email đặt lại mật khẩu sẽ được gửi.');
      } else if (mode === 'reset') {
        if (password.length < 12) throw new Error('Mật khẩu phải có ít nhất 12 ký tự.');
        if (password !== confirmPassword) throw new Error('Hai mật khẩu không khớp.');
        const token = new URLSearchParams(window.location.search).get('reset');
        if (!token) throw new Error('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
        const result = await postSecure('/api/v1/auth/reset-password', { token, password });
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setMessage(result.message || 'Đã cập nhật mật khẩu. Hãy đăng nhập lại.');
      } else {
        await postSecure('/api/v1/auth/login', { email: email.trim(), password });
        const result = await requestJson('/api/v1/me');
        if (!result.user || typeof result.user.email !== 'string') throw new Error('Không đọc được phiên đăng nhập.');
        onAuthenticated(result.user as AuthGatewayUser);
        setMessage('Đăng nhập thành công.');
      }
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'Không thể xử lý yêu cầu.';
      setError(text);
      if (text.toLowerCase().includes('verify') || text.toLowerCase().includes('xác minh')) {
        setVerifiedNotice(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    if (!email.trim()) { setError('Nhập email trước khi gửi lại xác minh.'); return; }
    setBusy(true); clearFeedback();
    try {
      const result = await postSecure('/api/v1/auth/resend-verification', { email: email.trim() });
      setMessage(result.message || 'Nếu tài khoản cần xác minh, email sẽ được gửi.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể gửi email xác minh.');
    } finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true); clearFeedback();
    try {
      await postSecure('/api/v1/auth/logout', {});
      onSignedOut();
      setMessage('Đã đăng xuất.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đăng xuất.');
    } finally { setBusy(false); }
  };

  const title = mode === 'register' ? 'Tạo tài khoản'
    : mode === 'forgot' ? 'Khôi phục mật khẩu'
    : mode === 'reset' ? 'Đặt mật khẩu mới' : 'Đăng nhập VelclawHost';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="auth-gateway-title">
      <section className="relative my-auto w-full max-w-md border border-neutral-800 bg-black p-6 text-neutral-100 shadow-2xl sm:p-8">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center border border-neutral-800 text-neutral-400 hover:border-neutral-500 hover:text-white" aria-label="Đóng cửa sổ xác thực">
          <X className="h-4 w-4" />
        </button>
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center border border-neutral-700 bg-neutral-950">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-neutral-500">Central Identity · OCodeJS</p>
          <h2 id="auth-gateway-title" className="mt-3 text-xl font-semibold">{currentUser ? 'Tài khoản của bạn' : title}</h2>
          <p className="mt-2 max-w-sm text-xs leading-5 text-neutral-500">
            {currentUser ? 'Phiên đăng nhập được quản lý bởi Auth Gateway trung tâm.' : 'Đăng nhập an toàn để truy cập không gian VelclawHost.'}
          </p>
        </div>

        {!AUTH_API_BASE ? (
          <div className="border border-amber-900/70 bg-amber-950/20 p-4 text-xs leading-6 text-amber-200" role="status">
            Auth Gateway chưa được kết nối trong bản Preview này. Cần cấu hình biến môi trường công khai <code className="font-mono">VITE_AUTH_API_BASE_URL</code> trỏ đến API HTTPS đã triển khai. Không nhập mật khẩu khi trạng thái này còn hiển thị.
          </div>
        ) : currentUser ? (
          <div className="space-y-4">
            <div className="border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">Đã xác thực</p>
              <p className="mt-2 break-all text-sm">{currentUser.email}</p>
              <p className="mt-2 flex items-center gap-2 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Email đã xác minh</p>
            </div>
            {error && <p role="alert" className="border border-red-900 bg-red-950/30 p-3 text-xs text-red-300">{error}</p>}
            {message && <p role="status" className="border border-neutral-800 p-3 text-xs text-neutral-300">{message}</p>}
            <button type="button" onClick={logout} disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm hover:bg-neutral-900 disabled:opacity-50">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Đăng xuất
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-4">
              {mode !== 'reset' && (
                <label className="block text-xs text-neutral-400">
                  Email
                  <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 min-h-11 w-full border border-neutral-800 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-neutral-400" placeholder="you@example.com" />
                </label>
              )}
              {mode !== 'forgot' && (
                <label className="block text-xs text-neutral-400">
                  {mode === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'}
                  <input type="password" required minLength={12} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 min-h-11 w-full border border-neutral-800 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-neutral-400" placeholder="Ít nhất 12 ký tự" />
                </label>
              )}
              {mode === 'reset' && (
                <label className="block text-xs text-neutral-400">
                  Xác nhận mật khẩu mới
                  <input type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="mt-2 min-h-11 w-full border border-neutral-800 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-neutral-400" placeholder="Nhập lại mật khẩu" />
                </label>
              )}
              {error && <p role="alert" className="border border-red-900 bg-red-950/30 p-3 text-xs leading-5 text-red-300">{error}</p>}
              {message && <p role="status" className="border border-neutral-800 bg-neutral-950 p-3 text-xs leading-5 text-neutral-300">{message}</p>}
              <button type="submit" disabled={busy || !AUTH_API_BASE} className="flex min-h-11 w-full items-center justify-center gap-2 border border-white bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {busy ? 'Đang xử lý…' : title}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-900 pt-4 text-xs text-neutral-500">
              {mode === 'login' ? (
                <>
                  <button type="button" onClick={() => changeMode('register')} className="hover:text-white">Tạo tài khoản</button>
                  <button type="button" onClick={() => changeMode('forgot')} className="hover:text-white">Quên mật khẩu?</button>
                </>
              ) : (
                <button type="button" onClick={() => changeMode('login')} className="hover:text-white">← Quay lại đăng nhập</button>
              )}
              {(mode === 'login' || verifiedNotice) && (
                <button type="button" disabled={busy} onClick={resendVerification} className="w-full text-left hover:text-white disabled:opacity-50">Gửi lại email xác minh</button>
              )}
            </div>
            <p className="mt-5 text-center text-[10px] leading-5 text-neutral-600">Phiên dùng cookie HttpOnly · CSRF protection · Không lưu mật khẩu hoặc session token trong trình duyệt.</p>
          </>
        )}
      </section>
    </div>
  );
};
