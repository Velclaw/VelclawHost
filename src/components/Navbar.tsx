import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Bell,
  Sun,
  Moon,
  Menu,
  X,
  Globe,
  Lock,
  ChevronDown,
  Activity,
  Mic,
} from 'lucide-react';
import { HostNode, SystemAlert } from '../types';

interface NavbarProps {
  nodes: HostNode[];
  selectedNode: HostNode;
  onSelectNode: (node: HostNode) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isTwoFactorActive: boolean;
  onOpenSecurityModal: () => void;
  onOpenFcmModal: () => void;
  onOpenVoiceAssistant?: () => void;
  alerts: SystemAlert[];
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

const VelclawMark = () => (
  <div className="velclaw-brand-mark" aria-label="Velclaw">
    <svg className="velclaw-brand-v" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="velclaw-v-gradient" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60a5fa" />
          <stop offset=".48" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <path d="M4 6h6.1l5.9 12.4L21.9 6H28L18.7 25.5a3 3 0 0 1-5.4 0L4 6Z" />
    </svg>
  </div>
);

export const Navbar: React.FC<NavbarProps> = ({
  nodes,
  selectedNode,
  onSelectNode,
  isDarkMode,
  onToggleTheme,
  isTwoFactorActive,
  onOpenSecurityModal,
  onOpenFcmModal,
  onOpenVoiceAssistant,
  alerts,
  isMobileMenuOpen,
  onToggleMobileMenu,
}) => {
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState(false);
  const [timeString, setTimeString] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const unreadAlerts = alerts.filter(a => !a.resolved);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/92 text-slate-100 backdrop-blur-xl">
      <div className="flex h-[68px] items-center justify-between px-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            id="mobile-menu-btn"
            onClick={onToggleMobileMenu}
            className="lg:hidden rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-white"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-3">
            <VelclawMark />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-[-0.03em] text-white sm:text-lg">VELCLAW</span>
                <span className="hidden border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-300 sm:inline-block">
                  HOST
                </span>
              </div>
              <p className="hidden text-[10px] font-medium tracking-[0.04em] text-slate-500 sm:block">
                DOMAIN · DNS · SSL · DEPLOYMENT
              </p>
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <div className="relative">
            <button
              id="hostname-selector-dropdown-btn"
              onClick={() => setIsNodeDropdownOpen(!isNodeDropdownOpen)}
              className="flex items-center gap-2 border border-slate-700/90 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:border-indigo-500/60 hover:bg-slate-800"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,.75)]" />
              <span className="max-w-[180px] truncate font-mono font-semibold text-indigo-300 lg:max-w-[240px]">
                {selectedNode.hostname}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            </button>

            {isNodeDropdownOpen && (
              <div className="absolute left-0 z-50 mt-2 w-72 border border-slate-700 bg-slate-950 p-2 shadow-2xl">
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Production Hostname
                </div>
                {nodes.map(node => (
                  <button
                    key={node.id}
                    onClick={() => {
                      onSelectNode(node);
                      setIsNodeDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg p-2 text-left text-xs transition-colors ${
                      node.id === selectedNode.id
                        ? 'border border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
                        : 'border border-transparent text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="font-mono font-medium">{node.hostname}</div>
                      <div className="text-[10px] text-slate-500">{node.region}</div>
                    </div>
                    <span className="bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                      {node.ipV4}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
            <Lock className="h-3 w-3" />
            <span>TLS 1.3</span>
          </div>

          <div className="flex items-center gap-1.5 border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1 text-[10px] font-semibold text-cyan-400">
            <Globe className="h-3 w-3" />
            <span>DNS</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1.5 border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[10px] font-mono text-slate-500 xl:flex">
            <Activity className="h-3 w-3 text-cyan-400" />
            <span>{timeString} ICT</span>
          </div>

          <button
            id="security-2fa-navbar-btn"
            onClick={onOpenSecurityModal}
            className={`flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium transition-all ${
              isTwoFactorActive
                ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40'
                : 'border-amber-500/40 bg-amber-950/40 text-amber-300'
            }`}
            title="Xác thực 2 yếu tố"
          >
            {isTwoFactorActive ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> : <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />}
            <span className="hidden sm:inline">{isTwoFactorActive ? '2FA' : 'Kích hoạt 2FA'}</span>
          </button>

          {onOpenVoiceAssistant && (
            <button
              id="voice-assistant-navbar-btn"
              onClick={onOpenVoiceAssistant}
              className="flex items-center gap-1.5 border border-indigo-500/35 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 transition-all hover:border-indigo-400/60 hover:bg-indigo-500/20"
              title="Trợ lý AI"
            >
              <Mic className="h-3.5 w-3.5 text-violet-400" />
              <span className="hidden sm:inline font-mono">AI</span>
            </button>
          )}

          <div className="relative">
            <button
              id="fcm-notification-navbar-btn"
              onClick={onOpenFcmModal}
              className="relative border border-slate-800 bg-slate-900 p-2 text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
              title="Thông báo"
            >
              <Bell className="h-4 w-4" />
              {unreadAlerts.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                  {unreadAlerts.length}
                </span>
              )}
            </button>
          </div>

          <button
            id="theme-toggle-navbar-btn"
            onClick={onToggleTheme}
            className="border border-slate-800 bg-slate-900 p-2 text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
            title={isDarkMode ? 'Chế độ Sáng' : 'Chế độ Tối'}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-cyan-400" />}
          </button>
        </div>
      </div>
    </header>
  );
};
