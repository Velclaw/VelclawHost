import React, { useState } from 'react';
import {
  LayoutDashboard, Rocket, Globe, LineChart, BellRing, Database, FileText,
  ShieldCheck, Webhook, Download, Sparkles, ChevronLeft, ChevronRight,
  Activity, Settings, ChevronsUpDown
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
type NavItem = { id: TabType; label: string; icon: React.ComponentType<{className?: string}>; badge?: string | number; tone?: string; };

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab, isMobileMenuOpen, onCloseMobileMenu, unreadAlertCount, onOpenVoiceAssistant }) => {
  const [collapsed, setCollapsed] = useState(false);
  const groups: {label:string; items:NavItem[]}[] = [
    { label:'Project', items:[
      {id:'overview',label:'Overview',icon:LayoutDashboard},
      {id:'deployments',label:'Deployments',icon:Rocket,badge:'LIVE',tone:'text-violet-300 bg-violet-500/10 border-violet-500/20'},
      {id:'domains',label:'Domains',icon:Globe},
    ]},
    { label:'Infrastructure', items:[
      {id:'dns-ssl',label:'DNS & SSL',icon:Globe},
      {id:'metrics-charts',label:'Analytics',icon:LineChart},
      {id:'alerts',label:'Alerts',icon:BellRing,badge:unreadAlertCount || undefined,tone:'text-rose-300 bg-rose-500/10 border-rose-500/20'},
      {id:'logs',label:'Logs',icon:FileText},
      {id:'db-optimizer',label:'Storage & Database',icon:Database},
    ]},
    { label:'Developer', items:[
      {id:'api-integration',label:'Integrations',icon:Webhook},
      {id:'security-2fa',label:'Security',icon:ShieldCheck},
      {id:'reports',label:'Usage & Reports',icon:Download},
    ]}
  ];
  const click=(id:TabType)=>{onSelectTab(id);onCloseMobileMenu();};
  return <>
    {isMobileMenuOpen && <div onClick={onCloseMobileMenu} className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm lg:hidden"/>}
    <aside className={[
      'vc-platform-sidebar fixed lg:sticky top-[64px] left-0 z-[70] h-[calc(100vh-64px)] flex-shrink-0 border-r bg-[#050505] transition-[width,transform] duration-200',
      collapsed ? 'w-[64px]' : 'w-[224px]',
      isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    ].join(' ')}>
      <div className="flex h-full flex-col">
        <div className="border-b border-zinc-800/80 p-2">
          <div className="vc-workspace-switcher">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-700 bg-zinc-950">
              <img src="/assets/velclawhost-logo.svg" alt="VelclawHost" className="h-full w-full object-cover" />
            </div>
            {!collapsed && <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-zinc-100">VelclawHost</div>
              <div className="mt-0.5 flex items-center gap-1 text-[9px] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> Production</div>
            </div>}
            {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-600"/>}
          </div>
          <button onClick={()=>setCollapsed(v=>!v)} className="vc-sidebar-collapse mt-2 flex w-full items-center justify-center rounded-md border border-zinc-800/80 bg-zinc-950/70 py-1.5 text-zinc-500 hover:text-zinc-200" title={collapsed?'Expand sidebar':'Collapse sidebar'}>
            {collapsed ? <ChevronRight className="h-3.5 w-3.5"/> : <><ChevronLeft className="h-3.5 w-3.5"/><span className="ml-1 text-[9px]">Collapse</span></>}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {groups.map(group=><div key={group.label} className="mb-4">
            {!collapsed && <div className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[.14em] text-zinc-600">{group.label}</div>}
            {group.items.map(item=>{
              const Icon=item.icon; const active=activeTab===item.id;
              return <button key={item.id} id={"sidebar-nav-"+item.id} onClick={()=>click(item.id)} title={collapsed?item.label:undefined}
                className={['group relative mb-0.5 flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[11px] font-medium transition-all',
                  active?'border-zinc-700/90 bg-zinc-900 text-zinc-50 shadow-[inset_2px_0_0_#8b5cf6]':'border-transparent text-zinc-500 hover:border-zinc-800 hover:bg-zinc-900/70 hover:text-zinc-200',
                  collapsed?'justify-center':''].join(' ')}>
                <Icon className={['h-4 w-4 shrink-0',active?'text-violet-400':'text-zinc-500 group-hover:text-zinc-300'].join(' ')}/>
                {!collapsed && <><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.badge!==undefined && <span className={['rounded border px-1.5 py-0.5 text-[8px] font-bold',item.tone||'border-zinc-700 bg-zinc-800 text-zinc-400'].join(' ')}>{item.badge}</span>}</>}
              </button>
            })}
          </div>)}
        </nav>
        <div className="border-t border-zinc-800/80 p-2">
          {onOpenVoiceAssistant && <button onClick={()=>{onOpenVoiceAssistant();onCloseMobileMenu()}} className={['mb-2 flex w-full items-center gap-2 rounded-md border border-violet-500/20 bg-violet-500/[.05] px-2.5 py-2 text-left hover:border-violet-500/40',collapsed?'justify-center':''].join(' ')} title="DevOps AI">
            <Sparkles className="h-4 w-4 shrink-0 text-violet-400"/>{!collapsed&&<span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold text-violet-300">DevOps AI</span><span className="block text-[9px] text-zinc-600">Open assistant</span></span>}
          </button>}
          {!collapsed && <div className="mb-2 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300">VH</div>
            <div className="min-w-0 flex-1"><div className="truncate text-[10px] font-medium text-zinc-300">Velclaw account</div><div className="truncate text-[9px] text-zinc-600">Owner</div></div>
            <Settings className="h-3.5 w-3.5 text-zinc-600"/>
          </div>}
          <div className={['rounded-md border border-zinc-800 bg-zinc-950 p-2',collapsed?'flex justify-center':''].join(' ')}>
            {collapsed ? <Activity className="h-4 w-4 text-emerald-400"/> : <><div className="flex items-center justify-between text-[9px]"><span className="text-zinc-500">Production</span><span className="flex items-center gap-1 text-emerald-400"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>Healthy</span></div><div className="mt-2 truncate font-mono text-[9px] text-zinc-600">velclawhost.onrender.com</div></>}
          </div>
        </div>
      </div>
    </aside>
  </>;
};
