import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, BadgeCheck, Boxes, Check, ChevronRight, CircleAlert,
  Cloud, Code2, Database, ExternalLink, Github, Globe2, KeyRound, LockKeyhole,
  Plug, RefreshCw, Search, ShieldCheck, Sparkles, Terminal, Workflow, Zap
} from 'lucide-react';

type Plugin = {
  id: string;
  name: string;
  description: string;
  category: string;
  connected: boolean;
  capability: string;
};
type Repo = { id: string; url: string; branch: string; name: string; connectedAt: string };
type Tool = { id: string; name: string; description: string; dangerous: boolean; available: boolean };
type Session = { id?: string; email?: string; role?: string; provider?: string };

const fallbackPlugins: Plugin[] = [
  { id: 'github', name: 'GitHub', description: 'Repository access, branches, commits and deployment sources.', category: 'Source control', connected: true, capability: 'repo' },
  { id: 'gitlab', name: 'GitLab', description: 'Connect projects and automate branch-based delivery.', category: 'Source control', connected: false, capability: 'repo' },
  { id: 'playwright', name: 'Playwright', description: 'Browser automation and end-to-end test tooling.', category: 'Testing', connected: false, capability: 'browser' },
  { id: 'postgres', name: 'PostgreSQL', description: 'Database inspection and migration workflows.', category: 'Data', connected: false, capability: 'database' },
  { id: 'context7', name: 'Context7', description: 'Version-aware documentation context for SDKs and frameworks.', category: 'AI & MCP', connected: false, capability: 'mcp' },
  { id: 'filesystem', name: 'Filesystem', description: 'Scoped project workspace file operations.', category: 'Developer tools', connected: false, capability: 'filesystem' },
];
const fallbackTools: Tool[] = [
  { id: 'repo-import', name: 'Repository importer', description: 'Import a public Git repository into an isolated workspace.', dangerous: false, available: true },
  { id: 'project-shell', name: 'Project shell', description: 'Run allowlisted commands inside the selected workspace.', dangerous: true, available: false },
  { id: 'build', name: 'Build runner', description: 'Run the detected project build command.', dangerous: false, available: false },
  { id: 'test', name: 'Test runner', description: 'Run the detected test suite.', dangerous: false, available: false },
  { id: 'logs', name: 'Runtime logs', description: 'Inspect deployment and runtime output.', dangerous: false, available: true },
  { id: 'mcp', name: 'MCP tools', description: 'Expose approved MCP integrations to a project runtime.', dangerous: true, available: false },
];

const categoryIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  'Source control': Github, Testing: Activity, Data: Database, 'AI & MCP': Sparkles,
  'Developer tools': Code2,
};

