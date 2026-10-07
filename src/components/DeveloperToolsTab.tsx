import React,{useEffect,useMemo,useState} from 'react';
import {Boxes,CheckCircle2,Code2,ExternalLink,GitBranch,Github,Link2,Loader2,Package,Play,Plug,Zap,Terminal,RefreshCw} from 'lucide-react';

type Plugin={id:string;name:string;description:string;category:string;connected:boolean;capability:string};
type Repo={id:string;url:string;branch:string;name:string;connectedAt:string};
type Tool={id:string;name:string;description:string;dangerous:boolean;available:boolean};

const fallbackPlugins:Plugin[]=[
 {id:'github',name:'GitHub',description:'Import repository, branches, commits and deployment source.',category:'Source Control',connected:true,capability:'repo'},
 {id:'gitlab',name:'GitLab',description:'Connect GitLab projects and deploy from branches.',category:'Source Control',connected:false,capability:'repo'},
 {id:'playwright',name:'Playwright',description:'Browser automation and smoke-test tooling.',category:'Testing',connected:false,capability:'browser'},
 {id:'postgres',name:'PostgreSQL',description:'Database inspection and migration tooling.',category:'Data',connected:false,capability:'database'},
 {id:'context7',name:'Context7',description:'Documentation context for development tools and SDKs.',category:'AI / MCP',connected:false,capability:'mcp'},
 {id:'filesystem',name:'Filesystem',description:'Project workspace file operations through the runtime worker.',category:'Developer',connected:false,capability:'filesystem'}
];
const fallbackTools:Tool[]=[
 {id:'repo-import',name:'Repository Importer',description:'Clone a public Git repository into an isolated project workspace.',dangerous:false,available:true},
 {id:'project-shell',name:'Project Shell',description:'Run an allowlisted bash command inside the selected project workspace.',dangerous:true,available:false},
 {id:'build',name:'Build',description:'Run the detected project build command in the runtime workspace.',dangerous:false,available:false},
 {id:'test',name:'Test',description:'Run the detected test command in the runtime workspace.',dangerous:false,available:false},
 {id:'logs',name:'Runtime Logs',description:'Stream deployment and runtime logs.',dangerous:false,available:true},
 {id:'mcp',name:'MCP Tools',description:'Expose approved MCP integrations to a project runtime.',dangerous:true,available:false}
];

