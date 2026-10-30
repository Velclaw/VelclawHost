'use client';
import React, { useEffect, useState } from 'react';
import { Activity, ArrowRight, Chrome, Github, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { signIn } from 'next-auth/react';

type AuthMode = 'login' | 'register' | 'reset' | 'updatePassword';

interface AuthScreenProps {
  initialMode?: AuthMode;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ initialMode = 'login' }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'updatePassword') setMode('updatePassword');
    const verified = params.get('verified');
    if (verified === 'success') setMessage('Email đã được xác minh. Bạn có thể đăng nhập.');
    if (verified === 'invalid') setErrorMessage('Liên kết xác minh không hợp lệ hoặc đã hết hạn.');
    if (verified === 'rate-limited') setErrorMessage('Bạn đã gửi quá nhiều yêu cầu xác minh. Vui lòng chờ 15 phút rồi thử lại.');
  }, []);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setMessage('');
    setErrorMessage('');
  };

  const signInWithProvider = async (provider: 'github' | 'google') => {
    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      await signIn(provider, { redirectTo: '/dashboard' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể đăng nhập bằng tài khoản bên thứ ba.');
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      if (mode === 'register') {
        const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password, fullName: fullName.trim() }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể đăng ký.');
        setMessage('Nếu địa chỉ email có thể đăng ký, hướng dẫn xác minh sẽ được gửi.');
      } else if (mode === 'reset') {
        const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase() }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể gửi email.');
        setMessage('Nếu địa chỉ email hợp lệ, hướng dẫn đặt lại mật khẩu đã được gửi.');
      } else if (mode === 'updatePassword') {
        if (password !== confirmPassword) throw new Error('Hai mật khẩu không khớp.');
        const token = new URLSearchParams(window.location.search).get('token'); if (!token) throw new Error('Liên kết đặt lại mật khẩu không hợp lệ.'); const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể cập nhật mật khẩu.'); setMessage('Đã cập nhật mật khẩu. Hãy đăng nhập lại.');
      } else {
        const result = await signIn('credentials', { email: email.trim().toLowerCase(), password, redirect: false }); if (result?.error) throw new Error('Email hoặc mật khẩu không đúng, hoặc email chưa được xác minh.'); window.location.assign('/dashboard');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'register' ? 'Tạo tài khoản'
    : mode === 'reset' ? 'Khôi phục mật khẩu'
      : mode === 'updatePassword' ? 'Đặt mật khẩu mới' : 'Đăng nhập';
  const subtitle = mode === 'register'
    ? 'Tạo tài khoản VelClawHost để lưu hồ sơ và dữ liệu cá nhân.'
    : mode === 'reset'
      ? 'Nhập email để nhận liên kết đặt lại mật khẩu.'
      : mode === 'updatePassword'
        ? 'Tạo mật khẩu mới cho tài khoản VelClawHost của bạn.'
        : 'Đăng nhập để tiếp tục quản lý tên miền và DNS.';

  return (
    <main className="min-h-screen bg-black text-neutral-100 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-neutral-500">VelClawHost</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-neutral-400">{subtitle}</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 sm:p-7 shadow-2xl">
          {mode === 'register' && (
            <label className="mb-4 block text-sm text-neutral-300">
              Họ và tên
              <span className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-800 bg-black px-3">
                <UserRound className="h-4 w-4 text-neutral-500" />
                <input value={fullName} onChange={e => setFullName(e.target.value)} required autoComplete="name" className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Tên hiển thị" />
              </span>
            </label>
          )}

          {mode !== 'updatePassword' && (
            <label className="mb-4 block text-sm text-neutral-300">
              Email
              <span className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-800 bg-black px-3">
                <Mail className="h-4 w-4 text-neutral-500" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="w-full bg-transparent py-3 text-sm outline-none" placeholder="you@example.com" />
              </span>
            </label>
          )}

          {mode !== 'reset' && (
            <label className="mb-2 block text-sm text-neutral-300">
              {mode === 'updatePassword' ? 'Mật khẩu mới' : 'Mật khẩu'}
              <span className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-800 bg-black px-3">
                <LockKeyhole className="h-4 w-4 text-neutral-500" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Tối thiểu 8 ký tự" />
              </span>
            </label>
          )}

          {mode === 'updatePassword' && (
            <label className="mt-4 block text-sm text-neutral-300">
              Nhập lại mật khẩu mới
              <span className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-800 bg-black px-3">
                <LockKeyhole className="h-4 w-4 text-neutral-500" />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Nhập lại mật khẩu" />
              </span>
            </label>
          )}

          {mode === 'login' && (
            <div className="mb-5 text-right">
              <button type="button" onClick={() => changeMode('reset')} className="text-xs text-neutral-400 hover:text-white">Quên mật khẩu?</button>
            </div>
          )}

          {message && <p role="status" className="mb-4 rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-xs leading-5 text-emerald-300">{message}</p>}
          {errorMessage && <p role="alert" className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs leading-5 text-red-300">{errorMessage}</p>}

          <button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? <Activity className="h-4 w-4 animate-spin" /> : mode === 'reset' ? <KeyRound className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? 'Đang xử lý…' : title}
          </button>

          {mode === 'login' && (
            <div className="mt-5">
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-800" /></div>
                <div className="relative flex justify-center"><span className="bg-neutral-950 px-3 text-xs text-neutral-500">Hoặc tiếp tục với</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => signInWithProvider('github')} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                  <Github className="h-4 w-4" /> GitHub
                </button>
                <button type="button" onClick={() => signInWithProvider('google')} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                  <Chrome className="h-4 w-4" /> Google
                </button>
              </div>
            </div>
          )}

          {mode !== 'updatePassword' && (
            <div className="mt-5 border-t border-neutral-800 pt-4 text-center text-sm text-neutral-400">
              {mode === 'login' ? (
                <>Chưa có tài khoản? <button type="button" onClick={() => changeMode('register')} className="font-semibold text-white hover:underline">Đăng ký</button></>
              ) : (
                <button type="button" onClick={() => changeMode('login')} className="font-semibold text-white hover:underline">Quay lại đăng nhập</button>
              )}
            </div>
          )}
        </form>
        <p className="mt-5 text-center text-[11px] leading-5 text-neutral-600">Mật khẩu được mã hóa bcrypt và xác thực qua Auth.js.</p>
      </section>
    </main>
  );
};