export const DeveloperToolsTab: React.FC = () => {
  const [plugins, setPlugins] = useState<Plugin[]>(fallbackPlugins);
  const [tools, setTools] = useState<Tool[]>(fallbackTools);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [view, setView] = useState<'marketplace' | 'installed' | 'access'>('marketplace');
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'error'>('loading');
  const [runtime, setRuntime] = useState<{ reachable?: boolean; docker?: boolean; build?: boolean; workspace?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [output, setOutput] = useState('');
  const [command, setCommand] = useState('git status --short');

  const load = useCallback(async () => {
    setMessage('');
    try {
      const [meResponse, pluginsResponse] = await Promise.all([
        fetch('/api/v1/auth/me', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/v1/developer/plugins', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      if (meResponse.status === 401 || pluginsResponse.status === 401) {
        setAuthState('unauthenticated');
        setSession(null);
        return;
      }
      if (!meResponse.ok || !pluginsResponse.ok) throw new Error('Không thể tải trạng thái Plugins từ Control Plane.');
      const [me, payload] = await Promise.all([meResponse.json(), pluginsResponse.json()]);
      setSession(me.user || null);
      setAuthState('authenticated');
      if (Array.isArray(payload.plugins)) setPlugins(payload.plugins);
      if (Array.isArray(payload.tools)) setTools(payload.tools);
      if (Array.isArray(payload.repositories)) setRepos(payload.repositories);
      setRuntime(payload.runtime || null);
    } catch (error) {
      setAuthState('error');
      setMessage(error instanceof Error ? error.message : 'Không thể kết nối Control Plane.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connectedCount = useMemo(() => plugins.filter(plugin => plugin.connected).length, [plugins]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(plugins.map(plugin => plugin.category)))], [plugins]);
  const visiblePlugins = useMemo(() => plugins.filter(plugin => {
    const matchesSearch = (plugin.name + ' ' + plugin.description).toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || plugin.category === category;
    const matchesView = view !== 'installed' || plugin.connected;
    return matchesSearch && matchesCategory && matchesView;
  }), [plugins, search, category, view]);

  const connectRepo = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/v1/developer/repositories', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: repoUrl, branch }),
      });
      const payload = await response.json();
      if (response.status === 401) { setAuthState('unauthenticated'); throw new Error('Phiên đăng nhập đã hết hạn.'); }
      if (!response.ok) throw new Error(payload.error || 'Import repository thất bại.');
      setRepos(current => [payload.repository, ...current]);
      setRepoUrl('');
      setMessage('Repository đã được kết nối vào workspace.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import repository thất bại.');
    } finally { setBusy(false); }
  };

  const runCommand = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/v1/developer/shell', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd: repos[0]?.id }),
      });
      const payload = await response.json();
      if (response.status === 401) { setAuthState('unauthenticated'); throw new Error('Phiên đăng nhập đã hết hạn.'); }
      setOutput(payload.output || payload.error || '');
      if (!response.ok) throw new Error(payload.error || 'Command failed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Command failed.');
    } finally { setBusy(false); }
  };

  const signIn = () => {
    window.location.assign('/login?callbackUrl=' + encodeURIComponent('/dashboard#/plugins-tools'));
  };

  return (
    <div className="space-y-5 text-zinc-100">
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#09090b] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-violet-300"><Boxes className="h-4 w-4" /> VelclawHost Platform</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Plugins</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-400">Một điểm quản lý các tích hợp, công cụ và quyền truy cập API của workspace. Phiên người dùng được xác thực bởi Auth.js hiện có.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-300"><LockKeyhole className="h-3 w-3 text-emerald-400" /> Auth.js session</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-300"><ShieldCheck className="h-3 w-3 text-violet-300" /> Server-side authorization</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/60 px-3 py-2.5">
            <span className={'h-2 w-2 rounded-full ' + (authState === 'authenticated' ? 'bg-emerald-400' : authState === 'loading' ? 'bg-amber-400' : 'bg-rose-400')} />
            <div><div className="text-[10px] font-semibold text-zinc-200">{authState === 'authenticated' ? 'Session verified' : authState === 'loading' ? 'Checking session' : authState === 'unauthenticated' ? 'Sign-in required' : 'Control Plane unavailable'}</div><div className="mt-0.5 text-[9px] text-zinc-500">{session?.email || 'VelclawHost account'}</div></div>
            <button onClick={() => void load()} aria-label="Refresh plugin status" className="ml-2 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>

      {authState === 'unauthenticated' && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-4 w-4 text-amber-300" /><div><div className="text-xs font-semibold text-amber-100">Cần đăng nhập VelclawHost</div><p className="mt-1 text-[10px] text-amber-200/70">API Plugins được bảo vệ bằng phiên Auth.js. Đăng nhập để xem tích hợp và quyền của workspace.</p></div></div>
          <button onClick={signIn} className="rounded-lg bg-zinc-100 px-3 py-2 text-[10px] font-semibold text-zinc-900">Đăng nhập <ArrowUpRight className="ml-1 inline h-3 w-3" /></button>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Available plugins', value: String(plugins.length), icon: Plug },
          { label: 'Connected', value: String(connectedCount), icon: BadgeCheck },
          { label: 'API authorization', value: authState === 'authenticated' ? 'Active' : 'Protected', icon: KeyRound },
          { label: 'Runtime', value: runtime?.reachable ? 'Ready' : 'Standby', icon: Cloud },
        ].map(item => <div key={item.label} className="rounded-xl border border-zinc-800 bg-[#09090b] p-4"><div className="flex items-center justify-between text-[10px] text-zinc-500"><span>{item.label}</span><item.icon className="h-4 w-4 text-zinc-500" /></div><div className="mt-2 text-xl font-semibold tracking-tight text-white">{item.value}</div></div>)}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-[#09090b] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-black p-1">
            {(['marketplace', 'installed', 'access'] as const).map(item => <button key={item} onClick={() => setView(item)} className={'rounded-md px-3 py-2 text-[10px] font-semibold capitalize transition ' + (view === item ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200')}>{item === 'marketplace' ? 'Marketplace' : item === 'installed' ? 'My plugins' : 'API access'}</button>)}
          </div>
          {view !== 'access' && <div className="relative min-w-[190px] flex-1 sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search plugins..." className="h-9 w-full rounded-lg border border-zinc-800 bg-black pl-9 pr-3 text-[10px] text-zinc-200 outline-none focus:border-violet-500/50" /></div>}
        </div>

        {view !== 'access' ? <>
          <div className="mt-4 flex flex-wrap gap-2">{categories.map(item => <button key={item} onClick={() => setCategory(item)} className={'rounded-full border px-3 py-1.5 text-[9px] ' + (category === item ? 'border-violet-500/40 bg-violet-500/10 text-violet-200' : 'border-zinc-800 text-zinc-500 hover:text-zinc-200')}>{item}</button>)}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visiblePlugins.map(plugin => {
              const Icon = categoryIcon[plugin.category] || Plug;
              return <article key={plugin.id} className="rounded-xl border border-zinc-800 bg-black/60 p-4 transition hover:border-zinc-700">
                <div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900"><Icon className="h-5 w-5 text-zinc-300" /></div><span className={'rounded-full border px-2 py-1 text-[9px] ' + (plugin.connected ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-500')}>{plugin.connected ? 'Connected' : 'Not connected'}</span></div>
                <h3 className="mt-3 text-sm font-semibold text-white">{plugin.name}</h3><p className="mt-1 min-h-9 text-[10px] leading-4 text-zinc-500">{plugin.description}</p>
                <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3"><span className="text-[9px] text-zinc-600">{plugin.category}</span><span className="inline-flex items-center gap-1 text-[9px] text-zinc-500">{plugin.connected ? <><Check className="h-3 w-3 text-emerald-400" /> Authorized</> : 'Authorization not configured'}</span></div>
              </article>;
            })}
          </div>
          {visiblePlugins.length === 0 && <div className="py-12 text-center text-xs text-zinc-600">Không tìm thấy plugin phù hợp.</div>}
        </> : <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-black/50 p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><h3 className="text-xs font-semibold text-white">Auth.js authorization</h3></div><p className="mt-2 text-[10px] leading-5 text-zinc-500">Dashboard gọi API cùng origin bằng session cookie HttpOnly. Control Plane xác minh session ở server-side; trình duyệt không nhận AUTH_SECRET hoặc service token.</p><dl className="mt-4 space-y-2 text-[10px]"><div className="flex justify-between border-b border-zinc-800 pb-2"><dt className="text-zinc-600">Session</dt><dd className="text-zinc-300">{authState === 'authenticated' ? 'Verified' : 'Not verified'}</dd></div><div className="flex justify-between border-b border-zinc-800 pb-2"><dt className="text-zinc-600">Account</dt><dd className="text-zinc-300">{session?.email || '—'}</dd></div><div className="flex justify-between"><dt className="text-zinc-600">Role</dt><dd className="capitalize text-zinc-300">{session?.role || '—'}</dd></div></dl></div>
          <div className="rounded-xl border border-zinc-800 bg-black/50 p-4"><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-violet-300" /><h3 className="text-xs font-semibold text-white">API credential policy</h3></div><ul className="mt-3 space-y-2 text-[10px] leading-5 text-zinc-500"><li>• API requests use the existing Auth.js session.</li><li>• Authorization is enforced by protected server routes.</li><li>• Secrets and provider tokens stay server-side.</li><li>• Plugin-specific OAuth grants and scopes must be configured before a connector can be enabled.</li></ul></div>
        </div>}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-zinc-800 bg-[#09090b] p-5">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Connect repository</h3><p className="mt-1 text-[10px] text-zinc-500">Import source code into an isolated VelclawHost workspace.</p></div><Github className="h-5 w-5 text-zinc-500" /></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_110px_auto]"><input value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="https://github.com/org/repository" className="h-10 rounded-lg border border-zinc-800 bg-black px-3 text-[10px] text-zinc-200 outline-none focus:border-violet-500/50" /><input value={branch} onChange={event => setBranch(event.target.value)} placeholder="main" className="h-10 rounded-lg border border-zinc-800 bg-black px-3 text-[10px] text-zinc-200 outline-none focus:border-violet-500/50" /><button disabled={busy || !repoUrl || authState !== 'authenticated'} onClick={() => void connectRepo()} className="rounded-lg bg-zinc-100 px-4 text-[10px] font-semibold text-zinc-900 disabled:opacity-40">Import</button></div>
          {repos.length > 0 && <div className="mt-4 space-y-2">{repos.map(repo => <div key={repo.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-black p-3"><GitHubMark /><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-semibold text-zinc-200">{repo.name}</div><div className="truncate text-[9px] text-zinc-600">{repo.url} · {repo.branch}</div></div><BadgeCheck className="h-4 w-4 text-emerald-400" /></div>)}</div>}
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-[#09090b] p-5"><div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-cyan-300" /><h3 className="text-sm font-semibold text-white">Runtime status</h3></div><div className="mt-4 grid grid-cols-2 gap-2">{[['Worker', runtime?.reachable], ['Docker', runtime?.docker], ['Build', runtime?.build], ['Workspace', runtime?.workspace]].map(([label, ready]) => <div key={String(label)} className="rounded-lg border border-zinc-800 bg-black p-3"><div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div><div className={'mt-1 text-[10px] font-semibold ' + (ready ? 'text-emerald-300' : 'text-zinc-600')}>{ready ? 'READY' : 'STANDBY'}</div></div>)}</div></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#050505]">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div className="flex items-center gap-2"><Terminal className="h-4 w-4 text-emerald-400" /><span className="text-xs font-semibold text-zinc-200">Workspace command</span></div><span className="text-[9px] text-zinc-600">Restricted runtime</span></div>
        <div className="p-4"><div className="flex gap-2"><span className="font-mono text-xs text-emerald-400">$</span><input value={command} onChange={event => setCommand(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void runCommand(); }} className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-zinc-200 outline-none" placeholder="git status --short" /><button disabled={busy || !repos.length || authState !== 'authenticated'} onClick={() => void runCommand()} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[10px] font-semibold text-zinc-300 disabled:opacity-30">{busy ? 'Running…' : 'Run'}</button></div>{message && <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-300">{message}</div>}<pre className="mt-4 min-h-28 overflow-auto rounded-lg border border-zinc-800 bg-black p-4 font-mono text-[10px] leading-5 text-zinc-400">{output || 'Chọn một repository để mở workspace command.'}</pre></div>
      </section>
    </div>
  );
};

const GitHubMark: React.FC = () => <Globe2 className="h-4 w-4 shrink-0 text-violet-300" />;
