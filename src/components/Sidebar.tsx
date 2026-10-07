import React, { useState } from 'react';
import {
  LayoutDashboard, Rocket, Globe, LineChart, BellRing, Database, FileText,
  ShieldCheck, Webhook, Download, Mic, Sparkles, Network, ChevronLeft,
  ChevronRight, Settings2, FolderKanban, Activity
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
  activeTab, onSelectTab, isMobileMenuOpen, onCloseMobileMenu, unreadAlertCount, onOpenVoiceAssistant
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const groups: {label:string; items:NavItem[]}[] = [
    {
      label: 'Project',
      items: [
        { id:'overview', label:'Overview', icon:LayoutDashboard },
        { id:'deployments', label:'Deployments', icon:Rocket, badge:'LIVE', tone:'text-violet-300 bg-violet-500/10 border-violet-500/20' },
        { id:'domains', label:'Domains', icon:Network },
      ]
    },
    {
      label: 'Infrastructure',
      items: [
        { id:'dns-ssl', label:'Domains & DNS', icon:Globe },
        { id:'metrics-charts', label:'Observability', icon:LineChart },
        { id:'alerts', label:'Alerts', icon:BellRing, badge:unreadAlertCount || undefined, tone:'text-rose-300 bg-rose-500/10 border-rose-500/20' },
        { id:'logs', label:'Logs', icon:FileText },
        { id:'db-optimizer', label:'Database', icon:Database },
      ]
    },
    {
      label: 'Developer',
      items: [
        { id:'api-integration', label:'API & Integrations', icon:Webhook },
        { id:'security-2fa', label:'Security', icon:ShieldCheck },
        { id:'reports', label:'Reports', icon:Download },
      ]
    }
  ];

  const click=(id:TabType)=>{onSelectTab(id);onCloseMobileMenu();};

  return <>
    {isMobileMenuOpen && <div onClick={onCloseMobileMenu} className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"/>}
    <aside className={[
      'vc-platform-sidebar fixed lg:sticky top-[64px] left-0 z-40 h-[calc(100vh-64px)] flex-shrink-0',
      'border-r border-zinc-800/90 bg-[#050506] transition-[width,transform] duration-200 shadow-none',
      collapsed ? 'w-16' : 'w-60',
      isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    ].join(' ')}>
      <div className="flex h-full flex-col">
        <div className="border-b border-zinc-800/80 p-2">
          <button onClick={()=>setCollapsed(v=>!v)} className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-left hover:border-zinc-700" title={collapsed?'Expand sidebar':'Collapse sidebar'}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-700 bg-zinc-950"><img src="/assets/velclawhost-logo.svg" alt="" className="h-full w-full object-cover" /></div>
            {!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-zinc-100">VelclawHost</div><div className="truncate text-[9px] text-zinc-500">Production</div></div>}
            {!collapsed && <ChevronLeft className="h-3.5 w-3.5 text-zinc-500"/>}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {groups.map(group=><div key={group.label} className="mb-4">
            {!collapsed && <div className="px-2 pb-1.5 pt-2 text-[9px] font-semibold uppercase tracking-[.16em] text-zinc-600">{group.label}</div>}
            {group.items.map(item=>{
              const Icon=item.icon; const active=activeTab===item.id;
              return <button key={item.id} id={`sidebar-nav-${item.id}`} onClick={()=>click(item.id)}
                title={collapsed?item.label:undefined}
                className={`group relative mb-0.5 flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[11px] font-medium transition-colors ${active?'border-zinc-700 bg-zinc-900 text-zinc-50':'border-transparent text-zinc-500 hover:border-zinc-800 hover:bg-zinc-900/70 hover:text-zinc-200'} ${collapsed?'justify-center':''}`}>
                {active && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-indigo-400"/>}
                <Icon className={`h-4 w-4 shrink-0 ${active?'text-indigo-400':'text-zinc-500 group-hover:text-zinc-300'}`}/>
                {!collapsed && <><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.badge!==undefined && <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold ${item.tone||'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>{item.badge}</span>}</>}
              </button>
            })}
          </div>)}
        </nav>

        <div className="border-t border-zinc-800/80 p-2">
          {onOpenVoiceAssistant && <button onClick={()=>{onOpenVoiceAssistant();onCloseMobileMenu()}} className={`mb-2 flex w-full items-center gap-2 rounded-md border border-indigo-500/20 bg-indigo-500/[.06] px-2.5 py-2 text-left hover:border-indigo-500/40 ${collapsed?'justify-center':''}`} title="DevOps AI">
            <Mic className="h-4 w-4 shrink-0 text-indigo-400"/>{!collapsed&&<span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold text-indigo-300">DevOps AI</span><span className="block text-[9px] text-zinc-600">Voice assistant</span></span>}<Sparkles className="h-3 w-3 text-violet-400"/>
          </button>}
          <div className={`rounded-md border border-zinc-800 bg-zinc-950 p-2 ${collapsed?'flex justify-center':''}`}>
            {collapsed ? <Activity className="h-4 w-4 text-emerald-400"/> : <><div className="flex items-center justify-between text-[9px]"><span className="text-zinc-500">Production</span><span className="flex items-center gap-1 text-emerald-400"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>Healthy</span></div><div className="mt-2 font-mono text-[9px] text-zinc-600">velclawhost.onrender.com</div></>}
          </div>
        </div>
      </div>
    </aside>
  </>;
};
