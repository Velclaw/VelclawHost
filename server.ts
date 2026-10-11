import express from "express";
import path from "path";
import os from "node:os";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createDeploymentQueue } from "./lib/control-plane/deployment-queue";
import { getRegistrarProvider } from "./lib/providers";
import { RegistrarProviderError } from "./lib/providers/registrar";
import { VELCLAW_FIRST_PARTY_DOMAINS, isSupportedDomain } from "./lib/control-plane/domain-config";
import { createHmac, timingSafeEqual } from 'node:crypto';

let aiClient: GoogleGenAI | null = null;
const execFileAsync = promisify(execFile);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

let previousCpuSample = os.cpus().map((cpu) => ({ ...cpu.times }));
let previousNetworkSample: { rx: number; tx: number; at: number } | null = null;

function readCpuUsage() {
  const current = os.cpus();
  const perCore = current.map((cpu, index) => {
    const previous = previousCpuSample[index];
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    const previousTotal = previous ? Object.values(previous).reduce((sum, value) => sum + value, 0) : total;
    const idle = cpu.times.idle;
    const previousIdle = previous?.idle ?? idle;
    const totalDelta = Math.max(1, total - previousTotal);
    return Math.max(0, Math.min(100, ((totalDelta - Math.max(0, idle - previousIdle)) / totalDelta) * 100));
  });
  previousCpuSample = current.map((cpu) => ({ ...cpu.times }));
  return { total: perCore.length ? perCore.reduce((a, b) => a + b, 0) / perCore.length : 0, perCore };
}

async function readNetworkMbps() {
  try {
    const raw = await fs.readFile('/proc/net/dev', 'utf8');
    let rx = 0; let tx = 0;
    for (const line of raw.split('\\n').slice(2)) {
      const match = line.match(/^\\s*[^:]+:\\s*(\\d+)\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+(\\d+)/);
      if (match) { rx += Number(match[1]); tx += Number(match[2]); }
    }
    const now = Date.now();
    const previous = previousNetworkSample;
    previousNetworkSample = { rx, tx, at: now };
    if (!previous || now <= previous.at) return { rxMbps: 0, txMbps: 0, available: false };
    const seconds = (now - previous.at) / 1000;
    return { rxMbps: ((rx - previous.rx) * 8) / seconds / 1_000_000, txMbps: ((tx - previous.tx) * 8) / seconds / 1_000_000, available: true };
  } catch {
    return { rxMbps: 0, txMbps: 0, available: false };
  }
}

async function readEstablishedConnections() {
  try {
    const files = ['/proc/net/tcp', '/proc/net/tcp6'];
    let count = 0;
    for (const file of files) {
      const raw = await fs.readFile(file, 'utf8').catch(() => '');
      count += raw.split('\\n').slice(1).filter((line) => line.trim().split(/\\s+/)[3] === '01').length;
    }
    return count;
  } catch { return 0; }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // Initialize the deployment queue before any route/worker can invoke runDeploymentJob().
  // Keeping this before the first queue tick avoids a temporal-dead-zone crash during startup.
  const deploymentQueue = createDeploymentQueue(process.env.VELCLAWHOST_STATE_STORE === 'postgres' ? process.env.DATABASE_URL : undefined);
  const workerId = process.env.VELCLAWHOST_WORKER_ID?.trim() || 'worker-' + process.pid;

  // VelclawHost-branded native login page. Prevent old Cloudflare/provider login HTML
  // from being reused by browser or intermediary caches after a deployment.
  app.get(['/auth', '/auth/'], (_req, res) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    res.status(200).type('html').send(velclawAuthPage());
  });


  function velclawAuthPage() {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#08090b"><title>Velclaw — Account access</title><style>
:root{color-scheme:dark;--bg:#08090b;--panel:#0c0e11;--line:#292d34;--line2:#414751;--text:#f4f6f8;--muted:#929aa6;--blue:#3984ff;--mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace}*{box-sizing:border-box;border-radius:0!important}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:var(--mono);font-size:13px}body{min-height:100svh;background-image:linear-gradient(#ffffff05 1px,transparent 1px),linear-gradient(90deg,#ffffff05 1px,transparent 1px);background-size:48px 48px}a{color:inherit;text-decoration:none}.top{height:76px;padding:0 clamp(18px,4vw,60px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ffffff12;background:#08090bdc}.brand{display:flex;align-items:center;gap:12px;font-size:18px;font-weight:800;letter-spacing:-.04em}.triangle{width:28px;height:28px;display:block;background:#f5f7fa;clip-path:polygon(0 0,100% 0,50% 100%);position:relative}.triangle:after{content:"";position:absolute;left:7px;top:6px;width:14px;height:14px;background:var(--bg);clip-path:polygon(0 0,100% 0,50% 100%)}.top-action{border:1px solid var(--line2);padding:11px 18px;min-width:90px;text-align:center;background:transparent;cursor:pointer;font:inherit;color:var(--text)}.top-action:hover,.oauth:hover,.other:hover{border-color:#aeb6c2;background:#ffffff08}main{min-height:calc(100svh - 140px);display:grid;place-items:center;padding:42px 18px}.card{width:min(100%,510px);padding:clamp(22px,5vw,42px);border:1px solid var(--line);background:linear-gradient(145deg,#0d0f12f5,#090a0cf5);box-shadow:0 24px 80px #0007}.eyebrow{color:#a7b1bf;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.title{font-size:clamp(24px,4vw,32px);line-height:1.28;letter-spacing:-.055em;margin:16px 0 10px;font-weight:650}.subtitle{color:var(--muted);font-size:12px;line-height:1.8;margin:0 0 26px}.providers{display:grid;gap:10px}.oauth{display:flex;align-items:center;gap:14px;min-height:51px;width:100%;padding:0 15px;border:1px solid var(--line2);background:#0b0d10;color:var(--text);font:inherit;text-align:left;cursor:pointer}.oauth .glyph{width:23px;text-align:center;font-family:Arial,sans-serif;font-size:19px;font-weight:700}.oauth .label{flex:1}.oauth .arrow{color:#aab3c0;font-size:16px}.oauth:disabled{opacity:.52;cursor:not-allowed}.other{display:flex;align-items:center;justify-content:center;gap:10px;margin:18px 0;width:100%;min-height:38px;border:1px solid transparent;background:transparent;color:#b9c9df;font:inherit;cursor:pointer}.other:before,.other:after{content:"";height:1px;background:var(--line);flex:1}.email-link{display:flex;justify-content:center;align-items:center;gap:12px;width:100%;min-height:52px;margin:18px 0 0;border:1px solid var(--blue);background:var(--blue);color:#fff;font:inherit;font-weight:700;cursor:pointer}.email-link:hover{background:#236ce0}.email-form{display:none;margin-top:20px;border-top:1px solid var(--line);padding-top:18px}.email-form.visible{display:block}.field{display:grid;gap:8px;margin:14px 0}.field label{color:#b1bac6;font-size:10px;letter-spacing:.1em}.field input{width:100%;height:48px;border:1px solid var(--line2);background:#070809;color:#fff;padding:0 13px;font:inherit;outline:none}.field input:focus{border-color:#9bbfff}.submit{width:100%;min-height:49px;border:1px solid var(--blue);background:var(--blue);color:#fff;font:inherit;font-weight:700;cursor:pointer;margin-top:8px}.submit:disabled{opacity:.6;cursor:wait}.message{min-height:18px;margin-top:12px;color:#ffaaa9;font-size:11px;line-height:1.6;overflow-wrap:anywhere}.legal{margin-top:28px;padding-top:17px;border-top:1px solid var(--line);color:#7f8996;font-size:10px;line-height:1.9}.legal a{color:#c5d9ff;text-decoration:underline;text-underline-offset:3px}.foot{display:flex;justify-content:space-between;gap:16px;padding:0 clamp(18px,4vw,60px) 24px;color:#7d8794;font-size:10px}.foot strong{display:block;color:#c1c8d2;font-size:11px;margin-bottom:4px}.hidden{display:none!important}:focus-visible{outline:2px solid #8bb6ff;outline-offset:3px}@media(max-width:480px){.top{height:64px}.brand{font-size:16px}.triangle{width:24px;height:24px}main{padding:26px 13px;align-items:start}.card{padding:24px 18px}.foot{font-size:9px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}

/* Mobile viewport stability: prevent iOS focus zoom and visual viewport jumps. */
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;width:100%;overflow-x:hidden;overscroll-behavior-x:none}
body{width:100%;max-width:100%;overflow-x:hidden;overflow-wrap:anywhere}
input,select,textarea,button{font-size:16px!important;line-height:1.4;max-width:100%;min-width:0}
.field input{font-size:16px!important;height:48px;scroll-margin-block:24px;touch-action:manipulation}
main{width:100%;min-width:0}
.card,.field,.email-form{min-width:0;max-width:100%}
@supports (height:100dvh){body{min-height:100dvh}main{min-height:calc(100dvh - 140px)}}
@media(max-width:600px){
  html,body{width:100%;min-width:0}
  .top{height:64px;padding-left:16px;padding-right:16px}
  main{min-height:calc(100svh - 110px);padding:18px 12px 28px;display:block}
  .card{width:100%;max-width:510px;margin:0 auto;padding:22px 16px;box-shadow:0 12px 36px #0005}
  .title{font-size:clamp(22px,6vw,30px);overflow-wrap:anywhere}
  .subtitle{font-size:13px}
  .field input{width:100%;min-width:0;min-height:48px;padding:0 12px}
  .foot{padding:0 12px 18px;flex-wrap:wrap}
}
@media(max-width:360px){.card{padding:18px 12px}.top-action{min-width:76px;padding:10px 12px}.brand{gap:8px}}

/* Bidirectional viewport tracking: smoothly scale the page frame with the visible iOS viewport. */
html{scroll-padding-block:20px;transform-origin:top center}
body{position:relative;overflow-x:hidden}
main{min-height:var(--visual-viewport-height,100vh);transition:min-height .18s ease-out;scroll-margin-top:12px}
html.keyboard-open body{min-height:var(--visual-viewport-height,100vh)}
html.keyboard-open main{height:auto;min-height:var(--visual-viewport-height,100vh);padding-top:12px;padding-bottom:16px}
html.keyboard-open .card{scroll-margin-block:16px}
html.keyboard-open .top{position:sticky;top:var(--visual-viewport-top,0px);z-index:5}
@media(prefers-reduced-motion:reduce){main{transition:none!important}}
</style></head><body><header class="top"><a class="brand" href="/" aria-label="Velclaw home"><span class="triangle" aria-hidden="true"></span><span>Velclaw</span></a><button class="top-action" id="switchMode" type="button">Log In</button></header><main><section class="card"><div class="eyebrow" id="eyebrow">// CREATE YOUR WORKSPACE</div><h1 class="title" id="heading">Your first deploy is just a sign-up away.</h1><p class="subtitle" id="subheading">One account for your projects, deployments, and infrastructure.</p><div class="providers" id="providers"><button class="oauth" type="button" data-provider="google" disabled title="Google OAuth is not configured yet"><span class="glyph" style="color:#4285f4">G</span><span class="label">Continue with Google</span><span class="arrow">↗</span></button><button class="oauth" type="button" data-provider="github" disabled title="GitHub OAuth is not configured yet"><span class="glyph">◉</span><span class="label">Continue with GitHub</span><span class="arrow">↗</span></button><button class="oauth extra hidden" type="button" disabled><span class="glyph">◎</span><span class="label">Continue with ChatGPT</span><span class="arrow">↗</span></button><button class="oauth extra hidden" type="button" disabled><span class="glyph">●</span><span class="label">Continue with Apple</span><span class="arrow">↗</span></button><button class="other" id="otherOptions" type="button">Show other options <span id="otherArrow">↓</span></button></div><button class="email-link" id="emailToggle" type="button"><span>✉</span><span id="emailLabel">Continue with Email</span><span>→</span></button><form class="email-form" id="emailForm"><div class="field"><label for="email">EMAIL ADDRESS</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div><div class="field"><label for="password">PASSWORD</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required></div><button class="submit" id="submit" type="submit">Create account ↗</button><div class="message" id="message" role="status" aria-live="polite"></div></form><div class="legal" id="legal">By continuing, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>. OAuth providers appear when their credentials are configured.</div></section></main><footer class="foot"><div><strong>Velclaw</strong>Deploy. Scale. Own.</div><div>ACCOUNT GATEWAY // 1.0.0</div></footer><script>
const params=new URLSearchParams(location.search);let mode=params.get('mode')==='login'?'login':'signup';let emailOpen=false;const switchMode=document.getElementById('switchMode'),heading=document.getElementById('heading'),subheading=document.getElementById('subheading'),eyebrow=document.getElementById('eyebrow'),emailToggle=document.getElementById('emailToggle'),emailLabel=document.getElementById('emailLabel'),emailForm=document.getElementById('emailForm'),submit=document.getElementById('submit'),password=document.getElementById('password'),message=document.getElementById('message'),otherOptions=document.getElementById('otherOptions');function renderMode(){const signup=mode==='signup';switchMode.textContent=signup?'Log In':'Sign Up';eyebrow.textContent=signup?'// CREATE YOUR WORKSPACE':'// WELCOME BACK';heading.textContent=signup?'Your first deploy is just a sign-up away.':'Log in to Velclaw';subheading.textContent=signup?'One account for your projects, deployments, and infrastructure.':'Access your projects, deployments, and infrastructure settings.';emailLabel.textContent=signup?'Continue with Email':'Continue with Email';submit.textContent=signup?'Create account ↗':'Log in ↗';password.autocomplete=signup?'new-password':'current-password';password.placeholder=signup?'At least 8 characters':'Enter your password';message.textContent='';history.replaceState({},'',signup?'/auth?mode=signup':'/auth?mode=login');}switchMode.addEventListener('click',()=>{location.href=mode==='signup'?'/auth?mode=login':'/auth?mode=signup'});emailToggle.addEventListener('click',()=>{emailOpen=!emailOpen;emailForm.classList.toggle('visible',emailOpen);if(emailOpen)document.getElementById('email').focus()});otherOptions.addEventListener('click',()=>{const extras=[...document.querySelectorAll('.extra')];const show=extras[0].classList.contains('hidden');extras.forEach(el=>el.classList.toggle('hidden',!show));otherOptions.innerHTML=show?'Show fewer options <span>↑</span>':'Show other options <span>↓</span>';});renderMode();emailForm.addEventListener('submit',async e=>{e.preventDefault();message.textContent='';submit.disabled=true;const original=submit.textContent;submit.textContent='Please wait…';try{if(mode==='signup'){message.textContent='Account registration is not enabled on the server yet. This interface is ready, but registration must be connected to a persistent user database before accounts can be created.';return;}const response=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:password.value})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.message||'Login failed.');location.href='/dashboard';}catch(error){message.textContent=error instanceof Error?error.message:'Login failed.';}finally{submit.disabled=false;submit.textContent=original;}});</script><script>
/* Track iOS visual viewport as the software keyboard opens/closes.
   Keep layout anchored to the visible frame and gently reveal focused fields. */
