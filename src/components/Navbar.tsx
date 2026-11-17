import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Bell, Sun, Moon, Menu, X, Search, ChevronDown, Activity, Rocket, UserRound } from 'lucide-react';
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
  alerts: SystemAlert[];
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  onOpenDeployments?: () => void;
  authUserEmail?: string | null;
  onOpenAccount: () => void;
}

const VelclawMark = () => (
  <div className="vh-brand-mark" aria-label="VelClaw">
    <img src={`${import.meta.env.BASE_URL}velclaw-icon-dark.svg`} alt="" />
  </div>
);

export const Navbar: React.FC<NavbarProps> = ({
  nodes, selectedNode, onSelectNode, isDarkMode, onToggleTheme, isTwoFactorActive,
  onOpenSecurityModal, onOpenFcmModal, alerts,
  isMobileMenuOpen, onToggleMobileMenu, onOpenDeployments, authUserEmail, onOpenAccount,
}) => {
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState(false);
  const [timeString, setTimeString] = useState('');
  useEffect(() => {
    const updateTime = () => setTimeString(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const unreadAlerts = alerts.filter(a => !a.resolved);

  return (
    <header className="vh-topbar vc-topbar sticky top-0 z-50 w-full">
      <div className="vh-topbar-inner">
        <button id="mobile-menu-btn" onClick={onToggleMobileMenu} className="vh-mobile-menu lg:hidden" aria-label="Toggle navigation">
          {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <a href={import.meta.env.BASE_URL} className="vh-brand-link" aria-label="VelClaw home">
          <VelclawMark />
          <div className="hidden sm:block">
            <div className="vh-brand-title">VelClaw</div>
            <div className="vh-brand-sub">CODE. INNOVATE. ELEVATE.</div>
          </div>
        </a>

        <div className="vh-top-divider hidden md:block" />
        <div className="vh-breadcrumb-top hidden md:flex">
          <span>Workspace</span><b>/</b><strong>Control Plane</strong>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden xl:flex vh-clock"><Activity className="h-3 w-3" />{timeString} ICT</div>

          <div className="relative hidden lg:block">
            <button
              onClick={() => setIsNodeDropdownOpen(v => !v)}
              className="vh-node-switcher"
              aria-expanded={isNodeDropdownOpen}
            >
              <span className="vh-online-dot" />
              <span className="max-w-[180px] truncate">{selectedNode.hostname}</span>
              <ChevronDown className="h-3 w-3 text-zinc-600" />
            </button>
            {isNodeDropdownOpen && (
              <div className="vh-node-menu">
                <div className="vh-menu-label">Control plane nodes</div>
                {nodes.map(node => (
                  <button key={node.id} onClick={() => { onSelectNode(node); setIsNodeDropdownOpen(false); }} className="vh-node-option">
                    <div><strong>{node.hostname}</strong><small>{node.region}</small></div>
                    <code>{node.ipV4}</code>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="vh-icon-button hidden lg:flex" title="Search" onClick={() => document.querySelector('.vh-search-button')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <Search className="h-3.5 w-3.5" />
          </button>

          {onOpenDeployments && (
            <button onClick={onOpenDeployments} className="vh-new-button">
              <Rocket className="h-3.5 w-3.5" /><span>New deployment</span>
            </button>
          )}

          <button
            id="security-2fa-navbar-btn"
            onClick={onOpenSecurityModal}
            className={['vh-icon-button', isTwoFactorActive ? 'is-secure' : 'is-warning'].join(' ')}
            title="Two-factor authentication"
          >
            {isTwoFactorActive ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline text-[10px]">2FA</span>
          </button>

          <button id="fcm-notification-navbar-btn" onClick={onOpenFcmModal} className="vh-icon-button relative" title="Notifications">
            <Bell className="h-3.5 w-3.5" />
            {unreadAlerts.length > 0 && <span className="vh-notification-dot">{unreadAlerts.length}</span>}
          </button>

          <button id="theme-toggle-navbar-btn" onClick={onToggleTheme} className="vh-icon-button" title={isDarkMode ? 'Light mode' : 'Dark mode'}>
            {isDarkMode ? <Sun className="h-3.5 w-3.5 text-amber-300" /> : <Moon className="h-3.5 w-3.5 text-cyan-300" />}
          </button>

          <button type="button" onClick={onOpenAccount} className="vh-icon-button max-w-[180px]" title={authUserEmail || "Sign in to VelclawHost"} aria-label={authUserEmail ? `Account ${authUserEmail}` : "Sign in"}>
            <UserRound className="h-3.5 w-3.5" />
            <span className="hidden md:inline max-w-[120px] truncate text-[10px]">{authUserEmail ? authUserEmail.split("@")[0] : "Sign in"}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
