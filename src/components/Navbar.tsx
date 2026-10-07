import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Bell, Sun, Moon, Menu, X, Search, Lock, ChevronDown, Activity, Mic, Rocket, ExternalLink } from 'lucide-react';
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
  onOpenDeployments?: () => void;
}

const VelclawMark = () => (
  <div className="velclaw-brand-mark" aria-label="Velclaw">
    <svg className="velclaw-brand-v" viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id="velclaw-v-gradient" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse"><stop stopColor="#60a5fa"/><stop offset=".48" stopColor="#6366f1"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
      <path d="M4 6h6.1l5.9 12.4L21.9 6H28L18.7 25.5a3 3 0 0 1-5.4 0L4 6Z" />
    </svg>
  </div>
);

export const Navbar: React.FC<NavbarProps> = ({
  nodes, selectedNode, onSelectNode, isDarkMode, onToggleTheme, isTwoFactorActive,
  onOpenSecurityModal, onOpenFcmModal, onOpenVoiceAssistant, alerts,
  isMobileMenuOpen, onToggleMobileMenu, onOpenDeployments,
}) => {
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState(false);
  const [timeString, setTimeString] = useState('');
  useEffect(() => {
    const updateTime=()=>setTimeString(new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}));
    updateTime(); const timer=setInterval(updateTime,1000); return ()=>clearInterval(timer);
  }, []);
  const unreadAlerts=alerts.filter(a=>!a.resolved);

  return (
    <header className="vc-topbar sticky top-0 z-50 w-full border-b text-slate-100">
      <div className="flex h-[64px] items-center gap-3 px-3 sm:px-5">
        <button id="mobile-menu-btn" onClick={onToggleMobileMenu} className="lg:hidden rounded-md p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Toggle menu">
          {isMobileMenuOpen?<X className="h-5 w-5"/>:<Menu className="h-5 w-5"/>}
        </button>

        <a href="/" className="flex shrink-0 items-center gap-2.5 no-underline">
          <VelclawMark/>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5"><span className="text-[14px] font-semibold tracking-[-.03em] text-zinc-100">VelclawHost</span><span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-500">Cloud</span></div>
          </div>
        </a>

        <div className="hidden h-5 w-px bg-zinc-800 sm:block"/>
        <div className="hidden min-w-0 items-center gap-1 text-[11px] text-zinc-500 md:flex">
          <span>Workspace</span><span className="text-zinc-700">/</span><span className="text-zinc-300">Production</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative hidden lg:block">
            <button onClick={()=>setIsNodeDropdownOpen(!isNodeDropdownOpen)} className="flex h-8 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 text-[11px] font-medium text-zinc-300 hover:border-zinc-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>
              <span className="max-w-[180px] truncate">{selectedNode.hostname}</span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-600"/>
            </button>
            {isNodeDropdownOpen && <div className="absolute right-0 z-[100] mt-2 w-72 rounded-lg border border-zinc-800 bg-[#09090b] p-1.5 shadow-2xl">
              <div className="px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[.14em] text-zinc-600">Production host</div>
              {nodes.map(node=><button key={node.id} onClick={()=>{onSelectNode(node);setIsNodeDropdownOpen(false)}} className={['flex w-full items-center justify-between rounded-md p-2.5 text-left text-xs',node.id===selectedNode.id?'bg-violet-500/10 text-violet-300':'text-zinc-300 hover:bg-zinc-900'].join(' ')}>
                <div><div className="font-mono">{node.hostname}</div><div className="mt-0.5 text-[10px] text-zinc-600">{node.region}</div></div>
                <span className="font-mono text-[10px] text-emerald-400">{node.ipV4}</span>
              </button>)}
            </div>}
          </div>

          <div className="hidden xl:flex items-center gap-1.5 px-2 text-[10px] font-mono text-zinc-600"><Activity className="h-3 w-3 text-violet-400"/>{timeString} ICT</div>
          <button className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200" title="Search"><Search className="h-3.5 w-3.5"/></button>
          {onOpenDeployments && <button onClick={onOpenDeployments} className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-900 hover:bg-white"><Rocket className="h-3.5 w-3.5"/><span>New</span></button>}
          <button id="security-2fa-navbar-btn" onClick={onOpenSecurityModal} className={['flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium',isTwoFactorActive?'border-emerald-500/20 bg-emerald-500/5 text-emerald-300':'border-amber-500/25 bg-amber-500/5 text-amber-300'].join(' ')} title="Two-factor authentication">
            {isTwoFactorActive?<ShieldCheck className="h-3.5 w-3.5"/>:<ShieldAlert className="h-3.5 w-3.5"/>}<span className="hidden sm:inline">{isTwoFactorActive?'2FA':'2FA'}</span>
          </button>
          {onOpenVoiceAssistant && <button onClick={onOpenVoiceAssistant} className="hidden md:flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white" title="DevOps AI"><Mic className="h-3.5 w-3.5"/></button>}
          <button id="fcm-notification-navbar-btn" onClick={onOpenFcmModal} className="relative flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white" title="Notifications">
            <Bell className="h-3.5 w-3.5"/>{unreadAlerts.length>0&&<span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white">{unreadAlerts.length}</span>}
          </button>
          <button id="theme-toggle-navbar-btn" onClick={onToggleTheme} className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white" title={isDarkMode?'Light mode':'Dark mode'}>
            {isDarkMode?<Sun className="h-3.5 w-3.5 text-amber-300"/>:<Moon className="h-3.5 w-3.5 text-cyan-400"/>}
          </button>
          <div className="ml-1 hidden h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-[9px] font-semibold text-zinc-300 sm:flex">VH</div>
        </div>
      </div>
    </header>
  );
};