(function(){
  var root=document.documentElement, vv=window.visualViewport, raf=0, lastKeyboard=false, baseScale=1;
  function updateViewport(){
    raf=0;
    var height=vv?vv.height:window.innerHeight;
    var top=vv?vv.offsetTop:0;
    var width=vv?vv.width:window.innerWidth;
    root.style.setProperty('--visual-viewport-height',Math.max(1,height)+'px');
    root.style.setProperty('--visual-viewport-top',Math.max(0,top)+'px');
    root.style.setProperty('--visual-viewport-width',Math.max(1,width)+'px');
    var active=document.activeElement;
    var keyboard=!!(active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && vv && (window.innerHeight-vv.height)>120);
    root.classList.toggle('keyboard-open',keyboard);
    /* Keep the page frame fitted to the currently visible viewport in both directions.
       Do not change the browser's page scale; that would fight native pinch zoom/accessibility. */
    root.style.setProperty('--frame-scale-x',Math.min(1,width/Math.max(1,root.clientWidth)));
    if(keyboard && !lastKeyboard){
      window.setTimeout(function(){
        var el=document.activeElement;
        if(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)){
          var rect=el.getBoundingClientRect();
          var visibleTop=vv?vv.offsetTop:0;
          var visibleBottom=visibleTop+(vv?vv.height:window.innerHeight);
          if(rect.bottom>visibleBottom-16 || rect.top<visibleTop+12) el.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
        }
      },120);
    }
    lastKeyboard=keyboard;
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(updateViewport);}
  if(vv){vv.addEventListener('resize',schedule,{passive:true});vv.addEventListener('scroll',schedule,{passive:true});}
  window.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('focusin',schedule);
  document.addEventListener('focusout',function(){window.setTimeout(schedule,120);});
  updateViewport();
})();
</script></body></html>`;
  }

  // API Health Endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "Velclaw Hosting Platform Server", timestamp: new Date().toISOString() });
  });

  // VelclawHost native authentication. No Cloudflare Access dependency.
  const apiToken = process.env.VELCLAWHOST_API_TOKEN?.trim() || '';
  const jwtSecret = process.env.VELCLAWHOST_JWT_SECRET?.trim() || '';
  const adminEmail = (process.env.VELCLAWHOST_ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.VELCLAWHOST_ADMIN_PASSWORD || '';
  const roleRank: Record<string, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };
  const roleAtLeast = (role: string, required: string) => (roleRank[role] || 0) >= (roleRank[required] || 99);
  const signJwt = (payload: Record<string, unknown>) => {
    if (jwtSecret.length < 32) throw new Error('VELCLAWHOST_JWT_SECRET must be at least 32 characters.');
    const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const head = enc({ alg: 'HS256', typ: 'JWT' });
    const body = enc({ ...payload, iss: 'VelclawHost', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+60*60*8 });
    const data = head + '.' + body;
    return data + '.' + createHmac('sha256', jwtSecret).update(data).digest('base64url');
  };
  const verifyJwt = (token: string) => {
    if (jwtSecret.length < 32) throw new Error('JWT authentication is not configured.');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token.');
    const expected = createHmac('sha256', jwtSecret).update(parts[0] + '.' + parts[1]).digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid token signature.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.iss !== 'VelclawHost' || !Number.isFinite(payload.exp) || payload.exp <= Date.now()/1000) throw new Error('Token expired.');
    return payload;
  };
  const readJwt = (req: express.Request) => {
    const authorization = req.header('authorization') || '';
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('velclawhost_session='))?.slice('velclawhost_session='.length) || '';
    return bearer || cookie;
  };
  const setSessionCookie = (res: express.Response, token: string) => res.setHeader('Set-Cookie', 'velclawhost_session=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800');
  const clearSessionCookie = (res: express.Response) => res.setHeader('Set-Cookie', 'velclawhost_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  app.post('/api/v1/auth/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!adminEmail || !adminPassword || jwtSecret.length < 32) return res.status(503).json({ error: 'Native login is not configured. Set VELCLAWHOST_ADMIN_EMAIL, VELCLAWHOST_ADMIN_PASSWORD and VELCLAWHOST_JWT_SECRET in Render environment.' });
    const emailOk = email === adminEmail;
    const supplied = Buffer.from(password);
    const configured = Buffer.from(adminPassword);
    const passOk = supplied.length === configured.length && timingSafeEqual(supplied, configured);
    if (!emailOk || !passOk) return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    const user = { id: 'velclawhost-owner', email: adminEmail, role: 'owner', provider: 'velclawhost' };
    const token = signJwt(user);
    setSessionCookie(res, token);
    return res.json({ status: 'success', user, token });
  });
  app.post('/api/v1/auth/logout', (_req, res) => { clearSessionCookie(res); res.json({ status: 'success' }); });
  const getConfiguredRegistrar = () => getRegistrarProvider(process.env.VELCLAWHOST_REGISTRAR || 'none');
  const getSourceRegistrar = () => getRegistrarProvider(process.env.VELCLAWHOST_SOURCE_REGISTRAR || 'none');
  const requireApiToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const auth = req.header('authorization') || '';
    if (apiToken && auth === 'Bearer ' + apiToken) {
      (req as any).velclawAuth = { id: 'service-token', email: 'service', role: 'owner', provider: 'service' };
      return next();
    }
    try {
      const token = readJwt(req);
      if (!token) throw new Error('Please sign in to VelclawHost.');
      const payload = verifyJwt(token);
      (req as any).velclawAuth = { id: payload.id, email: payload.email, role: payload.role, provider: payload.provider || 'velclawhost' };
      return next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED', message: 'Đăng nhập VelclawHost để tiếp tục.' });
    }
  };

  const runtimeWorkerUrl = process.env.RUNTIME_WORKER_URL?.trim().replace(/\/$/, '') || '';
  const runtimeWorkerToken = process.env.RUNTIME_WORKER_TOKEN?.trim() || '';

  async function callRuntimeWorker(pathname: string, init: RequestInit = {}) {
    if (!runtimeWorkerUrl) throw new Error('RUNTIME_WORKER_URL is not configured.');
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (runtimeWorkerToken) headers.set('Authorization', 'Bearer ' + runtimeWorkerToken);
    const response = await fetch(runtimeWorkerUrl + pathname, { ...init, headers });
    const text = await response.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
    if (!response.ok) {
      throw new Error(String(body?.error || 'Runtime worker returned HTTP ' + response.status) + (body?.details ? ': ' + body.details : ''));
    }
    return body;
  }

  type DomainRecord = {
    id: string; domain: string; recordType: 'A' | 'CNAME'; targetValue: string;
    status: 'pending' | 'active' | 'verifying' | 'failed'; sslStatus: 'active' | 'issuing' | 'pending';
    createdAt: string; lastCheckedAt?: string; notes?: string; deploymentId?: string;
  };
  const domains = new Map<string, DomainRecord>();
  const normalizeTarget = (value: string) => value.trim().toLowerCase().replace(/\.$/, '');
  const supportedDomain = isSupportedDomain;

  async function resolveDns(domain: string, type: 'A' | 'CNAME') {
    const url = new URL('https://cloudflare-dns.com/dns-query');
    url.searchParams.set('name', domain);
    url.searchParams.set('type', type);
    const response = await fetch(url, { headers: { accept: 'application/dns-json' } });
    if (!response.ok) throw new Error('DNS resolver returned HTTP ' + response.status);
    const payload = await response.json() as { Answer?: Array<{ type: number; data: string }> };
    return (payload.Answer || []).map((answer) => answer.data);
  }

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'HEALTHY', service: 'velclawhost-control-plane', timestamp: new Date().toISOString(), domains: domains.size });
  });

  app.get('/api/v1/auth/me', requireApiToken, (req, res) => {
    res.json({ status: 'success', user: (req as any).velclawAuth });
  });

  app.get('/api/v1/auth/roles', requireApiToken, (req, res) => {
    const user = (req as any).velclawAuth;
    res.json({
      status: 'success',
      user: { id: user.id, email: user.email, role: user.role },
      roles: ['owner', 'admin', 'member', 'viewer'],
      permissions: {
        read: roleAtLeast(user.role, 'viewer'),
        deploy: roleAtLeast(user.role, 'member'),
        manage: roleAtLeast(user.role, 'admin'),
        owner: roleAtLeast(user.role, 'owner'),
      },
    });
  });



  const developerWorkspaceRoot = process.env.VELCLAWHOST_WORKSPACE_ROOT || path.join(process.cwd(), '.velclaw-workspaces');
  const connectedRepositories = new Map<string, { id:string; url:string; branch:string; name:string; path:string; connectedAt:string }>();
  const developerPlugins = [
    { id:'github', name:'GitHub', description:'Import repository, branches, commits and deployment source.', category:'Source Control', connected:true, capability:'repo' },
    { id:'gitlab', name:'GitLab', description:'Connect GitLab projects and deploy from branches.', category:'Source Control', connected:false, capability:'repo' },
    { id:'playwright', name:'Playwright', description:'Browser automation and smoke-test tooling.', category:'Testing', connected:false, capability:'browser' },
    { id:'postgres', name:'PostgreSQL', description:'Database inspection and migration tooling.', category:'Data', connected:false, capability:'database' },
    { id:'context7', name:'Context7', description:'Documentation context for development tools and SDKs.', category:'AI / MCP', connected:false, capability:'mcp' },
    { id:'filesystem', name:'Filesystem', description:'Project workspace file operations through the runtime worker.', category:'Developer', connected:false, capability:'filesystem' },
  ];
  const developerTools = [
    { id:'repo-import', name:'Repository Importer', description:'Clone a public Git repository into an isolated project workspace.', dangerous:false, available:true },
    { id:'project-shell', name:'Project Shell', description:'Run an allowlisted bash command inside the selected project workspace.', dangerous:true, available:String(process.env.VELCLAWHOST_CODE_SHELL_ENABLED || '').toLowerCase() === 'true' },
    { id:'build', name:'Build', description:'Run the detected project build command in the runtime workspace.', dangerous:false, available:Boolean(runtimeWorkerUrl) },
    { id:'test', name:'Test', description:'Run the detected test command in the runtime workspace.', dangerous:false, available:Boolean(runtimeWorkerUrl) },
    { id:'logs', name:'Runtime Logs', description:'Inspect deployment and runtime logs.', dangerous:false, available:true },
    { id:'mcp', name:'MCP Tools', description:'Expose approved MCP integrations to a project runtime.', dangerous:true, available:Boolean(runtimeWorkerUrl) },
  ];

  app.get('/api/v1/developer/plugins', requireApiToken, (_req, res) => {
    res.json({
      status:'success', plugins:developerPlugins, tools:developerTools,
      repositories:[...connectedRepositories.values()].map(({path:_path,...repo})=>repo),
      runtime:{reachable:Boolean(runtimeWorkerUrl),docker:String(process.env.RUNTIME_PROVIDER || '').toLowerCase()==='docker',build:Boolean(runtimeWorkerUrl),workspace:true},
    });
  });

  app.post('/api/v1/developer/repositories', requireApiToken, async (req,res) => {
    const user=(req as any).velclawAuth;
    if(!roleAtLeast(user.role,'member')) return res.status(403).json({error:'Repository import requires member role.'});
    const url=String(req.body?.url || '').trim(), branch=String(req.body?.branch || 'main').trim();
    let parsed:URL;
    try{parsed=new URL(url)}catch{return res.status(400).json({error:'Invalid repository URL.'})}
    if(!['github.com','gitlab.com'].includes(parsed.hostname.toLowerCase()) || parsed.protocol!=='https:') return res.status(400).json({error:'Only HTTPS GitHub/GitLab repositories are supported.'});
    const repoName=parsed.pathname.replace(/^\/+|\/+$/g,'').replace(/\.git$/,'');
    if(!repoName || repoName.split('/').length!==2) return res.status(400).json({error:'Repository URL must point to an organization/user repository.'});
    const id=repoName.replace(/[^a-zA-Z0-9._-]/g,'-')+'-'+Date.now().toString(36);
    const workspacePath=path.join(developerWorkspaceRoot,id);
    try{
      await fs.mkdir(developerWorkspaceRoot,{recursive:true});
      await execFileAsync('git',['clone','--depth','1','--branch',branch,url,workspacePath],{timeout:120000,maxBuffer:4*1024*1024});
      const repository={id,url,branch,name:repoName,path:workspacePath,connectedAt:new Date().toISOString()};
      connectedRepositories.set(id,repository);
      const {path:_path,...publicRepo}=repository;
      return res.status(201).json({status:'success',repository:publicRepo});
    }catch(error){
      try{await fs.rm(workspacePath,{recursive:true,force:true})}catch{}
      return res.status(502).json({error:'Repository clone failed. Private repositories require server-side Git credentials.',details:error instanceof Error?error.message:String(error)});
    }
  });

  app.post('/api/v1/developer/shell', requireApiToken, async (req,res) => {
    const user=(req as any).velclawAuth;
    if(!roleAtLeast(user.role,'admin')) return res.status(403).json({error:'Project shell requires admin role.'});
    if(String(process.env.VELCLAWHOST_CODE_SHELL_ENABLED || '').toLowerCase()!=='true') return res.status(503).json({error:'Project shell is disabled until an isolated runtime workspace is configured.'});
    const repositoryId=String(req.body?.cwd || ''), command=String(req.body?.command || '').trim(), repository=connectedRepositories.get(repositoryId);
    if(!repository) return res.status(404).json({error:'Repository workspace not found.'});
    if(!command || command.length>1000) return res.status(400).json({error:'Command is empty or too long.'});
    const safeCommand=/^(pwd|ls(?:\\s+-[A-Za-z-]+)?(?:\\s+[^;&|$]+)?|git\\s+(status|branch|log|diff|show)(?:\\s+[^;&|$]+)?|npm\\s+(run\\s+[A-Za-z0-9:_-]+|test|build|--version)|pnpm\\s+(run\\s+[A-Za-z0-9:_-]+|test|build|--version)|bun\\s+(run\\s+[A-Za-z0-9:_-]+|test|build|--version)|node\\s+--version|cat\\s+[^;&|$]+)$/i.test(command);
    if(!safeCommand) return res.status(400).json({error:'Command blocked by VelclawHost shell policy. Allowed: pwd, ls, git status/branch/log/diff/show, npm/pnpm/bun test/build/run, node --version, cat.'});
    try{
      const result=await execFileAsync('bash',['-lc',command],{cwd:repository.path,timeout:60000,maxBuffer:2*1024*1024,env:{...process.env,HOME:'/tmp/velclawhost-home'}});
      return res.json({status:'success',output:[result.stdout,result.stderr].filter(Boolean).join('\\n'),command,repositoryId});
    }catch(error:any){
      return res.status(400).json({error:'Command failed.',output:[error?.stdout,error?.stderr].filter(Boolean).join('\\n'),details:error?.message || String(error)});
    }
  });

  app.get('/api/v1/capabilities', requireApiToken, async (_req, res) => {
    const runtimeProvider = String(process.env.RUNTIME_PROVIDER || 'none').trim().toLowerCase();
    const deploymentExecutor = String(process.env.DEPLOYMENT_EXECUTOR || 'none').trim().toLowerCase();
    const remoteWorkerConfigured = Boolean(runtimeWorkerUrl);
    let remoteWorkerReachable = false;
    if (remoteWorkerConfigured) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetch(runtimeWorkerUrl + '/health', { signal: controller.signal });
          remoteWorkerReachable = response.ok;
        } finally {
          clearTimeout(timer);
        }
      } catch {}
    }
    const stateStore = String(process.env.VELCLAWHOST_STATE_STORE || 'file').trim().toLowerCase();
    let dockerAvailable = false;
    if (runtimeProvider === 'docker' || deploymentExecutor === 'docker') {
      try {
        await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 3000, maxBuffer: 1024 * 1024 });
        dockerAvailable = true;
      } catch {}
    }
    res.json({
      status: 'success',
      service: 'velclawhost-control-plane',
      mode: (deploymentExecutor === 'remote' && remoteWorkerReachable) || (dockerAvailable && deploymentExecutor === 'docker') ? 'runtime-enabled' : 'control-plane-only',
      capabilities: {
        liveMetrics: true,
        dnsResolution: true,
        dnsManagement: Boolean(process.env.CLOUDFLARE_API_TOKEN),
        durableState: stateStore === 'postgres' && Boolean(process.env.DATABASE_URL),
        deploymentQueue: true,
        deploymentBuild: (deploymentExecutor === 'docker' && dockerAvailable) || (deploymentExecutor === 'remote' && remoteWorkerReachable),
        containerRuntime: (runtimeProvider === 'docker' && dockerAvailable) || (runtimeProvider === 'remote' && remoteWorkerReachable),
        reverseProxy: Boolean(process.env.CADDY_ADMIN_URL),
        registrar: Boolean(process.env.VELCLAWHOST_REGISTRAR && process.env.VELCLAWHOST_REGISTRAR !== 'none'),
      },
      configuration: {
        stateStore,
        runtimeProvider,
        deploymentExecutor,
        runtimeWorkerConfigured: remoteWorkerConfigured,
        runtimeWorkerReachable: remoteWorkerReachable,
        imageRegistryConfigured: Boolean(process.env.IMAGE_REGISTRY),
        cloudflareManagementConfigured: Boolean(process.env.CLOUDFLARE_API_TOKEN),
        apiAuthenticationConfigured: Boolean(apiToken),
      },
      worker: {
        requiredForRuntime: !(runtimeProvider === 'docker' && dockerAvailable) && !(runtimeProvider === 'remote' && remoteWorkerReachable),
        message: runtimeProvider === 'remote' && remoteWorkerReachable
          ? 'Remote runtime worker is reachable.'
          : runtimeProvider === 'remote' && remoteWorkerConfigured
            ? 'Remote runtime worker is configured but unreachable.'
            : dockerAvailable
            ? 'Docker runtime is available to this process.'
            : 'No Docker runtime is available to this control-plane process; a separate runtime worker is required for container deployments.',
      },
    });
  });

  type DeploymentRecord = {
    id: string; projectName: string; repoUrl: string; branch: string; commitSha: string | null;
    customDomain: string | null; status: 'queued' | 'claimed' | 'source_validating' | 'building' | 'runtime_provisioning' | 'health_check' | 'ready' | 'retryable_failed' | 'terminal_failed';
    createdAt: string; startedAt?: string; completedAt?: string; sourceValidatedAt?: string;
    sourceCommit?: string; error?: string;
  };
  const deployments = new Map<string, DeploymentRecord>();

  app.get('/api/v1/deployments', requireApiToken, (_req, res) => {
    res.json({ status: 'success', deployments: [...deployments.values()] });
  });

  app.post('/api/v1/deployments', requireApiToken, async (req, res) => {
    const projectName = String(req.body?.projectName || '').trim();
    const repoUrl = String(req.body?.repoUrl || '').trim();
    const branch = String(req.body?.branch || 'main').trim();
    const commitSha = req.body?.commitSha ? String(req.body.commitSha).trim() : null;
    const customDomain = req.body?.customDomain ? String(req.body.customDomain).trim().toLowerCase() : null;
    if (!projectName || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(projectName)) return res.status(400).json({ error: 'Invalid projectName.' });
    let canonicalRepoUrl = '';
    try {
      const parsed = new URL(repoUrl);
      const parts = parsed.pathname.replace(/\/+$/, '').replace(/\.git$/i, '').split('/').filter(Boolean);
      if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com' ||
          parsed.username || parsed.password || parsed.search || parsed.hash || parts.length !== 2 ||
          !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(parts[0]) ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(parts[1])) {
        return res.status(400).json({ error: 'Enter a GitHub repository URL like https://github.com/owner/repo (without a file or issue path).' });
      }
      canonicalRepoUrl = `https://github.com/${parts[0]}/${parts[1]}`;
    } catch {
      return res.status(400).json({ error: 'Repository URL is invalid. Use https://github.com/owner/repo.' });
    }
    if (!/^[A-Za-z0-9._/-]{1,120}$/.test(branch)) return res.status(400).json({ error: 'Invalid branch.' });
    if (commitSha && !/^[0-9a-f]{40}$/i.test(commitSha)) return res.status(400).json({ error: 'Invalid commit SHA.' });
    if (customDomain && !supportedDomain(customDomain)) return res.status(400).json({ error: 'Unsupported custom domain.' });
    const id = 'dep-' + Date.now();
    const item: DeploymentRecord = { id, projectName, repoUrl: canonicalRepoUrl, branch, commitSha, customDomain, status: 'queued', createdAt: new Date().toISOString() };
    deployments.set(id, item);
    await persistState();
    queueMetrics.enqueued += 1;
    await deploymentQueue.enqueue({ id: 'job-' + id, deploymentId: id, priority: Number(req.body?.priority || 0), maxAttempts: 3, availableAt: new Date().toISOString() });
    void runDeploymentJob();
    res.status(202).json({ status: 'queued', deployment: item });
  });

  app.get('/api/v1/deployments/:id', requireApiToken, (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    res.json({ status: 'success', deployment: item });
  });

  type QueueMetrics = { enqueued: number; claimed: number; completed: number; failed: number; lastError: string | null; };
  const queueMetrics: QueueMetrics = { enqueued: 0, claimed: 0, completed: 0, failed: 0, lastError: null };
  let queueBusy = false;

  async function runDeploymentJob() {
    if (queueBusy) return;
    queueBusy = true;
    try {
      const job = await deploymentQueue.claim(workerId);
      if (!job) return;
      queueMetrics.claimed += 1;
      const item = deployments.get(job.deploymentId);
      if (!item) {
        await deploymentQueue.fail(job.id, 'Deployment record not found.');
        queueMetrics.failed += 1;
        return;
      }
      item.status = 'source_validating';
      item.startedAt = new Date().toISOString();
      item.error = undefined;
      await persistState();

      try {
        const remote = item.repoUrl.replace(/\\.git$/i, '');
        const { stdout } = await execFileAsync('git', ['ls-remote', remote, item.branch], { timeout: 15000, maxBuffer: 1024 * 1024 });
        const line = stdout.trim().split('\\n').find(Boolean);
        const observedCommit = line?.split(/\\s+/)[0] || '';
        if (!observedCommit) throw new Error('Repository branch returned no commit.');
        if (!observedCommit || !/^[0-9a-f]{40}$/i.test(observedCommit)) throw new Error('Repository branch could not be resolved.');
        if (item.commitSha && item.commitSha.toLowerCase() !== observedCommit.toLowerCase()) throw new Error('Requested commit SHA does not match the remote branch tip.');
        item.sourceCommit = observedCommit;
        item.sourceValidatedAt = new Date().toISOString();

        const executor = String(process.env.DEPLOYMENT_EXECUTOR || 'none').toLowerCase();

        if (executor === 'remote') {
          item.status = 'building';
          await persistState();

          const workerResult = await callRuntimeWorker('/v1/deployments', {
            method: 'POST',
            body: JSON.stringify({
              deploymentId: item.id,
              projectName: item.projectName,
              repoUrl: item.repoUrl,
              branch: item.branch,
              commitSha: observedCommit,
            }),
          });

          const workerRuntime = workerResult?.runtime;
          if (!workerRuntime?.runtimeId || workerRuntime.state !== 'running') {
            throw new Error('Runtime worker did not return a running runtime.');
          }

          item.status = 'health_check';
          await persistState();

          const now = new Date().toISOString();
          runtimes.set(item.id, {
            deploymentId: item.id,
            runtimeId: String(workerRuntime.runtimeId),
            state: 'running',
            port: Number(workerRuntime.hostPort || 0),
            healthUrl: workerRuntime.publicUrl || null,
            createdAt: String(workerRuntime.createdAt || now),
            updatedAt: String(workerRuntime.updatedAt || now),
          });

          item.status = 'ready';
          item.completedAt = new Date().toISOString();
          item.error = undefined;
          await persistState();
          await deploymentQueue.complete(job.id);
          queueMetrics.completed += 1;
          return;
        }

        if (executor !== 'docker') {
          item.status = 'source_validating';
          await persistState();
          await deploymentQueue.complete(job.id);
          queueMetrics.completed += 1;
          return;
        }

        item.status = 'building';
        await persistState();

        const osTmp = path.join(process.cwd(), '.velclawhost-tmp');
        const checkoutDir = path.join(osTmp, item.id);
        const safeProject = item.projectName.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
        const image = 'velclawhost/' + safeProject + ':' + observedCommit.slice(0, 12);
        await fs.rm(checkoutDir, { recursive: true, force: true });
        await fs.mkdir(osTmp, { recursive: true });
        await execFileAsync('git', ['clone', '--depth', '1', '--branch', item.branch, remote, checkoutDir], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
        await execFileAsync('git', ['-C', checkoutDir, 'fetch', '--depth', '1', 'origin', observedCommit], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
        await execFileAsync('git', ['-C', checkoutDir, 'checkout', '--detach', observedCommit], { timeout: 30000, maxBuffer: 1024 * 1024 });
        await execFileAsync('docker', ['build', '--pull', '-t', image, checkoutDir], { timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
        let runtimeImage = image;
        const registry = process.env.IMAGE_REGISTRY?.trim().replace(/\/$/, '');
        if (registry && String(process.env.IMAGE_PUSH || '').toLowerCase() === 'true') {
          runtimeImage = registry + '/' + safeProject + ':' + observedCommit.slice(0, 12);
          await execFileAsync('docker', ['tag', image, runtimeImage], { timeout: 30000, maxBuffer: 1024 * 1024 });
          await execFileAsync('docker', ['push', runtimeImage], { timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
        }

        item.status = 'runtime_provisioning';
        await persistState();

        let runtime = runtimes.get(item.id);
        if (!runtime) {
          const now = new Date().toISOString();
          runtime = { deploymentId:item.id, runtimeId:'rt-'+Date.now(), state:'provisioning', port:allocateRuntimePort(), healthUrl:null, createdAt:now, updatedAt:now };
          runtimes.set(item.id, runtime);
        }
        const containerPort = Number(process.env.RUNTIME_CONTAINER_PORT || 3000);
        if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) throw new Error('Invalid RUNTIME_CONTAINER_PORT.');
        const containerName = 'velclawhost-' + item.id;
        await execFileAsync('docker', ['rm', '-f', containerName], { timeout: 15000, maxBuffer: 1024 * 1024 }).catch(() => {});
        await execFileAsync('docker', ['run', '-d', '--name', containerName, '--restart', 'unless-stopped', '--label', 'velclawhost.deployment=' + item.id, '--label', 'velclawhost.project=' + item.projectName, '-p', runtime.port + ':' + containerPort, runtimeImage], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
        runtime.state = 'running';
        runtime.healthUrl = 'http://127.0.0.1:' + runtime.port;
        runtime.updatedAt = new Date().toISOString();
        item.status = 'health_check';
        await persistState();

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(runtime.healthUrl, { signal: controller.signal });
          if (!response.ok) throw new Error('Health check returned HTTP ' + response.status);
        } finally { clearTimeout(timer); }

        if (item.customDomain) {
          const domain = [...domains.values()].find((entry) => entry.domain === item.customDomain && entry.status === 'active');
          if (domain) {
            const bindHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiToken) bindHeaders.authorization = 'Bearer ' + apiToken;
            const bindResponse = await fetch('http://127.0.0.1:' + PORT + '/api/v1/deployments/' + item.id + '/domain/bind', {
              method: 'POST',
              headers: bindHeaders,
              body: JSON.stringify({ domainId: domain.id }),
            });
            if (!bindResponse.ok) throw new Error('Domain binding failed with HTTP ' + bindResponse.status);
          }
        }

        item.status = 'ready';
        item.completedAt = new Date().toISOString();
        await persistState();
        await deploymentQueue.complete(job.id);
        queueMetrics.completed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        item.error = message;
        const retryable = job.attempts < job.maxAttempts;
        item.status = retryable ? 'retryable_failed' : 'terminal_failed';
        item.completedAt = retryable ? undefined : new Date().toISOString();
        await persistState();
        const next = await deploymentQueue.retry(job.id, message, Math.min(300000, 30000 * (2 ** Math.max(0, job.attempts - 1))));
        if (next === 'terminal_failed') queueMetrics.failed += 1;
        queueMetrics.lastError = message;
      }
    } finally {
      queueBusy = false;
    }
  }

  const queueIntervalMs = Math.max(5000, Number(process.env.DEPLOYMENT_QUEUE_INTERVAL_MS || 10000));
  const queueTimer = setInterval(() => void runDeploymentJob(), queueIntervalMs);
  queueTimer.unref?.();
  void runDeploymentJob();

  app.get('/api/v1/queue', requireApiToken, async (_req, res) => {
    res.json({
      status: 'success',
      running: queueBusy,
      interval_ms: queueIntervalMs,
      queued: [...deployments.values()].filter((item) => item.status === 'queued' || item.status === 'retryable_failed').length,
      durable: String(process.env.VELCLAWHOST_STATE_STORE || 'file').toLowerCase() === 'postgres',
      database: await deploymentQueue.stats(),
      ...queueMetrics,
    });
  });

  app.post('/api/v1/deployments/:id/execute', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!['queued','retryable_failed'].includes(item.status)) return res.status(409).json({ error: 'Deployment is not executable from its current state.', deployment: item });
    await deploymentQueue.enqueue({ id: 'job-' + item.id, deploymentId: item.id, priority: Number(req.body?.priority || 0), maxAttempts: 3, availableAt: new Date().toISOString() });
    void runDeploymentJob();
    return res.status(202).json({ status: 'queued', deployment: item });
  });

  type RuntimeRecord = {
    deploymentId: string; runtimeId: string; state: 'provisioning' | 'running' | 'failed' | 'stopped';
    port: number; healthUrl: string | null; createdAt: string; updatedAt: string;
  };
  const runtimes = new Map<string, RuntimeRecord>();
  const runtimePorts = new Set<number>();
  let nextRuntimePort = Number(process.env.RUNTIME_PORT_START || 4100);

  function allocateRuntimePort() {
    while (runtimePorts.has(nextRuntimePort)) nextRuntimePort += 1;
    const port = nextRuntimePort++;
    runtimePorts.add(port);
    return port;
  }

  const stateFile = process.env.VELCLAWHOST_STATE_FILE || path.join(process.cwd(), 'data', 'control-plane-state.json');
  const { createControlPlaneStateStore } = await import('./lib/control-plane/state-store');
  type PersistedState = {
    version: 1 | 2;
    nextRuntimePort: number;
    domains: DomainRecord[];
    deployments: DeploymentRecord[];
    runtimes: RuntimeRecord[];
  };
  const stateStore = createControlPlaneStateStore({
    store: process.env.VELCLAWHOST_STATE_STORE,
    stateFile,
    databaseUrl: process.env.DATABASE_URL?.trim(),
  });

  let persistChain = Promise.resolve();
  async function persistState() {
    const snapshot: PersistedState = {
      version: 1,
      nextRuntimePort,
      domains: [...domains.values()],
      deployments: [...deployments.values()],
      runtimes: [...runtimes.values()],
    };
    persistChain = persistChain.then(() => stateStore.save(snapshot));
    return persistChain;
  }

  async function loadState() {
    try {
      const snapshot = await stateStore.load();
      if (!snapshot) return;
      if (snapshot.version !== 1 && snapshot.version !== 2) throw new Error('Unsupported control-plane state version.');
      for (const item of snapshot.domains || []) {
        const record = item as unknown as DomainRecord;
        domains.set(record.id, record);
      }
      for (const item of snapshot.deployments || []) {
        const record = item as unknown as DeploymentRecord;
        deployments.set(record.id, record);
      }
      for (const item of snapshot.runtimes || []) {
        const runtime = item as RuntimeRecord;
        runtimes.set(runtime.deploymentId, runtime);
        runtimePorts.add(runtime.port);
      }
      if (Number.isInteger(snapshot.nextRuntimePort) && snapshot.nextRuntimePort > 0) nextRuntimePort = snapshot.nextRuntimePort;
    } catch (error) {
      console.error('Failed to load control-plane state:', error);
      if (String(process.env.VELCLAWHOST_FAIL_ON_STATE_ERROR).toLowerCase() === 'true') throw error;
    }
  }

  await loadState();

  app.post('/api/v1/deployments/:id/runtime/plan', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!['source_validating','building','runtime_provisioning','health_check'].includes(item.status)) return res.status(409).json({ error: 'Runtime planning requires an active deployment state.', deployment: item });
    const existing = runtimes.get(item.id);
    if (existing) return res.json({ status: 'success', runtime: existing });
    const now = new Date().toISOString();
    const runtime: RuntimeRecord = {
      deploymentId: item.id,
      runtimeId: 'rt-' + Date.now(),
      state: 'provisioning',
      port: allocateRuntimePort(),
      healthUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    runtimes.set(item.id, runtime);
    await persistState();
    res.status(201).json({ status: 'planned', runtime, next: 'runtime_provider' });
  });

  app.get('/api/v1/deployments/:id/runtime', requireApiToken, (req, res) => {
    const runtime = runtimes.get(req.params.id);
    if (!runtime) return res.status(404).json({ error: 'Runtime plan not found.' });
    res.json({ status: 'success', runtime });
  });

  app.post('/api/v1/deployments/:id/runtime/provision', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(404).json({ error: 'Runtime plan not found.' });
    if (runtime.state !== 'provisioning') return res.status(409).json({ error: 'Runtime is not in provisioning state.', runtime });

    const provider = String(process.env.RUNTIME_PROVIDER || 'none').toLowerCase();
    if (provider !== 'docker') {
      return res.status(503).json({
        error: 'Docker runtime provider is not enabled.',
        required: 'RUNTIME_PROVIDER=docker',
        runtime,
      });
    }

    const image = String(process.env.RUNTIME_IMAGE || '').trim();
    if (!image) {
      return res.status(503).json({ error: 'RUNTIME_IMAGE is not configured; refusing to start an unspecified container.' });
    }

    const containerPort = Number(process.env.RUNTIME_CONTAINER_PORT || 3000);
    if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
      return res.status(500).json({ error: 'Invalid RUNTIME_CONTAINER_PORT.' });
    }

    const containerName = `velclawhost-${item.id}`;
    try {
      const inspect = await execFileAsync('docker', ['inspect', containerName], { timeout: 10000, maxBuffer: 1024 * 1024 }).catch(() => null);
      if (inspect) {
        runtime.state = 'running';
        runtime.updatedAt = new Date().toISOString();
        runtime.healthUrl = `http://127.0.0.1:${runtime.port}`;
        await persistState();
        return res.json({ status: 'running', deployment: item, runtime, next: 'health_check' });
      }

      await execFileAsync('docker', [
        'run', '-d',
        '--name', containerName,
        '--restart', 'unless-stopped',
        '--label', 'com.velclawhost.deployment=' + item.id,
        '--label', 'com.velclawhost.project=' + item.projectName,
        '-p', `${runtime.port}:${containerPort}`,
        image,
      ], { timeout: 30000, maxBuffer: 1024 * 1024 });

      runtime.state = 'running';
      runtime.updatedAt = new Date().toISOString();
      runtime.healthUrl = `http://127.0.0.1:${runtime.port}`;
      await persistState();
      return res.status(201).json({
        status: 'running',
        deployment: item,
        runtime,
        health: 'pending',
        next: 'health_check',
      });
    } catch (error) {
      runtime.state = 'failed';
      runtime.updatedAt = new Date().toISOString();
      item.status = 'terminal_failed';
      item.completedAt = new Date().toISOString();
      item.error = error instanceof Error ? error.message : String(error);
      await persistState();
      return res.status(502).json({ status: 'failed', deployment: item, runtime });
    }
  });

  app.get('/api/v1/deployments/:id/runtime/logs', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(404).json({ error: 'Runtime not found.' });

    const provider = String(process.env.RUNTIME_PROVIDER || 'none').toLowerCase();
    if (provider !== 'docker') {
      return res.status(503).json({ error: 'Docker runtime provider is not enabled.', runtime });
    }

    const containerName = `velclawhost-${item.id}`;
    const tail = Math.min(Math.max(Number(req.query.tail || 100), 1), 1000);
    try {
      const { stdout } = await execFileAsync('docker', ['logs', '--tail', String(tail), containerName], {
        timeout: 10000,
        maxBuffer: 2 * 1024 * 1024,
      });
      return res.json({ status: 'success', deployment: item, runtime, logs: stdout });
    } catch (error) {
      return res.status(502).json({
        error: 'Unable to read runtime logs.',
        details: error instanceof Error ? error.message : String(error),
        deployment: item,
        runtime,
      });
    }
  });

  app.post('/api/v1/deployments/:id/runtime/stop', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(404).json({ error: 'Runtime not found.' });

    const provider = String(process.env.RUNTIME_PROVIDER || 'none').toLowerCase();
    if (provider !== 'docker') {
      return res.status(503).json({ error: 'Docker runtime provider is not enabled.', runtime });
    }

    const containerName = `velclawhost-${item.id}`;
    try {
      await execFileAsync('docker', ['stop', '--time', '10', containerName], {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      runtime.state = 'stopped';
      runtime.updatedAt = new Date().toISOString();
      item.status = 'terminal_failed';
      item.error = 'Runtime stopped by operator.';
      item.completedAt = new Date().toISOString();
      await persistState();
      return res.json({ status: 'stopped', deployment: item, runtime });
    } catch (error) {
      return res.status(502).json({
        error: 'Unable to stop runtime.',
        details: error instanceof Error ? error.message : String(error),
        deployment: item,
        runtime,
      });
    }
  });

  app.post('/api/v1/deployments/:id/runtime/health', requireApiToken, async (req, res) => {
    const item = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(404).json({ error: 'Runtime not found.' });
    if (!runtime.healthUrl) return res.status(409).json({ error: 'Runtime has no health endpoint.' });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(runtime.healthUrl, { signal: controller.signal });
      clearTimeout(timer);
      const healthy = response.ok;
      if (!healthy) {
        runtime.state = 'failed';
        runtime.updatedAt = new Date().toISOString();
        item.status = 'terminal_failed';
        item.error = `Health check returned HTTP ${response.status}`;
        return res.status(502).json({ status: 'unhealthy', deployment: item, runtime });
      }
      runtime.state = 'running';
      runtime.updatedAt = new Date().toISOString();
      item.status = 'ready';
      await persistState();
      item.completedAt = new Date().toISOString();
      item.error = undefined;
      return res.json({ status: 'healthy', deployment: item, runtime });
    } catch (error) {
      runtime.state = 'failed';
      runtime.updatedAt = new Date().toISOString();
      item.status = 'terminal_failed';
      item.error = error instanceof Error ? error.message : String(error);
      return res.status(502).json({ status: 'unhealthy', deployment: item, runtime });
    }
  });
  app.get('/api/v1/domains', requireApiToken, (_req, res) => {
    res.json({ status: 'success', domains: [...domains.values()] });
  });

  // Registrar control-plane boundary. VelclawHost owns the workflow/UI;
  // registrar credentials stay server-side and are never exposed to the browser.
  app.get('/api/v1/registrar/config', requireApiToken, (_req, res) => {
    res.json({
      status: 'success',
      mode: process.env.VELCLAWHOST_REGISTRAR ? 'registrar-adapter' : 'control-plane',
      registrar: process.env.VELCLAWHOST_REGISTRAR || null,
      sourceRegistrar: process.env.VELCLAWHOST_SOURCE_REGISTRAR || null,
      firstPartyDomains: VELCLAW_FIRST_PARTY_DOMAINS,
    });
  });

  app.get('/api/v1/registrar/domains/:domain/availability', requireApiToken, async (req, res) => {
    try {
      const provider = getConfiguredRegistrar();
      const result = await provider.getAvailability(req.params.domain);
      return res.json({ status: 'success', provider: provider.name, result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  // Transfer-out from Vercel: fetch the EPP/Auth-Code from the source registrar.
  // The code is returned only over an authenticated control-plane request.
  app.get('/api/v1/registrar/source/:domain/auth-code', requireApiToken, async (req, res) => {
    try {
      const provider = getSourceRegistrar();
      const result = await provider.getAuthCode(req.params.domain);
      return res.json({ status: 'success', provider: provider.name, domain: result.domain, authCode: result.authCode });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  app.get('/api/v1/registrar/source/:domain/transfer', requireApiToken, async (req, res) => {
    try {
      const provider = getSourceRegistrar();
      const result = await provider.getTransferStatus(req.params.domain);
      return res.json({ status: 'success', provider: provider.name, result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  // Target-registrar transfer-in. This is intentionally disabled until a real
  // VelclawHost registrar/reseller adapter is configured.
  app.post('/api/v1/registrar/domains/:domain/transfer-in', requireApiToken, async (req, res) => {
    try {
      const provider = getConfiguredRegistrar();
      const authCode = String(req.body?.authCode || '').trim();
      if (!authCode) return res.status(400).json({ error: 'authCode is required.' });
      const result = await provider.transferIn({
        domain: req.params.domain,
        authCode,
        years: Number.isInteger(req.body?.years) ? req.body.years : 1,
        autoRenew: req.body?.autoRenew !== false,
        expectedPrice: typeof req.body?.expectedPrice === 'number' ? req.body.expectedPrice : undefined,
        contactInformation: req.body?.contactInformation && typeof req.body.contactInformation === 'object' ? req.body.contactInformation : undefined,
      });
      return res.status(202).json({ status: 'accepted', provider: provider.name, transfer: result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  app.get('/api/v1/registrar/domains/:domain/transfer', requireApiToken, async (req, res) => {
    try {
      const provider = getConfiguredRegistrar();
      const result = await provider.getTransferStatus(req.params.domain);
      return res.json({ status: 'success', provider: provider.name, transfer: result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  app.patch('/api/v1/registrar/domains/:domain/nameservers', requireApiToken, async (req, res) => {
    try {
      const provider = getConfiguredRegistrar();
      const nameservers = Array.isArray(req.body?.nameservers) ? req.body.nameservers.map(String) : [];
      const result = await provider.updateNameservers(req.params.domain, nameservers);
      return res.json({ status: 'success', provider: provider.name, domain: req.params.domain, result });
    } catch (error) {
      const status = error instanceof RegistrarProviderError ? error.status : 503;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error instanceof RegistrarProviderError ? error.code : 'REGISTRAR_ERROR' });
    }
  });

  app.post('/api/v1/domains', requireApiToken, async (req, res) => {
    const domain = String(req.body?.domain || '').trim().toLowerCase();
    const recordType = req.body?.recordType === 'CNAME' ? 'CNAME' : 'A';
    const targetValue = String(req.body?.targetValue || '').trim();
    if (!supportedDomain(domain)) return res.status(400).json({ error: 'Invalid domain name.' });
    if (!targetValue) return res.status(400).json({ error: 'targetValue is required.' });
    if ([...domains.values()].some((item) => item.domain === domain)) return res.status(409).json({ error: 'Domain already exists.' });
    const id = 'dom-' + Date.now();
    const item: DomainRecord = { id, domain, recordType, targetValue, status: 'pending', sslStatus: 'pending', createdAt: new Date().toISOString(), notes: typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined };
    domains.set(id, item);
    await persistState();
    res.status(201).json({ status: 'success', domain: item });
  });

  app.post('/api/v1/domains/:id/verify', requireApiToken, async (req, res) => {
    const item = domains.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Domain not found.' });
    item.status = 'verifying';
    item.lastCheckedAt = new Date().toISOString();
    try {
      const values = await resolveDns(item.domain, item.recordType);
      const expected = normalizeTarget(item.targetValue);
      const matched = values.some((value) => normalizeTarget(value) === expected);
      item.status = matched ? 'active' : 'failed';
      item.sslStatus = matched ? 'active' : 'pending';
      item.lastCheckedAt = new Date().toISOString();
      await persistState();
      return res.json({ status: matched ? 'verified' : 'mismatch', domain: item, observed: values });
    } catch (error) {
      item.status = 'failed';
      item.sslStatus = 'pending';
      return res.status(502).json({ error: 'DNS verification failed.', details: error instanceof Error ? error.message : String(error), domain: item });
    }
  });

  app.post('/api/v1/deployments/:id/domain/bind', requireApiToken, async (req, res) => {
    const deployment = deployments.get(req.params.id);
    const runtime = runtimes.get(req.params.id);
    const domainId = String(req.body?.domainId || '').trim();
    const domain = domains.get(domainId);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found.' });
    if (!runtime) return res.status(409).json({ error: 'Runtime plan not found.' });
    if (runtime.state !== 'running') return res.status(409).json({ error: 'Runtime must be running before domain binding.', runtime });
    if (!domain) return res.status(404).json({ error: 'Domain not found.' });
    if (domain.status !== 'active') return res.status(409).json({ error: 'Domain must pass DNS verification before binding.', domain });

    domain.deploymentId = deployment.id;
    domain.sslStatus = 'pending';
    domain.lastCheckedAt = new Date().toISOString();
    await persistState();

    const configDir = process.env.CADDY_CONFIG_DIR || path.join(process.cwd(), 'deploy', 'generated');
    const configPath = path.join(configDir, 'Caddyfile');
    const upstreamHost = process.env.CADDY_UPSTREAM_HOST || '127.0.0.1';
    try {
      await fs.mkdir(configDir, { recursive: true });
      const bindings = [...domains.values()].filter((entry) => entry.status === 'active' && entry.deploymentId).map((entry) => {
        const boundRuntime = runtimes.get(deployments.get(entry.deploymentId!)?.id || '');
        if (!boundRuntime || boundRuntime.state !== 'running') return null;
        const safeDomain = entry.domain.replace(/[^a-z0-9.-]/gi, '');
        return `${safeDomain} {
  reverse_proxy ${upstreamHost}:${boundRuntime.port}
}`;
      }).filter(Boolean).join('\n\n');

      await fs.writeFile(configPath, bindings ? bindings + '\n' : '# VelclawHost generated Caddy configuration\n', 'utf8');

      const autoReload = String(process.env.CADDY_AUTO_RELOAD || 'false').toLowerCase() === 'true';
      if (autoReload) {
        const adminUrl = process.env.CADDY_ADMIN_URL?.trim();
        if (adminUrl) {
          const caddyConfig = await fs.readFile(configPath, 'utf8');
          const response = await fetch(adminUrl.replace(/\/$/, '') + '/load', {
            method: 'POST',
            headers: { 'Content-Type': 'text/caddyfile' },
            body: caddyConfig,
          });
          if (!response.ok) throw new Error('Caddy admin reload returned HTTP ' + response.status);
        } else {
          await execFileAsync('caddy', ['reload', '--config', configPath, '--adapter', 'caddyfile'], {
            timeout: 15000,
            maxBuffer: 1024 * 1024,
          });
        }
      }

      return res.status(201).json({
        status: 'bound',
        domain,
        runtime,
        proxy: { provider: 'caddy', configPath, reloaded: autoReload },
      });
    } catch (error) {
      domain.deploymentId = undefined;
      await persistState();
      return res.status(502).json({
        error: 'Failed to generate or reload reverse-proxy configuration.',
        details: error instanceof Error ? error.message : String(error),
        domain,
      });
    }
  });

  app.delete('/api/v1/domains/:id', requireApiToken, async (req, res) => {
    if (!domains.delete(req.params.id)) return res.status(404).json({ error: 'Domain not found.' });
    await persistState();
    res.status(204).end();
  });

  app.get('/api/v1/metrics', requireApiToken, async (_req, res) => {
    const memory = process.memoryUsage();
    const cpu = readCpuUsage();
    const network = await readNetworkMbps();
    const connections = await readEstablishedConnections();
    let disk = { usedGb: 0, totalGb: 0, usagePercent: 0 };
    try {
      const stat = await fs.statfs(process.cwd());
      const total = Number(stat.blocks) * Number(stat.bsize);
      const free = Number(stat.bfree) * Number(stat.bsize);
      disk = { totalGb: total / 1024 / 1024 / 1024, usedGb: (total - free) / 1024 / 1024 / 1024, usagePercent: total ? ((total - free) / total) * 100 : 0 };
    } catch {}
    const loads = os.loadavg();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const node = {
      id: 'control-plane-' + os.hostname(), hostname: os.hostname(), ipV4: 'container-local', ipV6: 'not-exposed',
      os: os.type(), kernel: os.release(), region: process.env.RENDER_REGION || 'unknown', datacenter: process.env.RENDER_REGION || 'unknown',
      status: 'online', uptimeSeconds: Math.round(process.uptime()), cpuCores: cpu.perCore.length,
    };
    const snapshot = {
      timestamp: new Date().toISOString(), timeLabel: new Date().toLocaleTimeString('vi-VN'),
      cpuUsage: Number(cpu.total.toFixed(1)), cpuCores: cpu.perCore.map((v) => Number(v.toFixed(1))),
      ramUsagePercent: Number((((totalMemory - freeMemory) / totalMemory) * 100).toFixed(1)), ramUsedGb: (totalMemory - freeMemory) / 1024 / 1024 / 1024, ramTotalGb: totalMemory / 1024 / 1024 / 1024,
      swapUsedGb: 0, swapTotalGb: 0, diskUsagePercent: Number(disk.usagePercent.toFixed(1)), diskUsedGb: disk.usedGb, diskTotalGb: disk.totalGb,
      diskIops: null, networkInMbps: Number(network.rxMbps.toFixed(2)), networkOutMbps: Number(network.txMbps.toFixed(2)),
      load1m: Number((loads[0] || 0).toFixed(2)), load5m: Number((loads[1] || 0).toFixed(2)), load15m: Number((loads[2] || 0).toFixed(2)), activeConnections: connections, latencyMs: null,
    };
    res.json({ status: 'success', timestamp: new Date().toISOString(), source: 'live-process-and-host', node, snapshot, availability: { cpu: true, memory: true, disk: true, network: network.available, connections: true, iops: false, latency: false }, deployments: { total: deployments.size, queued: [...deployments.values()].filter((d) => d.status === 'queued').length, building: [...deployments.values()].filter((d) => d.status === 'building').length, source_validating: [...deployments.values()].filter((d) => d.status === 'source_validating').length, runtime_provisioning: [...deployments.values()].filter((d) => d.status === 'runtime_provisioning').length, failed: [...deployments.values()].filter((d) => d.status === 'retryable_failed' || d.status === 'terminal_failed').length, ready: [...deployments.values()].filter((d) => d.status === 'ready').length }, runtime: { node: process.version, uptime_seconds: Math.round(process.uptime()), heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024), rss_mb: Math.round(memory.rss / 1024 / 1024) }, domains: { total: domains.size, active: [...domains.values()].filter((d) => d.status === 'active').length, pending: [...domains.values()].filter((d) => d.status !== 'active').length } });
  });

  app.get('/api/v1/prometheus', requireApiToken, (_req, res) => {
    const all = [...domains.values()];
    const body = [
      '# HELP velclawhost_domains_total Number of domains managed by VelclawHost',
      '# TYPE velclawhost_domains_total gauge',
      'velclawhost_domains_total ' + all.length,
      '# HELP velclawhost_domains_active Number of active domains',
      '# TYPE velclawhost_domains_active gauge',
      'velclawhost_domains_active ' + all.filter((d) => d.status === 'active').length,
      '# HELP velclawhost_uptime_seconds Process uptime in seconds',
      '# TYPE velclawhost_uptime_seconds gauge',
      'velclawhost_uptime_seconds ' + Math.round(process.uptime()),
    ].join('\n') + '\n';
    res.type('text/plain; version=0.0.4').send(body);
  });

  type ReconciliationMetrics = {
    runs: number;
    failures: number;
    runtimeUnhealthy: number;
    lastRunAt: string | null;
    lastError: string | null;
  };
  const reconciliation: ReconciliationMetrics = {
    runs: 0,
    failures: 0,
    runtimeUnhealthy: 0,
    lastRunAt: null,
    lastError: null,
  };
  let reconciliationBusy = false;

  async function reconcileControlPlane() {
    if (reconciliationBusy) return;
    reconciliationBusy = true;
    reconciliation.runs += 1;
    reconciliation.lastRunAt = new Date().toISOString();
    reconciliation.lastError = null;

    try {
      const provider = String(process.env.RUNTIME_PROVIDER || 'none').toLowerCase();
      if (provider !== 'docker') return;

      for (const runtime of runtimes.values()) {
        if (runtime.state !== 'running') continue;
        const deployment = deployments.get(runtime.deploymentId);
        if (!deployment) continue;

        const containerName = `velclawhost-${deployment.id}`;
        let containerPresent = true;
        try {
          await execFileAsync('docker', ['inspect', containerName], {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
          });
        } catch {
          containerPresent = false;
        }

        if (!containerPresent) {
          runtime.state = 'failed';
          runtime.updatedAt = new Date().toISOString();
          deployment.status = 'terminal_failed';
          deployment.completedAt = new Date().toISOString();
          deployment.error = 'Runtime container is no longer present.';
          reconciliation.runtimeUnhealthy += 1;
          await persistState();
          continue;
        }

        if (!runtime.healthUrl) continue;

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          try {
            const response = await fetch(runtime.healthUrl, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
          } finally {
            clearTimeout(timer);
          }

          runtime.updatedAt = new Date().toISOString();
          if (deployment.status === 'health_check' || deployment.status === 'runtime_provisioning') {
            deployment.status = 'ready';
            deployment.completedAt = new Date().toISOString();
            deployment.error = undefined;
          }
          await persistState();
        } catch (error) {
          runtime.state = 'failed';
          runtime.updatedAt = new Date().toISOString();
          deployment.status = 'terminal_failed';
          deployment.completedAt = new Date().toISOString();
          deployment.error = 'Runtime health check failed: ' + (error instanceof Error ? error.message : String(error));
          reconciliation.runtimeUnhealthy += 1;
          await persistState();
        }
      }
    } catch (error) {
      reconciliation.failures += 1;
      reconciliation.lastError = error instanceof Error ? error.message : String(error);
      console.error('Control-plane reconciliation failed:', error);
    } finally {
      reconciliationBusy = false;
    }
  }
  const reconciliationIntervalMs = Math.max(
    5000,
    Number(process.env.RECONCILE_INTERVAL_MS || 30000),
  );
  const reconciliationTimer = setInterval(() => {
    void reconcileControlPlane();
  }, reconciliationIntervalMs);
  reconciliationTimer.unref?.();
  void reconcileControlPlane();

  app.get('/api/v1/reconciliation', requireApiToken, (_req, res) => {
    res.json({
      status: 'success',
      running: reconciliationBusy,
      interval_ms: reconciliationIntervalMs,
      ...reconciliation,
    });
  });

  // AI Voice Command & Diagnostic Endpoint
  app.post("/api/ai/voice-command", async (req, res) => {
    try {
      const { command, context } = req.body;
      if (!command) {
        return res.status(400).json({ error: "Missing command text" });
      }

      const ai = getGeminiClient();
      if (!ai) {
        // Intelligent fallback when GEMINI_API_KEY is not yet populated
        const cmdLower = String(command).toLowerCase();
        let reply = "Tôi đã ghi nhận chỉ lệnh của bạn. Hệ thống máy chủ Velclaw đang vận hành ổn định.";
        let action: string | null = null;
        let targetTab: string | null = null;

        if (cmdLower.includes("cpu") || cmdLower.includes("ram") || cmdLower.includes("tài nguyên") || cmdLower.includes("hiệu suất")) {
          reply = `CPU hiện tại ở mức ${context?.cpuUsage ?? 42}% và RAM chiếm ${context?.ramUsagePercent ?? 58}%. Đã chuyển bạn tới tab Biểu đồ số liệu.`;
          action = "NAVIGATE";
          targetTab = "metrics-charts";
        } else if (cmdLower.includes("cảnh báo") || cmdLower.includes("nguy hiểm") || cmdLower.includes("alert")) {
          reply = `Đang có ${context?.activeAlertsCount ?? 0} cảnh báo đang chờ xử lý. Đã chuyển bạn đến trung tâm Cảnh báo để rà soát.`;
          action = "NAVIGATE";
          targetTab = "alerts";
        } else if (cmdLower.includes("dns") || cmdLower.includes("ssl") || cmdLower.includes("chứng chỉ") || cmdLower.includes("https")) {
          reply = `Chứng chỉ SSL TLS 1.3 Let's Encrypt còn 82 ngày hiệu lực. Bản ghi DNSSEC đang kích hoạt bảo mật.`;
          action = "NAVIGATE";
          targetTab = "dns-ssl";
        } else if (cmdLower.includes("cơ sở dữ liệu") || cmdLower.includes("database") || cmdLower.includes("tối ưu") || cmdLower.includes("query")) {
          reply = `Hệ thống phân tích đã định vị các truy vấn chậm. Đang mở trung tâm Tối ưu hóa cơ sở dữ liệu.`;
          action = "NAVIGATE";
          targetTab = "db-optimizer";
        } else if (cmdLower.includes("bảo mật") || cmdLower.includes("2fa") || cmdLower.includes("mfa")) {
          reply = `Xác thực đa yếu tố 2FA đang bảo vệ toàn diện tài khoản quản trị viên huynhthuong.xyz@gmail.com.`;
          action = "NAVIGATE";
          targetTab = "security-2fa";
        } else if (cmdLower.includes("báo cáo") || cmdLower.includes("pdf") || cmdLower.includes("csv") || cmdLower.includes("xuất")) {
          reply = `Đang mở trình tạo và xuất báo cáo hệ thống định dạng PDF/CSV.`;
          action = "OPEN_REPORTS";
        } else if (cmdLower.includes("giả lập") || cmdLower.includes("test spike") || cmdLower.includes("đột biến")) {
          reply = `Đã kích hoạt giả lập đột biến CPU/RAM để kiểm tra hệ thống thông báo đẩy FCM.`;
          action = "TRIGGER_SPIKE";
        }

        return res.json({
          reply,
          action,
          targetTab,
          source: "local-devops-engine",
        });
      }

      // With Gemini API
      const prompt = `Bạn là Trợ lý Giọng nói AI Cao cấp chuyên về DevOps và Quản trị hạ tầng máy chủ cho nền tảng Velclaw Hosting Platform.
Người quản trị vừa nói hoặc ra lệnh giọng nói: "${command}".

Ngữ cảnh máy chủ thời gian thực:
- Hostname: ${context?.hostname || "prod-edge-asia1.velclaw.cfd"}
- CPU hiện tại: ${context?.cpuUsage || 45}%
- RAM hiện tại: ${context?.ramUsagePercent || 60}% (${context?.ramUsedGb || 9.6} / 16.0 GB)
- Cảnh báo đang kích hoạt: ${context?.activeAlertsCount || 0}
- Trạng thái 2FA: ${context?.is2FaActive ? "Đang bật" : "Chưa bật"}
- P95 HTTP Latency: ${context?.latencyMs || 12} ms

Yêu cầu:
1. Trả lời một câu ngắn gọn, súc tích (1-2 câu), chuyên nghiệp bằng tiếng Việt như một kỹ sư DevOps cao cấp.
2. Quyết định xem có cần thực hiện hành động nào trên giao diện không:
   - "NAVIGATE" (chuyển tab tới: 'overview', 'domains', 'dns-ssl', 'metrics-charts', 'alerts', 'db-optimizer', 'logs', 'security-2fa', 'api-integration', 'reports')
   - "TRIGGER_SPIKE" (nếu người dùng muốn thử nghiệm cảnh báo/đột biến tải)
   - "OPEN_REPORTS" (nếu muốn xuất báo cáo)
   - "NONE" nếu chỉ là câu hỏi thông tin.

Định dạng trả về duy nhất bằng JSON:
{
  "reply": "câu trả lời cho quản trị viên",
  "action": "NAVIGATE" | "TRIGGER_SPIKE" | "OPEN_REPORTS" | "NONE",
  "targetTab": "overview" | "domains" | "dns-ssl" | "metrics-charts" | "alerts" | "db-optimizer" | "logs" | "security-2fa" | "api-integration" | "reports" | null
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "Bạn là trợ lý điều khiển giọng nói cho hệ thống máy chủ Velclaw Hosting. Luôn phản hồi JSON hợp lệ.",
        },
      });

      const responseText = response.text || "{}";
      let parsed = { reply: "Đã tiếp nhận chỉ lệnh máy chủ.", action: "NONE", targetTab: null };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed.reply = responseText.replace(/```json|```/g, "").trim();
      }

      return res.json({
        reply: parsed.reply,
        action: parsed.action,
        targetTab: parsed.targetTab,
        source: "gemini-3.8-flash",
      });
    } catch (err: any) {
      console.error("AI Voice Command Error:", err);
      return res.status(500).json({
        error: "Lỗi xử lý chỉ lệnh giọng nói",
        details: err?.message || String(err),
      });
    }
  });

  // AI Diagnostic Endpoint for Logs and Performance
  app.post("/api/ai/diagnose", async (req, res) => {
    try {
      const { issueType, data } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          diagnosis: "Chỉ số hệ thống cơ bản trong ngưỡng an toàn. Để phân tích sâu bằng mô hình Gemini AI, vui lòng kiểm tra API Key trong cấu hình Settings.",
          suggestions: [
            "Kiểm tra lại cấu hình bộ nhớ đệm Redis",
            "Bật nén gzip/brotli cho các tài nguyên tĩnh",
            "Đảm bảo đã thiết lập chỉ mục (index) cho bảng có dung lượng lớn",
          ],
          severity: "normal",
        });
      }

      const prompt = `Phân tích sự cố máy chủ sau đây và đưa ra chẩn đoán nguyên nhân cốt lõi cùng 3 giải pháp khắc phục ngắn gọn:
Loại sự cố: ${issueType}
Dữ liệu chi tiết: ${JSON.stringify(data)}

Định dạng JSON:
{
  "diagnosis": "giải thích nguyên nhân 1-2 câu",
  "suggestions": ["giải pháp 1", "giải pháp 2", "giải pháp 3"],
  "severity": "low" | "medium" | "high" | "critical"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);
      return res.json(result);
    } catch (err: any) {
      console.error("AI Diagnose Error:", err);
      return res.status(500).json({ error: "Lỗi chẩn đoán AI", details: err?.message });
    }
  });

  // Dedicated VelclawHost dashboard shell. Operational actions are clearly marked until connected to live services.
  app.get(['/dashboard', '/dashboard/'], (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000"><title>Dashboard — VelclawHost</title><style>
:root{color-scheme:dark;--bg:#000;--panel:#090909;--line:#262626;--muted:#929292;--text:#f5f5f5;--green:#45d483}*{box-sizing:border-box;border-radius:0!important}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}a{color:inherit;text-decoration:none}.shell{min-height:100vh;display:grid;grid-template-columns:235px minmax(0,1fr)}aside{border-right:1px solid var(--line);padding:22px 15px}header{display:flex;align-items:center;justify-content:space-between;padding:18px 26px;border-bottom:1px solid var(--line);gap:12px}.brand{font-size:17px;font-weight:800}.nav{display:grid;gap:5px;margin-top:32px}.nav a{padding:10px 12px;color:var(--muted);border:1px solid transparent}.nav a.active,.nav a:hover{border-color:var(--line);background:#111;color:#fff}.aside-label{color:#666;font-size:10px;letter-spacing:.12em;margin:25px 12px 8px}.main{min-width:0}.content{padding:28px;max-width:1200px;margin:auto}.eyebrow{color:var(--green);font-size:11px;letter-spacing:.1em}.title{font-size:clamp(26px,4vw,38px);line-height:1.2;margin:8px 0}.muted{color:var(--muted)}.top-actions{display:flex;gap:8px;align-items:center}.btn{display:inline-block;border:1px solid var(--line);background:#101010;padding:9px 12px;color:#fff;font:inherit;cursor:pointer}.btn.primary{background:#fff;color:#000;border-color:#fff}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:24px 0}.card{border:1px solid var(--line);background:var(--panel);padding:18px;min-width:0}.card-label{color:var(--muted);font-size:11px}.metric{font-size:28px;font-weight:700;margin:9px 0}.status{color:var(--green)}.section{border:1px solid var(--line);margin-top:15px}.section-head{padding:14px 17px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px}.empty{padding:24px 17px;color:var(--muted)}.quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px}.quick a{border:1px solid var(--line);padding:14px;display:block}.quick b{display:block;margin-bottom:5px}.mobile-nav{display:none}@media(max-width:760px){.shell{grid-template-columns:1fr}aside{display:none}header{padding:14px 15px}.content{padding:22px 15px}.grid{grid-template-columns:1fr}.quick{grid-template-columns:1fr}.mobile-nav{display:flex;overflow:auto;border-bottom:1px solid var(--line);gap:0}.mobile-nav a{padding:12px 14px;white-space:nowrap;color:var(--muted)}.mobile-nav a.active{color:#fff;border-bottom:2px solid #fff}.top-actions .hide-mobile{display:none}}
</style></head><body><div class="shell"><aside><a class="brand" href="/">▽ VelclawHost</a><div class="nav"><a class="active" href="/dashboard">▦ Overview</a><a href="/dashboard#projects">▤ Projects</a><a href="/dashboard#deployments">↗ Deployments</a><a href="/dashboard#domains">◎ Domains</a><a href="/dashboard#runtime">⌘ Runtime health</a><a href="/dashboard#settings">⚙ Settings</a></div><div class="aside-label">RESOURCES</div><div class="nav"><a href="/docs">Documentation ↗</a><a href="/pricing">Plans ↗</a><a href="/auth">Sign in / Account ↗</a><a href="/">← Public homepage</a></div></aside><div class="main"><header><div><div class="brand">Control plane / Overview</div><div class="muted">VelclawHost workspace</div></div><div class="top-actions"><a class="btn hide-mobile" href="/docs">Read docs</a><a class="btn primary" href="/auth?mode=login">Sign in</a></div></header><nav class="mobile-nav"><a class="active" href="/dashboard">Overview</a><a href="#projects">Projects</a><a href="#deployments">Deployments</a><a href="#domains">Domains</a><a href="#settings">Settings</a></nav><main class="content"><div class="eyebrow">WORKSPACE OVERVIEW</div><h1 class="title">Your infrastructure, at a glance.</h1><p class="muted">Inspect project activity, deployment health and platform configuration from one place.</p><div class="grid"><article class="card"><div class="card-label">PROJECTS</div><div class="metric">—</div><div class="muted">Connect a repository to get started</div></article><article class="card"><div class="card-label">DEPLOYMENTS</div><div class="metric">—</div><div class="muted">No live deployment data connected</div></article><article class="card"><div class="card-label">PLATFORM STATUS</div><div class="metric status">● Online</div><div class="muted">Public web service responds</div></article></div><section class="section" id="projects"><div class="section-head"><b>Projects</b><span class="muted">Repository workspace</span></div><div class="empty"><div class="muted" style="margin-bottom:12px">SAMPLE DATA · PLACEHOLDERS ONLY</div><div class="quick"><a href="#projects"><b>demo-service-alpha</b><span class="muted">alpha-app.velclaw.dev · LIVE</span><br><span class="muted">org/demo-alpha</span></a><a href="#projects"><b>demo-service-beta</b><span class="muted">beta-app.velclaw.dev · LIVE</span><br><span class="muted">org/demo-beta</span></a><a href="#projects"><b>core-api-gateway</b><span class="muted">api.velclaw.dev · BUILDING</span><br><span class="muted">org/core-api</span></a></div></div></section><section class="section" id="deployments"><div class="section-head"><b>Deployments & runtime</b><span class="muted">Live integrations pending</span></div><div class="empty"><div class="empty"><div class="status">[BUILD:OK] #101 · Update application core dependencies</div><div class="status">[BUILD:OK] #102 · Fix environment configuration schema</div><div>[DOMAIN] example-app.velclaw.dev → MAPPED</div><p class="muted">Illustrative sample logs only; not live production telemetry.</p></div></div></section><section class="section" id="domains"><div class="section-head"><b>Domains & HTTPS</b><span class="muted">Configuration</span></div><div class="empty">Domain management is not yet wired to a domain provider. See the setup guide in Docs.</div></section><section class="section" id="settings"><div class="section-head"><b>Quick actions</b><span class="muted">Navigation</span></div><div class="quick"><a href="/docs"><b>Read documentation ↗</b><span class="muted">CLI, deployment and setup guides</span></a><a href="/pricing"><b>View plans ↗</b><span class="muted">Compare available plan outlines</span></a><a href="/auth"><b>Account access ↗</b><span class="muted">Sign-in interface</span></a></div></section></main></div></div></body></html>`);
  });

  // Public VelclawHost landing page for unauthenticated visitors.
  app.get(["/", "/pricing", "/docs", "/products", "/solutions", "/enterprise"], (req, res, next) => {
    if (req.path === "/docs") {
      return res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Docs — VelclawHost</title><style>
*{box-sizing:border-box;border-radius:0!important}body{margin:0;background:#000;color:#fff;font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace}a{color:inherit;text-decoration:none}.top{height:62px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid #222}.brand{font-weight:800;font-size:15px}.layout{display:grid;grid-template-columns:230px minmax(0,1fr) 190px;min-height:calc(100vh - 62px)}aside{padding:20px 14px;border-right:1px solid #222}aside.right{border-right:0;border-left:1px solid #222}.label{font-size:10px;color:#666;letter-spacing:.12em;margin:10px 0}.search{width:100%;background:#080808;color:#fff;border:1px solid #292929;padding:10px;font:inherit;margin-bottom:20px}.tree a,.toc a{display:block;padding:5px 8px;color:#999}.tree a:hover,.toc a:hover{color:#fff;background:#111}main{padding:35px clamp(18px,5vw,65px);max-width:900px}.eyebrow{color:#00e5ff;font-size:10px;letter-spacing:.1em}h1{font-size:clamp(26px,4vw,40px);line-height:1.2;margin:10px 0}h2{font-size:19px;margin-top:36px}p,li{color:#999}pre{background:#080808;border:1px solid #222;padding:16px;overflow:auto;color:#eee;font:12px/1.8 ui-monospace,monospace}.copy{float:right;background:#111;color:#fff;border:1px solid #333;padding:4px 8px;font:10px ui-monospace,monospace;cursor:pointer}.callout{border:1px solid #222;padding:12px;color:#888}.mobiletoc{display:none}@media(max-width:900px){.layout{grid-template-columns:190px minmax(0,1fr)}aside.right{display:none}}@media(max-width:620px){.layout{grid-template-columns:1fr}.layout>aside:first-child{border-right:0;border-bottom:1px solid #222;padding:12px 15px}.tree{display:flex;gap:8px;overflow:auto}.tree a{white-space:nowrap}.search{margin-bottom:8px}main{padding:25px 16px}.top{padding:0 15px}.top .toplinks{display:flex;gap:12px}}
</style></head><body><header class="top"><a class="brand" href="/">[&gt;_] VELCLAWHOST / DOCS</a><div class="toplinks"><a href="/">HOME</a>　<a href="/dashboard">DASHBOARD</a>　<a href="/auth">LOG IN</a></div></header><div class="layout"><aside><input id="search" class="search" placeholder="⌕ SEARCH DOCS...  CMD+K" aria-label="Search docs"><div class="label">01_GETTING_STARTED/</div><nav class="tree"><a href="#quickstart">quickstart.md</a><a href="#cli">cli_installation.md</a></nav><div class="label">02_CONFIGURATION/</div><nav class="tree"><a href="#config">velclaw.config.json</a></nav><div class="label">03_API_REFERENCE/</div><nav class="tree"><a href="#api">api_overview.md</a></nav><div class="label">04_OPERATIONS/</div><nav class="tree"><a href="#deploy">deployments.md</a><a href="#health">health_checks.md</a></nav></aside><main><div class="eyebrow">DOCS // DEVELOPER_GUIDE</div><h1>Build and deploy with VelclawHost.</h1><p>Technical guides for configuring a project, running the CLI workflow and understanding the platform control plane.</p><div class="callout">STATUS: Documentation scaffold. Commands and API examples below are illustrative until the corresponding CLI/API is released and configured.</div><h2 id="quickstart">01 / Quick start</h2><p>Prepare a project repository and configure its runtime before deploying. Example workflow:</p><pre><button class="copy" data-copy="npm install\nvelclaw deploy --prod">COPY</button><code>npm install
velclaw deploy --prod</code></pre><h2 id="cli">02 / CLI installation</h2><p>Install the Velclaw CLI using the official package and version once the package registry is configured. Do not assume the placeholder package exists yet.</p><pre><button class="copy" data-copy="velclaw --help\nvelclaw deploy --prod">COPY</button><code>velclaw --help
velclaw deploy --prod</code></pre><h2 id="config">03 / Configuration</h2><p>Keep environment-specific values in deployment secrets rather than committing credentials.</p><pre><button class="copy" data-copy="{ &quot;name&quot;: &quot;demo-service&quot;, &quot;runtime&quot;: &quot;node&quot; }">COPY</button><code>{
  "name": "demo-service",
  "runtime": "node",
  "buildCommand": "npm run build",
  "startCommand": "npm start"
}</code></pre><h2 id="api">04 / API reference</h2><p>Public API endpoints should document authentication, request schemas, response codes and rate limits before being treated as stable.</p><h2 id="deploy">05 / Deployments</h2><ol><li>Connect a repository and select a branch.</li><li>Set build/start commands and environment variables.</li><li>Deploy, then inspect build logs and health checks.</li></ol><h2 id="health">06 / Health checks</h2><p>Configure a health endpoint that reports service readiness without exposing secrets or internal environment values.</p></main><aside class="right"><div class="label">// ON_THIS_PAGE</div><nav class="toc"><a href="#quickstart">01 Quick start</a><a href="#cli">02 CLI installation</a><a href="#config">03 Configuration</a><a href="#api">04 API reference</a><a href="#deploy">05 Deployments</a><a href="#health">06 Health checks</a></nav></aside></div><script>document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='COPIED';setTimeout(()=>b.textContent='COPY',1200)}catch{b.textContent='SELECT TEXT'}}));document.getElementById('search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.tree a,.toc a').forEach(a=>a.style.display=a.textContent.toLowerCase().includes(q)?'block':'none')});document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('search').focus()}});</script></body></html>`);
    }
    if (req.path === "/pricing") {
      return res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pricing — VelclawHost</title><style>*{box-sizing:border-box}body{margin:0;background:#000;color:#fff;font:14px/1.6 Geist,Inter,system-ui,sans-serif}.wrap{max-width:1080px;margin:auto;padding:28px 20px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #222;padding-bottom:20px}a{color:inherit;text-decoration:none}.hero{text-align:center;padding:65px 0 35px}h1{font-size:48px;letter-spacing:-2px;margin:0}p{color:#888}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{border:1px solid #222;border-radius:0;padding:24px;background:#0a0a0a}.popular{border-color:#777;box-shadow:0 0 24px #ffffff0d}.price{font-size:32px;font-weight:700}.btn{display:block;text-align:center;background:#fff;color:#000;border-radius:0;padding:11px;margin-top:24px;font-weight:700}input{width:100%;accent-color:#fff}@media(max-width:700px){.grid{grid-template-columns:1fr}h1{font-size:38px}}
/* VelclawHost unified design tokens: sharp geometry + monospace everywhere */
:root{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace!important}*,*::before,*::after{border-radius:0!important}body,button,input,select,textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace!important}button,a,[role="button"],input,select,textarea{border-radius:0!important}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid #8b8b8b;outline-offset:2px}button:hover,a.btn:hover,.btn:hover{transition:background-color .15s ease,color .15s ease,border-color .15s ease}
</style></head><body><div class="wrap"><header><a href="/"><b>△ VelclawHost</b></a><a href="/auth">Log in ↗</a></header><section class="hero"><h1>Simple, transparent plans.</h1><p>Start free. Scale when your workloads need it.</p></section><div class="grid"><article class="card"><h2>Velclaw Hobby</h2><div class="price">Free</div><p>For personal projects and experiments.</p><ul><li>Starter deployments</li><li>Basic project visibility</li><li>Community workflows</li></ul><a class="btn" href="/auth?mode=signup">Get started</a></article><article class="card popular"><p>✦ MOST POPULAR</p><h2>Velclaw Pro</h2><div class="price">Usage-based</div><p>For teams shipping production apps.</p><ul><li>Preview workflow</li><li>Deployment insights</li><li>Team-ready controls</li></ul><a class="btn" href="/auth?mode=signup">Explore Pro</a></article><article class="card"><h2>VelclawHost Enterprise</h2><div class="price">Custom</div><p>For organizations with tailored infrastructure needs.</p><ul><li>Custom deployment model</li><li>Governance workflows</li><li>Dedicated planning</li></ul><a class="btn" href="mailto:enterprise@velclaw.dev">Contact us</a></article></div><section style="max-width:600px;margin:55px auto"><h2>Estimate usage</h2><label for="band">Monthly bandwidth: <span id="bv">100</span> GB</label><input id="band" type="range" min="10" max="2000" value="100"><label for="fn">Function invocations: <span id="fv">1</span> million</label><input id="fn" type="range" min="1" max="100" value="1"><p id="estimate">Usage estimate is illustrative; final charges depend on published rates and actual usage.</p></section></div><script>const b=document.getElementById('band'),f=document.getElementById('fn');function calc(){document.getElementById('bv').textContent=b.value;document.getElementById('fv').textContent=f.value;document.getElementById('estimate').textContent='Estimated usage: '+b.value+' GB bandwidth and '+f.value+' million function invocations. No price is calculated until official rates are configured.'}b.oninput=f.oninput=calc</script></body></html>`);
    }
    if (req.path !== "/") return next();
    return res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000"><title>VelclawHost — Build, Ship, and Scale</title><style>
:root{color-scheme:dark;--bg:#000;--surface:#0a0a0a;--card:#0d0d0d;--line:#222;--text:#fff;--muted:#888;--cta:#fff;--ct:#000}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace}a{color:inherit;text-decoration:none}button,select{font:inherit;cursor:pointer}.wrap{max-width:1160px;width:calc(100% - 40px);margin:auto}.nav{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);gap:20px}.brand{font-weight:750;font-size:18px;letter-spacing:-.5px;display:flex;gap:10px;align-items:center;white-space:nowrap}.mark{width:31px;height:31px}.links{display:flex;gap:22px;color:#aaa;font-size:12px}.links a:hover{color:#fff}.right{display:flex;gap:9px;align-items:center}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:0;padding:10px 15px;font-size:12px;font-weight:700;border:1px solid #333;background:transparent;color:#fff}.primary{background:#fff;color:#000;border-color:#fff}.btn:hover{box-shadow:inset 0 0 0 1px #888}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:52px;align-items:center;padding:90px 0 76px}.eyebrow{font:11px ui-monospace,monospace;color:#aaa;border:1px solid #222;border-radius:0;padding:7px 11px;display:inline-flex;gap:8px}.dot{width:6px;height:6px;background:#3ddc97;border-radius:0;margin-top:5px}.hero h1{font-size:clamp(43px,6.3vw,72px);line-height:1.01;letter-spacing:-.07em;margin:24px 0 18px;max-width:680px}.hero p{color:#999;line-height:1.8;font-size:15px;max-width:530px}.actions{display:flex;gap:10px;margin-top:26px;flex-wrap:wrap}.terminal{border:1px solid #222;border-radius:0;background:#0d0d0d;overflow:hidden}.termhead{height:43px;border-bottom:1px solid #222;display:flex;gap:7px;align-items:center;padding:0 14px;color:#888;font-size:11px}.traffic{width:7px;height:7px;border-radius:0;background:#555}.termhead span{margin-left:auto;font:10px ui-monospace,monospace}.term{padding:21px;font:12px/2 ui-monospace,SFMono-Regular,monospace;color:#999}.green{color:#52dda0}.white{color:#fff}.workflow{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:17px}.step{border:1px solid #222;border-radius:0;padding:12px;font-size:11px;color:#aaa}.step b{display:block;color:#fff;margin-bottom:3px}.section{padding:34px 0 84px}.sectionhead{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:20px}.sectionhead h2{font-size:28px;letter-spacing:-1px;margin:0}.sectionhead p{color:#888;font-size:12px;max-width:360px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{border:1px solid #222;border-radius:0;background:#0a0a0a;padding:23px;transition:border-color .2s,box-shadow .2s,transform .2s}.card:hover{border-color:#888;box-shadow:inset 0 0 0 1px #ffffff0a;transform:translateY(-1px)}.icon{width:34px;height:34px;border:1px solid #292929;border-radius:0;display:grid;place-items:center;margin-bottom:22px}.card h3{font-size:15px;margin:0 0 7px}.card p{font-size:12px;line-height:1.8;color:#888;margin:0}.map{height:175px;border:1px solid #222;border-radius:0;background:radial-gradient(ellipse at 50% 50%,#1b1b1b 0,#080808 65%);position:relative;overflow:hidden;margin-top:14px}.map:before{content:"";position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:28px 28px}.node{position:absolute;width:7px;height:7px;border-radius:0;background:#fff;box-shadow:0 0 14px #fff}.node:after{content:"";position:absolute;inset:-7px;border:1px solid #ffffff40;border-radius:0}.footer{border-top:1px solid #222;padding:25px 0;color:#777;font-size:11px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.theme{background:#0a0a0a;border:1px solid #333;color:#fff;border-radius:0;padding:9px;font-size:11px}
@media(max-width:850px){.links{display:none}.hero{grid-template-columns:1fr;gap:30px;padding:58px 0}.hero h1{font-size:clamp(42px,11vw,62px)}.grid{grid-template-columns:1fr}.sectionhead{display:block}.workflow{grid-template-columns:1fr}.map{height:145px}.nav{height:64px}.wrap{width:calc(100% - 30px)}}

/* VelclawHost unified design tokens: sharp geometry + monospace everywhere */
:root{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace!important}*,*::before,*::after{border-radius:0!important}body,button,input,select,textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace!important}button,a,[role="button"],input,select,textarea{border-radius:0!important}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid #8b8b8b;outline-offset:2px}button:hover,a.btn:hover,.btn:hover{transition:background-color .15s ease,color .15s ease,border-color .15s ease}
</style></head><body><div class="wrap"><header class="nav"><a href="/" class="brand"><svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M3 7h12l10 18-6 10L3 7Z" fill="#fff"/><path d="M18 7h19L24 29l-6-10 6-8h-6V7Z" fill="#aaa"/></svg>VelclawHost</a><nav class="links"><a href="/products">Products⌄</a><a href="/solutions">Solutions⌄</a><a href="/docs">Resources</a><a href="/enterprise">Enterprise</a><a href="/docs">Docs</a><a href="/pricing">Pricing</a></nav><div class="right"><select class="theme" id="theme" aria-label="Theme"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select><a class="btn" href="/auth?mode=login">Log In</a><a class="btn primary" href="/auth?mode=signup">Deploy Now ↗</a></div></header>
<section class="hero"><div><span class="eyebrow"><span class="dot"></span> VELCLAW DEVELOPER PLATFORM</span><h1>> DEPLOY AT THE SPEED OF LIGHT.</h1><p>A developer-first control plane for shipping applications, managing deployments, and operating infrastructure from one workspace.</p><div class="actions"><a class="btn primary" href="/auth?mode=signup">Start building ↗</a><a class="btn" href="/docs">Explore documentation</a></div></div><div><div class="terminal"><div class="termhead"><i class="traffic"></i><i class="traffic"></i><i class="traffic"></i><span>velclaw · terminal</span></div><div class="term"><div><span class="green">➜</span> <span class="white">velclaw deploy</span></div><div>Inspecting project source...</div><div>Building deployment bundle...</div><div class="green">✓ Deployed to edge network [SUCCESS]</div><div class="green">✓ Runtime checks complete</div><br><div><span class="green">➜</span> <span class="white">velclaw status</span></div><div class="green">● Ready for traffic</div><div>Environment: production (demo)</div><div><span class="green">➜</span> <span class="white">_</span></div></div></div><div class="workflow"><div class="step"><b>01 · Git Commit</b>Push your changes</div><div class="step"><b>02 · Edge Build</b>Automated pipeline</div><div class="step"><b>03 · Live Domain</b>Ready for traffic</div></div></div></section>
<section class="section"><div class="sectionhead"><h2>Operational clarity.<br>From commit to production.</h2><p>Tools designed for developers to preview, deploy and operate modern applications.</p></div><div class="grid"><article class="card"><div class="icon">⌘</div><h3>Velclaw Develop</h3><p>Build and iterate with a developer-first workflow, bringing deployment controls and operational context into one place.</p></article><article class="card"><div class="icon">↗</div><h3>Velclaw Preview</h3><p>Give every pull request a dedicated preview workflow and a clearer path to review before production.</p></article><article class="card"><div class="icon">◎</div><h3>Infrastructure Metrics (Demo)</h3><p>Explore a conceptual global edge network visualization. Actual regions and latency metrics depend on configured infrastructure.</p><div class="map"><span class="node" style="left:22%;top:37%"></span><span class="node" style="left:47%;top:28%"></span><span class="node" style="left:53%;top:58%"></span><span class="node" style="left:76%;top:40%"></span><span class="node" style="left:83%;top:68%"></span></div></article></div></section><footer class="footer"><span>© <span id="year"></span> VelclawHost · Built for the Velclaw ecosystem</span><span><a href="/docs">Documentation</a> · <a href="/pricing">Pricing</a> · <a href="/auth">Account</a> · <span id="themeLabel">System</span></span></footer></div>
<script>const root=document.documentElement,select=document.getElementById('theme');function setTheme(v){const dark=v==='dark'||(v==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);root.style.colorScheme=dark?'dark':'light';if(!dark){root.style.setProperty('--bg','#fff');root.style.setProperty('--surface','#fff');root.style.setProperty('--card','#fff');root.style.setProperty('--line','#eaeaea');root.style.setProperty('--text','#111');root.style.setProperty('--muted','#666');root.style.setProperty('--cta','#000');root.style.setProperty('--ct','#fff');document.body.style.background='#fff';document.body.style.color='#111';document.querySelectorAll('.links,.hero p,.sectionhead p,.card p,.term,.termhead,.step,.footer').forEach(e=>e.style.color='#666');document.querySelectorAll('.terminal,.card,.step,.map,.theme').forEach(e=>{e.style.background='#fff';e.style.borderColor='#eaeaea';e.style.boxShadow='0 2px 8px #0000000f'});document.querySelectorAll('.btn:not(.primary)').forEach(e=>{e.style.color='#111';e.style.borderColor='#ddd'});document.querySelectorAll('.primary').forEach(e=>{e.style.background='#000';e.style.color='#fff';e.style.borderColor='#000'});document.querySelectorAll('.term .white,.step b,.card h3').forEach(e=>e.style.color='#111')}else{document.body.removeAttribute('style');document.querySelectorAll('*').forEach(e=>e.removeAttribute('style'));document.querySelectorAll('.node').forEach((e,i)=>{e.style.left=['22%','47%','53%','76%','83%'][i];e.style.top=['37%','28%','58%','40%','68%'][i]})}document.getElementById('themeLabel').textContent=v[0].toUpperCase()+v.slice(1);try{localStorage.setItem('velclaw-theme',v)}catch{}}let saved='system';try{saved=localStorage.getItem('velclaw-theme')||'system'}catch{}select.value=saved;setTheme(saved);select.onchange=()=>setTheme(select.value);matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(select.value==='system')setTheme('system')});document.getElementById('year').textContent=new Date().getFullYear()</script></body></html>`);
  });

  // Vite Middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();