export const DeveloperToolsTab:React.FC=()=>{
 const [plugins,setPlugins]=useState<Plugin[]>(fallbackPlugins),[tools,setTools]=useState<Tool[]>(fallbackTools);
 const [repos,setRepos]=useState<Repo[]>([]),[repoUrl,setRepoUrl]=useState(''),[branch,setBranch]=useState('main');
 const [command,setCommand]=useState('git status --short'),[output,setOutput]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [runtime,setRuntime]=useState<any>(null);
 const load=async()=>{
  try{const r=await fetch('/api/v1/developer/plugins',{cache:'no-store'});if(r.ok){const p=await r.json();if(Array.isArray(p.plugins))setPlugins(p.plugins);if(Array.isArray(p.tools))setTools(p.tools);if(Array.isArray(p.repositories))setRepos(p.repositories);setRuntime(p.runtime)}}catch{}
 };
 useEffect(()=>{void load()},[]);
 const connectedCount=useMemo(()=>plugins.filter(p=>p.connected).length,[plugins]);
 const connectRepo=async()=>{
  setBusy(true);setMessage('');setOutput('');
  try{const r=await fetch('/api/v1/developer/repositories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:repoUrl,branch})});const p=await r.json();if(!r.ok)throw new Error(p.error||'Repository import failed');setRepos(x=>[p.repository,...x]);setMessage('Repository đã được kết nối vào workspace.');}
  catch(e){setMessage(e instanceof Error?e.message:'Repository import failed')}finally{setBusy(false)}
 };
 const runCommand=async()=>{
  setBusy(true);setMessage('');
  try{const r=await fetch('/api/v1/developer/shell',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,cwd:repos[0]?.id})});const p=await r.json();setOutput(p.output||p.error||'');if(!r.ok)throw new Error(p.error||'Command failed')}
  catch(e){setMessage(e instanceof Error?e.message:'Command failed')}finally{setBusy(false)}
 };
 const togglePlugin=(id:string)=>setPlugins(p=>p.map(x=>x.id===id?{...x,connected:!x.connected}:x));
 return <div className="space-y-6">
  <section className="rounded-2xl border border-zinc-800 bg-[#09090b] p-5">
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div><div className="flex items-center gap-2 text-xs font-semibold text-zinc-300"><Boxes className="h-4 w-4 text-cyan-400"/> Developer Platform</div><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Plugins &amp; Tools</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">Kết nối source control, MCP và project runtime từ một workspace duy nhất. Thiết kế theo workflow dashboard hiện đại: project → source → runtime → tools.</p></div>
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[10px] text-zinc-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>{connectedCount} plugins connected</div>
   </div>
  </section>

  <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
   <div className="rounded-2xl border border-zinc-800 bg-[#09090b] p-5">
    <div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Connect a repository</h3><p className="mt-1 text-[11px] text-zinc-500">Public Git repositories can be imported directly. Private repositories require a server-side GitHub token.</p></div><Github className="h-5 w-5 text-zinc-500"/></div>
    <div className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
     <input value={repoUrl} onChange={e=>setRepoUrl(e.target.value)} placeholder="https://github.com/org/project" className="h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-200 outline-none focus:border-violet-500/60"/>
     <input value={branch} onChange={e=>setBranch(e.target.value)} placeholder="main" className="h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-200 outline-none focus:border-violet-500/60"/>
     <button disabled={busy||!repoUrl} onClick={connectRepo} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 text-xs font-semibold text-zinc-900 disabled:opacity-40"><Link2 className="h-3.5 w-3.5"/> Import</button>
    </div>
    {repos.length>0&&<div className="mt-4 space-y-2">{repos.map(r=><div key={r.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3"><GitBranch className="h-4 w-4 text-violet-400"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-zinc-200">{r.name}</div><div className="truncate font-mono text-[10px] text-zinc-600">{r.url} · {r.branch}</div></div><CheckCircle2 className="h-4 w-4 text-emerald-400"/></div>)}</div>}
   </div>
   <div className="rounded-2xl border border-zinc-800 bg-[#09090b] p-5"><div className="flex items-center gap-2 text-xs font-semibold text-white"><Zap className="h-4 w-4 text-amber-400"/> Runtime</div><div className="mt-4 grid grid-cols-2 gap-2">{[['Worker',runtime?.reachable?'READY':'OFF'],['Docker',runtime?.docker?'READY':'OFF'],['Build',runtime?.build?'READY':'OFF'],['Workspace',runtime?.workspace?'READY':'EPHEMERAL']].map(([a,b])=><div key={a} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"><div className="text-[9px] uppercase tracking-wider text-zinc-600">{a}</div><div className="mt-1 text-xs font-semibold text-zinc-200">{b}</div></div>)}</div><p className="mt-3 text-[10px] leading-4 text-zinc-600">Shell chỉ được mở khi runtime workspace đã được bật; control-plane không thực thi bash tùy ý.</p></div>
  </section>

  <section className="grid gap-4 xl:grid-cols-2">
   <div className="rounded-2xl border border-zinc-800 bg-[#09090b] p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Plugins</h3><p className="text-[10px] text-zinc-600">Source control, testing, data and MCP connectors.</p></div><Plug className="h-4 w-4 text-cyan-400"/></div><div className="space-y-2">{plugins.map(p=><div key={p.id} className="flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-3"><div className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900"><Package className="h-4 w-4 text-zinc-400"/></div><div className="min-w-0 flex-1"><div className="text-xs font-medium text-zinc-200">{p.name}</div><div className="mt-0.5 text-[10px] text-zinc-600">{p.description}</div></div><button onClick={()=>togglePlugin(p.id)} className={`rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${p.connected?'border-emerald-500/20 bg-emerald-500/10 text-emerald-300':'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>{p.connected?'Connected':'Connect'}</button></div>)}</div></div>
   <div className="rounded-2xl border border-zinc-800 bg-[#09090b] p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Tools</h3><p className="text-[10px] text-zinc-600">Project-aware operations exposed by VelclawHost.</p></div><Code2 className="h-4 w-4 text-violet-400"/></div><div className="space-y-2">{tools.map(t=><div key={t.id} className="flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs font-medium text-zinc-200">{t.name}{t.dangerous&&<span className="rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[8px] text-amber-300">guarded</span>}</div><div className="mt-0.5 text-[10px] text-zinc-600">{t.description}</div></div><span className={`text-[9px] ${t.available?'text-emerald-400':'text-zinc-700'}`}>{t.available?'READY':'RUNTIME REQUIRED'}</span></div>)}</div></div>
  </section>

  <section className="rounded-2xl border border-zinc-800 bg-[#050505] overflow-hidden">
   <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div className="flex items-center gap-2"><Terminal className="h-4 w-4 text-emerald-400"/><span className="text-xs font-semibold text-zinc-200">Project Shell</span></div><button onClick={load} className="text-zinc-600 hover:text-zinc-300"><RefreshCw className="h-3.5 w-3.5"/></button></div>
   <div className="p-4"><div className="flex gap-2"><span className="font-mono text-xs text-emerald-400">$</span><input value={command} onChange={e=>setCommand(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runCommand()}} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-200 outline-none" placeholder="git status --short"/><button disabled={busy||!repos.length} onClick={runCommand} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[10px] font-semibold text-zinc-300 disabled:opacity-30"><Play className="h-3 w-3"/>{busy?'Running':'Run'}</button></div>{message&&<div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-300">{message}</div>}<pre className="mt-4 min-h-40 overflow-auto rounded-lg border border-zinc-800 bg-black p-4 font-mono text-[10px] leading-5 text-zinc-400">{output||'Connect a repository to open an isolated project shell.'}</pre></div>
  </section>
 </div>
};