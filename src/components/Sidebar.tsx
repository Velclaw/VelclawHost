import React from 'react';
import { 
  LayoutDashboard, 
  Globe, 
  LineChart, 
  BellRing, 
  Database, 
  FileText, 
  ShieldCheck, 
  Webhook, 
  Download,
  Server,
  Cpu,
  HardDrive,
  Mic,
  Sparkles,
  Network
} from 'lucide-react';
import { TabType } from '../types';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  unreadAlertCount: number;
  onOpenVoiceAssistant?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isMobileMenuOpen,
  onCloseMobileMenu,
  unreadAlertCount,
  onOpenVoiceAssistant,
}) => {
  const menuItems: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string | number; badgeColor?: string }[] = [
    { id: 'overview', label: 'Tổng quan máy chủ', icon: LayoutDashboard },
    { 
      id: 'domains', 
      label: 'Quản lý tên miền', 
      icon: Network, 
      badge: 'CFD', 
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
    },
    { id: 'dns-ssl', label: 'DNS & HTTPS / SSL', icon: Globe },
    { id: 'metrics-charts', label: 'Biểu đồ Recharts', icon: LineChart },
    { 
      id: 'alerts', 
      label: 'Cảnh báo CPU / RAM', 
      icon: BellRing, 
      badge: unreadAlertCount > 0 ? unreadAlertCount : undefined,
      badgeColor: 'bg-rose-500 text-white'
    },
    { id: 'db-optimizer', label: 'Tối ưu hóa CSDL', icon: Database },
    { id: 'logs', label: 'Nhật ký sự kiện', icon: FileText },
    { id: 'security-2fa', label: 'Bảo mật 2FA / MFA', icon: ShieldCheck },
    { id: 'api-integration', label: 'Tích hợp API & Agent', icon: Webhook },
    { id: 'reports', label: 'Xuất báo cáo PDF/CSV', icon: Download },
  ];

  const handleItemClick = (tabId: TabType) => {
    onSelectTab(tabId);
    onCloseMobileMenu();
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobileMenuOpen && (
        <div 
          onClick={onCloseMobileMenu}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside 
        className={`fixed lg:sticky top-16 left-0 z-30 h-[calc(100vh-4rem)] w-64 flex-shrink-0 flex flex-col justify-between border-r border-slate-800 bg-slate-950/95 transition-transform duration-200 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Hệ thống & Giám sát
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-nav-${item.id}`}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30 shadow-sm shadow-cyan-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Voice Assistant Trigger in Sidebar */}
          {onOpenVoiceAssistant && (
            <div className="pt-2">
              <button
                id="sidebar-voice-assistant-btn"
                onClick={() => {
                  onOpenVoiceAssistant();
                  onCloseMobileMenu();
                }}
                className="w-full p-2.5 rounded-xl bg-gradient-to-r from-cyan-900/40 to-blue-900/30 border border-cyan-500/30 hover:border-cyan-500/60 text-left transition-all flex items-center gap-2.5 group shadow-sm shadow-cyan-950/40"
              >
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform flex-shrink-0">
                  <Mic className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
                    <span>Trợ Lý Giọng Nói</span>
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Gemini Live AI DevOps
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Host node quick status card at bottom */}
        <div className="p-3 border-t border-slate-800/80 m-2 rounded-xl bg-slate-900/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <span className="font-semibold text-slate-300">Cluster Status</span>
            <span className="flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              99.99% SLA
            </span>
          </div>
          <div className="space-y-1 text-[10px] font-mono text-slate-400">
            <div className="flex justify-between">
              <span>Primary Node:</span>
              <span className="text-slate-200 font-semibold">Tokyo-TY2</span>
            </div>
            <div className="flex justify-between">
              <span>Security Tier:</span>
              <span className="text-cyan-400">TLS 1.3 / HSTS</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
