import React, { useState, useEffect } from 'react';
import { 
  Server, 
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
  CheckCircle2,
  AlertTriangle,
  Mic
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
  const [isAlertDropdownOpen, setIsAlertDropdownOpen] = useState(false);
  const [timeString, setTimeString] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const unreadAlerts = alerts.filter(a => !a.resolved);

  return (
    <header className="sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors duration-200 border-slate-800 bg-slate-950/85 text-slate-100 dark:border-slate-800 dark:bg-slate-950/85">
      <div className="flex h-16 items-center justify-between px-3 sm:px-6">
        {/* Left: Brand & Mobile menu toggle */}
        <div className="flex items-center gap-3">
          <button
            id="mobile-menu-btn"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-base sm:text-lg bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                  VELCLAW
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  HOSTING
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                Production Hostname Monitoring
              </p>
            </div>
          </div>
        </div>

        {/* Center: Hostname Selector & Status Pills */}
        <div className="hidden md:flex items-center gap-2">
          {/* Hostname dropdown */}
          <div className="relative">
            <button
              id="hostname-selector-dropdown-btn"
              onClick={() => setIsNodeDropdownOpen(!isNodeDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-slate-700 bg-slate-900/90 text-slate-200 hover:border-cyan-500/50 hover:bg-slate-800 transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="truncate max-w-[180px] lg:max-w-[240px] text-cyan-300 font-semibold">
                {selectedNode.hostname}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isNodeDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-2xl z-50">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 py-1">
                  Chọn Production Hostname
                </div>
                {nodes.map(node => (
                  <button
                    key={node.id}
                    onClick={() => {
                      onSelectNode(node);
                      setIsNodeDropdownOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                      node.id === selectedNode.id 
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' 
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="font-mono font-medium">{node.hostname}</div>
                      <div className="text-[10px] text-slate-400">{node.region}</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                      {node.ipV4}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Secure indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>HTTPS 301 / TLS 1.3</span>
          </div>

          {/* DNS indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Globe className="w-3 h-3 text-cyan-400" />
            <span>DNSSEC Active</span>
          </div>
        </div>

        {/* Right: 2FA Status, FCM Push, Clock, Theme, Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Real-time Clock */}
          <div className="hidden xl:flex items-center gap-1.5 text-xs font-mono text-slate-400 px-2.5 py-1 rounded-md bg-slate-900/60 border border-slate-800">
            <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span>{timeString} (ICT)</span>
          </div>

          {/* 2FA Security Button */}
          <button
            id="security-2fa-navbar-btn"
            onClick={onOpenSecurityModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              isTwoFactorActive
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40 shadow-sm shadow-emerald-900/20'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/40 animate-pulse'
            }`}
            title="Xác thực 2 yếu tố (2FA/MFA)"
          >
            {isTwoFactorActive ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">2FA Hoạt Động</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Kích Hoạt 2FA</span>
              </>
            )}
          </button>

          {/* Gemini AI Voice Assistant Button */}
          {onOpenVoiceAssistant && (
            <button
              id="voice-assistant-navbar-btn"
              onClick={onOpenVoiceAssistant}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-900/20 transition-all group"
              title="Trợ lý Giọng nói AI (Gemini Live)"
            >
              <Mic className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline font-mono">Voice AI</span>
            </button>
          )}

          {/* FCM Push Notification button with badge */}
          <div className="relative">
            <button
              id="fcm-notification-navbar-btn"
              onClick={onOpenFcmModal}
              className="relative p-2 rounded-lg text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
              title="Thông báo đẩy FCM"
            >
              <Bell className="w-4 h-4" />
              {unreadAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-bounce">
                  {unreadAlerts.length}
                </span>
              )}
            </button>
          </div>

          {/* Theme Toggle (Dark / Light) */}
          <button
            id="theme-toggle-navbar-btn"
            onClick={onToggleTheme}
            className="p-2 rounded-lg text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
            title={isDarkMode ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
            aria-label="Toggle theme"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-amber-300 hover:rotate-45 transition-transform" />
            ) : (
              <Moon className="w-4 h-4 text-cyan-400" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
