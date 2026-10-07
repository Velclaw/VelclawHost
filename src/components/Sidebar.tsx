import React, { useState } from 'react';
import {
  LayoutDashboard, Rocket, Globe, LineChart, BellRing, Database, FileText,
  ShieldCheck, Webhook, Download, Sparkles, ChevronLeft, ChevronRight,
  Activity, Settings, ChevronsUpDown, Wrench, Search, Server, Layers3
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

type NavItem = {
  id: TabType;
  label: string;
  icon: React.ComponentType<{className?: string}>;
  badge?: string | number;
  tone?: string;
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isMobileMenuOpen,
  onCloseMobileMenu,
  unreadAlertCount,
  onOpenVoiceAssistant,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const groups: { label: string; items: NavItem[] }[] = [
    { label: 'Workspace', items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'deployments', label: 'Deployments', icon: Rocket, badge: 'LIVE', tone: 'text-violet-300 bg-violet-500/10 border-violet-500/20' },
      { id: 'domains', label: 'Domains', icon: Globe },
    ]},
    { label: 'Infrastructure', items: [
      { id: 'dns-ssl', label: 'DNS & SSL', icon: Server },
      { id: 'metrics-charts', label: 'Analytics', icon: LineChart },
      { id: 'alerts', label: 'Alerts', icon: BellRing, badge: unreadAlertCount || undefined, tone: 'text-rose-300 bg-rose-500/10 border-rose-500/20' },
      { id: 'logs', label: 'Logs', icon: FileText },
      { id: 'db-optimizer', label: 'Storage & Database', icon: Database },
    ]},
    { label: 'Developer', items: [
      { id: 'api-integration', label: 'Integrations', icon: Webhook },
      { id: 'plugins-tools', label: 'Plugins & Tools', icon: Wrench, badge: 'NEW', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20' },
      { id: 'security-2fa', label: 'Security', icon: ShieldCheck },
      { id: 'reports', label: 'Usage & Reports', icon: Download },
    ]},
  ];

  const click = (id: TabType) => {
    onSelectTab(id);
    onCloseMobileMenu();
  };

  return (
    <>
      {isMobileMenuOpen && (
        <div onClick={onCloseMobileMenu} className="vh-mobile-scrim fixed inset-0 z-[65] lg:hidden" />
      )}

      <aside className={[
        'vh-sidebar vc-platform-sidebar fixed lg:sticky left-0 z-[70] flex-shrink-0 transition-[width,transform] duration-200',
        collapsed ? 'w-[68px]' : 'w-[248px]',
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="vh-sidebar-top">
            <div className="vh-project-switcher">
              <div className="vh-project-logo">
                <img src="/assets/velclawhost-logo.svg" alt="VelclawHost" />
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="vh-project-name">VelclawHost</div>
                  <div className="vh-project-meta"><span /> production</div>
                </div>
              )}
              {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-600" />}
            </div>

            {!collapsed && (
              <div className="vh-project-context">
                <Layers3 className="h-3.5 w-3.5" />
                <span>Infrastructure workspace</span>
                <span className="ml-auto font-mono text-[9px] text-zinc-600">VH</span>
              </div>
            )}

            <button
              onClick={() => setCollapsed(v => !v)}
              className="vh-collapse"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <><ChevronLeft className="h-3.5 w-3.5" /><span>Collapse</span></>}
            </button>
          </div>

          <nav className="vh-sidebar-nav flex-1 overflow-y-auto">
            <button className="vh-search-button" onClick={() => click('overview')}>
              <Search className="h-3.5 w-3.5" />
              {!collapsed && <><span>Search</span><kbd>⌘K</kbd></>}
            </button>

            {groups.map(group => (
              <div key={group.label} className="vh-nav-group">
                {!collapsed && <div className="vh-nav-label">{group.label}</div>}
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={'sidebar-nav-' + item.id}
                      onClick={() => click(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={['vh-nav-item', active ? 'is-active' : '', collapsed ? 'is-collapsed' : ''].join(' ')}
                    >
                      <Icon className="vh-nav-icon" />
                      {!collapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge !== undefined && (
                            <span className={['vh-nav-badge', item.tone || ''].join(' ')}>{item.badge}</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="vh-sidebar-bottom">
            {onOpenVoiceAssistant && (
              <button
                onClick={() => { onOpenVoiceAssistant(); onCloseMobileMenu(); }}
                className={['vh-ai-button', collapsed ? 'justify-center' : ''].join(' ')}
                title="Velclaw DevOps AI"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                {!collapsed && <span><strong>Velclaw AI</strong><small>Open DevOps assistant</small></span>}
              </button>
            )}

            {!collapsed && (
              <div className="vh-account-card">
                <div className="vh-avatar">VH</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-medium text-zinc-200">Velclaw account</div>
                  <div className="truncate text-[9px] text-zinc-600">Owner · authenticated</div>
                </div>
                <Settings className="h-3.5 w-3.5 text-zinc-600" />
              </div>
            )}

            <div className={['vh-health-card', collapsed ? 'is-collapsed' : ''].join(' ')}>
              {collapsed ? (
                <Activity className="h-4 w-4 text-emerald-400" />
              ) : (
                <>
                  <div className="vh-health-row"><span>Production</span><span className="vh-health"><i /> Healthy</span></div>
                  <div className="vh-health-host">velclawhost.onrender.com</div>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
