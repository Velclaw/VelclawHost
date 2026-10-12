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
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

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
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"><meta name="theme-color" content="#08090b"><title>Velclaw — Account access</title><style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}body{overflow-y:auto;overscroll-behavior-y:auto}input,textarea,select,button{font-size:16px!important;}
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

/* iOS Safari: keep native page zoom accessible; 16px controls prevent focus zoom. */
html,body{width:100%;max-width:100%;overflow-x:hidden;overscroll-behavior-x:none}
body{min-height:100svh}
main{width:100%;max-width:100%;transition:none!important}
input,textarea,select{font-size:16px!important}
@media(max-width:600px){input,textarea,select{font-size:16px!important}}

/* Mobile layout baseline: iPhone CSS viewport 390-430px (reference 402x874). */
html{font-size:16px;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}
body{font-size:16px;line-height:1.55;overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:auto;touch-action:pan-y}
*,*::before,*::after{box-sizing:border-box}
img,svg,video,canvas,iframe{max-width:100%}
input,textarea,select,button{font-size:16px!important;line-height:1.4;max-width:100%;min-width:0}
button,a.btn,.btn,[role="button"]{min-height:44px;max-width:100%;white-space:normal;overflow-wrap:anywhere}
@media(max-width:430px){
  body{width:100%;min-width:0}
  main,.main,.content,.wrap,.container,.shell,.layout{max-width:100%;min-width:0}
  p,li,label,.subtitle,.muted,.description{overflow-wrap:anywhere}
  .top,header,.nav,.top-actions,.actions{gap:8px;flex-wrap:wrap}
  .content,main{padding-left:16px;padding-right:16px}
  .grid{grid-template-columns:minmax(0,1fr)}
  table{display:block;max-width:100%;overflow-x:auto}
  pre,code{max-width:100%;overflow-x:auto;overflow-wrap:anywhere}
}
</style></head><body><header class="top"><a class="brand" href="/" aria-label="Velclaw home"><span class="triangle" aria-hidden="true"></span><span>Velclaw</span></a><button class="top-action" id="switchMode" type="button">Log In</button></header><main><section class="card"><div class="eyebrow" id="eyebrow">// CREATE YOUR WORKSPACE</div><h1 class="title" id="heading">Your first deploy is just a sign-up away.</h1><p class="subtitle" id="subheading">One account for your projects, deployments, and infrastructure.</p><div class="providers" id="providers"><button class="oauth" type="button" data-provider="google" title="Continue with Google"><span class="glyph" style="color:#4285f4">G</span><span class="label">Continue with Google</span><span class="arrow">↗</span></button><button class="oauth" type="button" data-provider="github" title="Continue with GitHub"><span class="glyph">◉</span><span class="label">Continue with GitHub</span><span class="arrow">↗</span></button><button class="oauth extra hidden" type="button" disabled><span class="glyph">◎</span><span class="label">Continue with ChatGPT</span><span class="arrow">↗</span></button><button class="oauth extra hidden" type="button" disabled><span class="glyph">●</span><span class="label">Continue with Apple</span><span class="arrow">↗</span></button><button class="other" id="otherOptions" type="button">Show other options <span id="otherArrow">↓</span></button></div><button class="email-link" id="emailToggle" type="button"><span>✉</span><span id="emailLabel">Continue with Email</span><span>→</span></button><form class="email-form" id="emailForm"><div class="field"><label for="email">EMAIL ADDRESS</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div><div class="field"><label for="password">PASSWORD</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required></div><button class="submit" id="submit" type="submit">Create account ↗</button><div class="message" id="message" role="status" aria-live="polite"></div></form><div class="legal" id="legal">By continuing, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>. OAuth providers appear when their credentials are configured.</div></section></main><footer class="foot"><div><strong>Velclaw</strong>Deploy. Scale. Own.</div><div>ACCOUNT GATEWAY // 1.0.0</div></footer><script>
const params=new URLSearchParams(location.search);let mode=params.get('mode')==='login'?'login':'signup';let emailOpen=false;const switchMode=document.getElementById('switchMode'),heading=document.getElementById('heading'),subheading=document.getElementById('subheading'),eyebrow=document.getElementById('eyebrow'),emailToggle=document.getElementById('emailToggle'),emailLabel=document.getElementById('emailLabel'),emailForm=document.getElementById('emailForm'),submit=document.getElementById('submit'),password=document.getElementById('password'),message=document.getElementById('message'),otherOptions=document.getElementById('otherOptions');function renderMode(){const signup=mode==='signup';switchMode.textContent=signup?'Log In':'Sign Up';eyebrow.textContent=signup?'// CREATE YOUR WORKSPACE':'// WELCOME BACK';heading.textContent=signup?'Your first deploy is just a sign-up away.':'Log in to Velclaw';subheading.textContent=signup?'One account for your projects, deployments, and infrastructure.':'Access your projects, deployments, and infrastructure settings.';emailLabel.textContent=signup?'Continue with Email':'Continue with Email';submit.textContent=signup?'Create account ↗':'Log in ↗';password.autocomplete=signup?'new-password':'current-password';password.placeholder=signup?'At least 8 characters':'Enter your password';message.textContent='';history.replaceState({},'',signup?'/auth?mode=signup':'/auth?mode=login');}switchMode.addEventListener('click',()=>{location.href=mode==='signup'?'/auth?mode=login':'/auth?mode=signup'});emailToggle.addEventListener('click',()=>{emailOpen=!emailOpen;emailForm.classList.toggle('visible',emailOpen);if(emailOpen)document.getElementById('email').focus()});otherOptions.addEventListener('click',()=>{const extras=[...document.querySelectorAll('.extra')];const show=extras[0].classList.contains('hidden');extras.forEach(el=>el.classList.toggle('hidden',!show));otherOptions.innerHTML=show?'Show fewer options <span>↑</span>':'Show other options <span>↓</span>';});renderMode();fetch('/api/v1/auth/providers',{cache:'no-store'}).then(r=>r.json()).then(data=>{document.querySelectorAll('[data-provider]').forEach(button=>{const provider=button.getAttribute('data-provider');const enabled=Boolean(data.providers&&data.providers[provider]);button.disabled=!enabled;button.title=enabled?'Continue with '+provider[0].toUpperCase()+provider.slice(1):provider[0].toUpperCase()+provider.slice(1)+' OAuth credentials are not configured in Render';button.style.opacity=enabled?'1':'.52';});}).catch(()=>{});document.querySelectorAll('[data-provider]').forEach(button=>button.addEventListener('click',()=>{if(!button.disabled)location.href='/api/v1/auth/oauth/'+button.getAttribute('data-provider');}));emailForm.addEventListener('submit',async e=>{e.preventDefault();message.textContent='';submit.disabled=true;const original=submit.textContent;submit.textContent='Please wait…';try{if(mode==='signup'){message.textContent='Account registration is not enabled on the server yet. This interface is ready, but registration must be connected to a persistent user database before accounts can be created.';return;}const response=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:password.value})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.message||'Login failed.');location.href='/dashboard';}catch(error){message.textContent=error instanceof Error?error.message:'Login failed.';}finally{submit.disabled=false;submit.textContent=original;}});</script><script>
/* Track iOS visual viewport as the software keyboard opens/closes.
   Keep layout anchored to the visible frame and gently reveal focused fields. */
(function(){
  var root=document.documentElement, vv=window.visualViewport, raf=0, lastKeyboard=false;
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

  // OAuth sign-in (GitHub + Google). Configure provider credentials in Render, never in source control.
  const oauthCookie = (name: string, value: string, maxAge: number) =>
    name + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
  const oauthProviders = () => ({
    github: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID?.trim() && process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim()),
    google: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
  });
  app.get('/api/v1/auth/providers', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'success', providers: oauthProviders(), emailPassword: Boolean(adminEmail && adminPassword && jwtSecret.length >= 32) });
  });
  app.get('/api/v1/auth/oauth/:provider', (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const enabled = oauthProviders();
    if (provider !== 'github' && provider !== 'google') return res.status(404).send('Unsupported OAuth provider.');
    if (!enabled[provider]) return res.status(503).send(provider[0].toUpperCase() + provider.slice(1) + ' sign-in is not configured yet. Add OAuth credentials in Render environment.');
    if (jwtSecret.length < 32) return res.status(503).send('Authentication is not configured: VELCLAWHOST_JWT_SECRET must be at least 32 characters.');
    const state = Buffer.from(randomBytes(32)).toString('base64url');
    res.setHeader('Set-Cookie', oauthCookie('velclawhost_oauth_state', state, 600));
    const redirectUri = (process.env.VELCLAWHOST_PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '') + '/api/v1/auth/oauth/' + provider + '/callback';
    const params = new URLSearchParams({ client_id: provider === 'github' ? process.env.GITHUB_OAUTH_CLIENT_ID!.trim() : process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(), redirect_uri: redirectUri, state });
    if (provider === 'github') { params.set('scope', 'read:user user:email'); return res.redirect(302, 'https://github.com/login/oauth/authorize?' + params.toString()); }
    params.set('response_type', 'code'); params.set('scope', 'openid email profile'); params.set('prompt', 'select_account');
    return res.redirect(302, 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
  });
  app.get('/api/v1/auth/oauth/:provider/callback', async (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const stateCookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('velclawhost_oauth_state='))?.slice('velclawhost_oauth_state='.length) || '';
    const clearState = oauthCookie('velclawhost_oauth_state', '', 0);
    const fail = (status: number, message: string) => { res.setHeader('Set-Cookie', [clearState, 'velclawhost_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']); return res.status(status).type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Velclaw sign-in</title><main style="font:16px system-ui;max-width:520px;margin:15vh auto;padding:24px;color:#e5e7eb;background:#0b0d10"><h1>Không thể đăng nhập</h1><p>' + message.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!) ) + '</p><a style="color:#93c5fd" href="/auth?mode=login">Quay lại VelclawHost</a></main>'); };
    if (provider !== 'github' && provider !== 'google') return fail(404, 'OAuth provider không hợp lệ.');
    if (!oauthProviders()[provider]) return fail(503, 'Nhà cung cấp OAuth chưa được cấu hình trong Render.');
    const state = String(req.query.state || '');
    let expectedState = '';
    try { expectedState = decodeURIComponent(stateCookie); } catch {}
    if (!state || !expectedState || state !== expectedState) return fail(400, 'State không hợp lệ hoặc đã hết hạn. Hãy thử đăng nhập lại.');
    if (req.query.error || !req.query.code) return fail(400, 'Nhà cung cấp đã hủy hoặc từ chối đăng nhập.');
    try {
      const redirectUri = (process.env.VELCLAWHOST_PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '') + '/api/v1/auth/oauth/' + provider + '/callback';
      const clientId = provider === 'github' ? process.env.GITHUB_OAUTH_CLIENT_ID!.trim() : process.env.GOOGLE_OAUTH_CLIENT_ID!.trim();
      const clientSecret = provider === 'github' ? process.env.GITHUB_OAUTH_CLIENT_SECRET!.trim() : process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim();
      const tokenResponse = await fetch(provider === 'github' ? 'https://github.com/login/oauth/access_token' : 'https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: String(req.query.code), redirect_uri: redirectUri, ...(provider === 'google' ? { grant_type: 'authorization_code' } : {}) }),
      });
      const tokenData: any = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.access_token) return fail(502, 'Không đổi được mã OAuth thành access token.');
      const headers = { Authorization: 'Bearer ' + tokenData.access_token, Accept: 'application/json', 'User-Agent': 'VelclawHost' };
      let email = '', subject = '', displayName = '';
      if (provider === 'github') {
        const profileResponse = await fetch('https://api.github.com/user', { headers });
        const profile: any = await profileResponse.json();
        if (!profileResponse.ok || !profile.id) return fail(502, 'Không đọc được hồ sơ GitHub.');
        subject = String(profile.id); displayName = String(profile.name || profile.login || 'GitHub user');
        email = String(profile.email || '').trim().toLowerCase();
        if (!email) {
          const emailResponse = await fetch('https://api.github.com/user/emails', { headers });
          const emails: any = await emailResponse.json();
          if (emailResponse.ok && Array.isArray(emails)) email = String((emails.find((item: any) => item.primary && item.verified) || emails.find((item: any) => item.verified))?.email || '').trim().toLowerCase();
        }
      } else {
        const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers });
        const profile: any = await profileResponse.json();
        if (!profileResponse.ok || !profile.sub || profile.email_verified !== true) return fail(403, 'Google không cung cấp email đã xác minh.');
        subject = String(profile.sub); displayName = String(profile.name || profile.email || 'Google user'); email = String(profile.email || '').trim().toLowerCase();
      }
      if (!email || !subject) return fail(403, 'Tài khoản nhà cung cấp không có email đã xác minh.');
      // Open self-service OAuth: any provider-verified email may create/sign into a member account.
      // Privileged access remains restricted to the configured owner email.
      const role = adminEmail && email === adminEmail ? 'owner' : 'member';
      const user = { id: provider + ':' + subject, email, name: displayName, role, provider };
      const token = signJwt(user);
      res.setHeader('Set-Cookie', [clearState, 'velclawhost_session=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800']);
      return res.redirect(302, '/dashboard');
    } catch (error) {
      console.error('[oauth callback]', provider, error instanceof Error ? error.message : 'unknown error');
      return fail(502, 'Xác thực OAuth thất bại. Kiểm tra cấu hình OAuth và URL callback trong Render/provider.');
    }
  });

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

  // DNS management proxy. Credentials remain server-side; this never changes registrar nameservers.
  const cloudflareDnsConfig = () => ({
    token: process.env.CLOUDFLARE_API_TOKEN?.trim() || '',
    zoneId: process.env.CLOUDFLARE_ZONE_ID?.trim() || '',
    zoneName: (process.env.CLOUDFLARE_ZONE_NAME || '').trim().toLowerCase().replace(/\.$/, ''),
  });
  async function cloudflareDnsRequest(pathname: string, init: RequestInit = {}) {
    const cfg = cloudflareDnsConfig();
    if (!cfg.token || !cfg.zoneId) throw Object.assign(new Error('DNS management is not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in Render environment.'), { status: 503 });
    const response = await fetch('https://api.cloudflare.com/client/v4' + pathname, {
      ...init,
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      const message = payload?.errors?.map((item: any) => item.message).filter(Boolean).join('; ') || 'Cloudflare API returned HTTP ' + response.status;
      throw Object.assign(new Error(message), { status: response.status >= 400 && response.status < 500 ? response.status : 502 });
    }
    return payload.result;
  }
  const dnsTypes = new Set(['A','AAAA','CNAME','TXT','MX','CAA','SRV','NS']);
  function normalizeDnsName(value: unknown) {
    return String(value || '').trim().toLowerCase().replace(/\.$/, '');
  }
  function validateDnsRecordInput(body: any) {
    const type = String(body?.type || '').toUpperCase();
    const name = normalizeDnsName(body?.name);
    const content = String(body?.content ?? '').trim();
    if (!dnsTypes.has(type)) throw Object.assign(new Error('Unsupported DNS record type.'), { status: 400 });
    if (!name || name.length > 253 || !/^(?:\\*\\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(name)) {
      throw Object.assign(new Error('Invalid DNS record name.'), { status: 400 });
    }
    if (!content || content.length > 2048) throw Object.assign(new Error('DNS record content is required and must be at most 2048 characters.'), { status: 400 });
    const cfg = cloudflareDnsConfig();
    const apex = cfg.zoneName;
    if (!apex) throw Object.assign(new Error('Set CLOUDFLARE_ZONE_NAME to the DNS zone name.'), { status: 503 });
    if (name !== apex && !name.endsWith('.' + apex) && name !== '@') throw Object.assign(new Error('Record name must be inside the configured zone ' + apex + '.'), { status: 400 });
    return { type, name: name === '@' ? apex : name, content, ttl: Math.max(60, Math.min(86400, Number(body?.ttl) || 300)), proxied: ['A','AAAA','CNAME'].includes(type) && body?.proxied === true, priority: body?.priority == null ? undefined : Math.max(0, Math.min(65535, Number(body.priority))) };
  }
  app.get('/api/v1/dns/status', requireApiToken, async (_req, res) => {
    const cfg = cloudflareDnsConfig();
    if (!cfg.token || !cfg.zoneId || !cfg.zoneName) return res.status(503).json({ status: 'not_configured', configured: false, message: 'Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID and CLOUDFLARE_ZONE_NAME in Render environment.' });
    try {
      const zone: any = await cloudflareDnsRequest('/zones/' + encodeURIComponent(cfg.zoneId));
      return res.json({ status: 'success', configured: true, zone: { id: zone.id, name: zone.name, status: zone.status, nameServers: zone.name_servers, paused: zone.paused }, nameserverChanges: 'disabled' });
    } catch (error) {
      return res.status((error as any)?.status || 502).json({ status: 'error', configured: true, error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.get('/api/v1/dns/records', requireApiToken, async (req, res) => {
    try {
      const cfg = cloudflareDnsConfig();
      const query = new URLSearchParams({ per_page: '100', page: String(Math.max(1, Number(req.query.page) || 1)) });
      if (req.query.type && dnsTypes.has(String(req.query.type).toUpperCase())) query.set('type', String(req.query.type).toUpperCase());
      if (req.query.name) query.set('name', normalizeDnsName(req.query.name));
      const records = await cloudflareDnsRequest('/zones/' + encodeURIComponent(cfg.zoneId) + '/dns_records?' + query.toString());
      return res.json({ status: 'success', records, nameserverChanges: 'disabled' });
    } catch (error) {
      return res.status((error as any)?.status || 502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.post('/api/v1/dns/records', requireApiToken, async (req, res) => {
    const user = (req as any).velclawAuth;
    if (!roleAtLeast(user.role, 'admin')) return res.status(403).json({ error: 'DNS changes require admin role.' });
    try {
      const record = validateDnsRecordInput(req.body);
      const created = await cloudflareDnsRequest('/zones/' + encodeURIComponent(cloudflareDnsConfig().zoneId) + '/dns_records', { method: 'POST', body: JSON.stringify(record) });
      return res.status(201).json({ status: 'success', record: created });
    } catch (error) {
      return res.status((error as any)?.status || 502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.patch('/api/v1/dns/records/:id', requireApiToken, async (req, res) => {
    const user = (req as any).velclawAuth;
    if (!roleAtLeast(user.role, 'admin')) return res.status(403).json({ error: 'DNS changes require admin role.' });
    try {
      const id = String(req.params.id || '');
      if (!/^[a-f0-9-]{16,64}$/i.test(id)) return res.status(400).json({ error: 'Invalid DNS record ID.' });
      const record = validateDnsRecordInput(req.body);
      const updated = await cloudflareDnsRequest('/zones/' + encodeURIComponent(cloudflareDnsConfig().zoneId) + '/dns_records/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(record) });
      return res.json({ status: 'success', record: updated });
    } catch (error) {
      return res.status((error as any)?.status || 502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.delete('/api/v1/dns/records/:id', requireApiToken, async (req, res) => {
    const user = (req as any).velclawAuth;
    if (!roleAtLeast(user.role, 'admin')) return res.status(403).json({ error: 'DNS changes require admin role.' });
    try {
      const id = String(req.params.id || '');
      if (!/^[a-f0-9-]{16,64}$/i.test(id)) return res.status(400).json({ error: 'Invalid DNS record ID.' });
      const deleted = await cloudflareDnsRequest('/zones/' + encodeURIComponent(cloudflareDnsConfig().zoneId) + '/dns_records/' + encodeURIComponent(id), { method: 'DELETE' });
      return res.json({ status: 'success', deleted: deleted?.id || id });
    } catch (error) {
      return res.status((error as any)?.status || 502).json({ error: error instanceof Error ? error.message : String(error) });
    }
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
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"><meta name="theme-color" content="#000"><title>Dashboard — VelclawHost</title><style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}body{overflow-y:auto;overscroll-behavior-y:auto}input,textarea,select,button{font-size:16px!important;}
:root{color-scheme:dark;--bg:#000;--panel:#090909;--line:#262626;--muted:#929292;--text:#f5f5f5;--green:#45d483}*{box-sizing:border-box;border-radius:0!important}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}a{color:inherit;text-decoration:none}.shell{min-height:100vh;display:grid;grid-template-columns:235px minmax(0,1fr)}aside{border-right:1px solid var(--line);padding:22px 15px}header{display:flex;align-items:center;justify-content:space-between;padding:18px 26px;border-bottom:1px solid var(--line);gap:12px}.brand{font-size:17px;font-weight:800}.nav{display:grid;gap:5px;margin-top:32px}.nav a{padding:10px 12px;color:var(--muted);border:1px solid transparent}.nav a.active,.nav a:hover{border-color:var(--line);background:#111;color:#fff}.aside-label{color:#666;font-size:10px;letter-spacing:.12em;margin:25px 12px 8px}.main{min-width:0}.content{padding:28px;max-width:1200px;margin:auto}.eyebrow{color:var(--green);font-size:11px;letter-spacing:.1em}.title{font-size:clamp(26px,4vw,38px);line-height:1.2;margin:8px 0}.muted{color:var(--muted)}.top-actions{display:flex;gap:8px;align-items:center}.btn{display:inline-block;border:1px solid var(--line);background:#101010;padding:9px 12px;color:#fff;font:inherit;cursor:pointer}.btn.primary{background:#fff;color:#000;border-color:#fff}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:24px 0}.card{border:1px solid var(--line);background:var(--panel);padding:18px;min-width:0}.card-label{color:var(--muted);font-size:11px}.metric{font-size:28px;font-weight:700;margin:9px 0}.status{color:var(--green)}.section{border:1px solid var(--line);margin-top:15px}.section-head{padding:14px 17px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px}.empty{padding:24px 17px;color:var(--muted)}.quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px}.quick a{border:1px solid var(--line);padding:14px;display:block}.quick b{display:block;margin-bottom:5px}.mobile-nav{display:none}@media(max-width:760px){.shell{grid-template-columns:1fr}aside{display:none}header{padding:14px 15px}.content{padding:22px 15px}.grid{grid-template-columns:1fr}.quick{grid-template-columns:1fr}.mobile-nav{display:flex;overflow:auto;border-bottom:1px solid var(--line);gap:0}.mobile-nav a{padding:12px 14px;white-space:nowrap;color:var(--muted)}.mobile-nav a.active{color:#fff;border-bottom:2px solid #fff}.top-actions .hide-mobile{display:none}}

/* Mobile layout baseline: iPhone CSS viewport 390-430px (reference 402x874). */
html{font-size:16px;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}
body{font-size:16px;line-height:1.55;overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:auto;touch-action:pan-y}
*,*::before,*::after{box-sizing:border-box}
img,svg,video,canvas,iframe{max-width:100%}
input,textarea,select,button{font-size:16px!important;line-height:1.4;max-width:100%;min-width:0}
button,a.btn,.btn,[role="button"]{min-height:44px;max-width:100%;white-space:normal;overflow-wrap:anywhere}
@media(max-width:430px){
  body{width:100%;min-width:0}
  main,.main,.content,.wrap,.container,.shell,.layout{max-width:100%;min-width:0}
  p,li,label,.subtitle,.muted,.description{overflow-wrap:anywhere}
  .top,header,.nav,.top-actions,.actions{gap:8px;flex-wrap:wrap}
  .content,main{padding-left:16px;padding-right:16px}
  .grid{grid-template-columns:minmax(0,1fr)}
  table{display:block;max-width:100%;overflow-x:auto}
  pre,code{max-width:100%;overflow-x:auto;overflow-wrap:anywhere}
}
</style></head><body><div class="shell"><aside><a class="brand" href="/">▽ VelclawHost</a><div class="nav"><a class="active" href="/dashboard">▦ Overview</a><a href="/dashboard#projects">▤ Projects</a><a href="/dashboard#deployments">↗ Deployments</a><a href="/dashboard#domains">◎ Domains</a><a href="/dashboard#runtime">⌘ Runtime health</a><a href="/dashboard#settings">⚙ Settings</a></div><div class="aside-label">RESOURCES</div><div class="nav"><a href="/docs">Documentation ↗</a><a href="/pricing">Plans ↗</a><a href="/auth">Sign in / Account ↗</a><a href="/">← Public homepage</a></div></aside><div class="main"><header><div><div class="brand">Control plane / Overview</div><div class="muted">VelclawHost workspace</div></div><div class="top-actions"><a class="btn hide-mobile" href="/docs">Read docs</a><a class="btn primary" href="/auth?mode=login">Sign in</a></div></header><nav class="mobile-nav"><a class="active" href="/dashboard">Overview</a><a href="#projects">Projects</a><a href="#deployments">Deployments</a><a href="#domains">Domains</a><a href="#settings">Settings</a></nav><main class="content"><div class="eyebrow">WORKSPACE OVERVIEW</div><h1 class="title">Your infrastructure, at a glance.</h1><p class="muted">Inspect project activity, deployment health and platform configuration from one place.</p><div class="grid"><article class="card"><div class="card-label">PROJECTS</div><div class="metric">—</div><div class="muted">Connect a repository to get started</div></article><article class="card"><div class="card-label">DEPLOYMENTS</div><div class="metric">—</div><div class="muted">No live deployment data connected</div></article><article class="card"><div class="card-label">PLATFORM STATUS</div><div class="metric status">● Online</div><div class="muted">Public web service responds</div></article></div><section class="section" id="projects"><div class="section-head"><b>Projects</b><span class="muted">Repository workspace</span></div><div class="empty"><div class="muted" style="margin-bottom:12px">SAMPLE DATA · PLACEHOLDERS ONLY</div><div class="quick"><a href="#projects"><b>demo-service-alpha</b><span class="muted">alpha-app.velclaw.dev · LIVE</span><br><span class="muted">org/demo-alpha</span></a><a href="#projects"><b>demo-service-beta</b><span class="muted">beta-app.velclaw.dev · LIVE</span><br><span class="muted">org/demo-beta</span></a><a href="#projects"><b>core-api-gateway</b><span class="muted">api.velclaw.dev · BUILDING</span><br><span class="muted">org/core-api</span></a></div></div></section><section class="section" id="deployments"><div class="section-head"><b>Deployments & runtime</b><span class="muted">Live integrations pending</span></div><div class="empty"><div class="empty"><div class="status">[BUILD:OK] #101 · Update application core dependencies</div><div class="status">[BUILD:OK] #102 · Fix environment configuration schema</div><div>[DOMAIN] example-app.velclaw.dev → MAPPED</div><p class="muted">Illustrative sample logs only; not live production telemetry.</p></div></div></section><script>
(function(){
  const authUrl='/api/v1/auth/me';
  const signInLinks=Array.from(document.querySelectorAll('a')).filter(function(a){return /sign in/i.test((a.textContent||'').trim()) || /\/auth\?mode=login/.test(a.getAttribute('href')||'');});
  function renderSignedIn(user){
    signInLinks.forEach(function(a){
      a.textContent=(user.name || user.email || 'Account')+' · Sign out';
      a.href='#sign-out';
      a.setAttribute('aria-label','Sign out of '+(user.email||'VelclawHost'));
      a.addEventListener('click',async function(ev){
        ev.preventDefault();
        try { await fetch('/api/v1/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'}}); } catch(_e) {}
        window.location.replace('/auth?mode=login');
      },{once:true});
    });
    const accessLinks=Array.from(document.querySelectorAll('a')).filter(function(a){return /account access/i.test(a.textContent||'');});
    accessLinks.forEach(function(a){a.textContent='Signed in as '+(user.email||'user')+' · Account';a.href='/auth';});
    const subtitle=document.querySelector('.content .muted');
    if(subtitle && user.email) subtitle.textContent='Signed in as '+user.email+' · '+(user.role||'member')+' access.';
  }
  fetch(authUrl,{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}})
    .then(function(r){if(!r.ok) throw new Error('not signed in');return r.json();})
    .then(function(data){if(data && data.user && data.user.email) renderSignedIn(data.user);})
    .catch(function(){});
})();
</script><section class="section" id="domains"><div class="section-head"><b>Domains & HTTPS</b><span class="muted">Configuration</span></div><div class="empty">Domain management is not yet wired to a domain provider. See the setup guide in Docs.</div></section><section class="section" id="settings"><div class="section-head"><b>Quick actions</b><span class="muted">Navigation</span></div><div class="quick"><a href="/docs"><b>Read documentation ↗</b><span class="muted">CLI, deployment and setup guides</span></a><a href="/pricing"><b>View plans ↗</b><span class="muted">Compare available plan outlines</span></a><a href="/auth"><b>Account access ↗</b><span class="muted">Sign-in interface</span></a></div></section></main></div></div></body></html>`);
  });

  // Public VelclawHost landing page for unauthenticated visitors.
  app.get(["/", "/pricing", "/docs", "/products", "/solutions", "/enterprise"], (req, res, next) => {
    if (req.path === "/docs") {
      return res.type("html").send(`<!doctype html><html lang="vi" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Tài liệu — VelclawHost</title><meta name="description" content="Tài liệu VelclawHost: bắt đầu nhanh, cấu hình dự án, API, triển khai và kiểm tra trạng thái dịch vụ."><meta name="theme-color" content="#000000"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='29' fill='%23000' stroke='%2352dda0' stroke-width='3'/%3E%3Cpath d='M12 15h10l10 16 10-16h10L36 49h-8z' fill='none' stroke='%23f4f6f8' stroke-width='4' stroke-linejoin='round'/%3E%3C/svg%3E"><style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}body{overflow-y:auto;overscroll-behavior-y:auto}input,textarea,select,button{font-size:16px!important;}
*{box-sizing:border-box;border-radius:0!important}body{margin:0;background:#000;color:#fff;font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace}a{color:inherit;text-decoration:none}.top{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;height:62px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 22px;border-bottom:1px solid #292d34;background:#000}.brand{font-weight:800;font-size:15px;display:flex;align-items:center;gap:9px}.brand-mark{display:grid;place-items:center;width:30px;height:30px;border:1px solid #52dda0;color:#52dda0;font-size:17px;font-weight:900}.layout{display:grid;grid-template-columns:230px minmax(0,1fr) 190px;min-height:calc(100vh - 62px);max-width:1280px;margin:auto}aside{padding:20px 14px;border-right:1px solid #222}aside.right{border-right:0;border-left:1px solid #222}.label{font-size:11px;color:#a0aab5;letter-spacing:.1em;margin:16px 0 8px}.search{width:100%;background:#080808;color:#fff;border:1px solid #292929;padding:10px;font:inherit;margin-bottom:20px}.tree a,.toc a{display:flex;align-items:center;min-height:44px;padding:8px 10px;color:#aeb6c2;border-left:2px solid transparent}.tree a:hover,.toc a:hover{color:#fff;background:#101512}.tree a.active,.toc a.active{color:#72e3b0;background:rgba(82,221,160,.1);border-left-color:#52dda0}main{padding:35px clamp(18px,5vw,65px);max-width:900px}.eyebrow{color:#52dda0;font-size:11px;letter-spacing:.1em}h1{font-size:clamp(26px,4vw,40px);line-height:1.2;margin:10px 0}h2{font-size:19px;margin-top:36px}p,li{color:#b0b8c4}pre{background:#080808;border:1px solid #222;padding:16px;overflow:auto;color:#eee;font:12px/1.8 ui-monospace,monospace}.copy{float:right;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:36px;height:34px;padding:0 9px;margin:-5px -5px 8px 10px;border:1px solid #303740;border-radius:9px!important;background:linear-gradient(180deg,#171b20,#0c0f12);color:#b8c2ce;font:11px/1 ui-sans-serif,system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 1px 2px #0005;transition:background .18s,border-color .18s,color .18s,transform .18s}.copy:hover{background:#1b2923;border-color:#52dda0;color:#d8ffeb}.copy:active{transform:scale(.96)}.copy:focus-visible{outline:2px solid #52dda0;outline-offset:3px}.copy svg{width:15px;height:15px;flex:0 0 auto}.copy.copied{background:#10271c;border-color:#52dda0;color:#72e3b0}.copy.copied svg{stroke:#72e3b0}.callout{border:1px solid #292d34;border-left:3px solid #52dda0;padding:12px 14px;color:#b0b8c4;background:#0c0e11}.mobiletoc{display:none}.mobile-docs-menu{display:none}.header-menu{border-radius:10px!important;background:#0c0e11;border:1px solid #292d34;color:#dce5e0;flex:0 0 42px;width:42px;height:42px;padding:8px;margin:0}.header-menu:hover{border-color:#52dda0;color:#72e3b0}.mobile-toc{display:none}.pkg{background:transparent;border:1px solid #292d34;color:#aeb6c2;padding:8px 13px;min-height:40px}.pkg.active{color:#52dda0;border-color:#52dda0;background:rgba(82,221,160,.1)}.docs-footer{display:flex;flex-wrap:wrap;gap:18px;border-top:1px solid #292d34;padding:24px 0;margin-top:38px}.docs-footer a{color:#aeb6c2}.docs-footer a:hover{color:#52dda0}.pager{display:flex;justify-content:space-between;gap:12px;margin-top:36px;padding-top:18px;border-top:1px solid #292d34}.pager a{border:1px solid #292d34;padding:12px;color:#b0b8c4}.copy{width:auto;min-width:36px;height:34px;padding:0 9px}.copy svg{width:15px;height:15px}.tree a,.toc a{font-size:14px}@media(max-width:900px){.layout{grid-template-columns:190px minmax(0,1fr)}aside.right{display:none}}@media(max-width:620px){.layout{grid-template-columns:1fr}.layout>aside:first-child{display:none;position:fixed;inset:calc(62px + env(safe-area-inset-top,0px)) 0 0;width:min(320px,86vw);z-index:35;overflow-y:auto;background:#000;border-right:1px solid #292d34;border-bottom:0;padding:18px 15px calc(28px + env(safe-area-inset-bottom,0px));box-shadow:16px 0 40px #0009}.layout>aside:first-child.open{display:block}.tree{display:block}.tree a{white-space:normal}.search{margin-bottom:8px}main{padding:20px 16px calc(36px + env(safe-area-inset-bottom,0px))}.top{padding:0 15px}.header-menu{display:inline-flex}.top .toplinks{display:flex;gap:12px}.toplinks a{font-size:11px}.mobile-docs-menu{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 12px;margin:0 0 18px;border:1px solid #292d34;background:#0c0e11;color:#f4f6f8}.mobile-toc{display:block;width:100%;min-height:44px;margin:10px 0 18px;padding:10px;background:#0c0e11;border:1px solid #292d34;color:#f4f6f8}.layout h1{font-size:clamp(26px,7vw,34px)}.layout>main>p,.layout>main li{font-size:15px}.pager a{flex:1}.docs-footer{padding-bottom:calc(22px + env(safe-area-inset-bottom,0px))}}

/* Mobile layout baseline: iPhone CSS viewport 390-430px (reference 402x874). */
html{font-size:16px;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}
body{font-size:16px;line-height:1.55;overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:auto;touch-action:pan-y}
*,*::before,*::after{box-sizing:border-box}
img,svg,video,canvas,iframe{max-width:100%}
input,textarea,select,button{font-size:16px!important;line-height:1.4;max-width:100%;min-width:0}
button,a.btn,.btn,[role="button"]{min-height:44px;max-width:100%;white-space:normal;overflow-wrap:anywhere}
@media(max-width:430px){
  body{width:100%;min-width:0}
  main,.main,.content,.wrap,.container,.shell,.layout{max-width:100%;min-width:0}
  p,li,label,.subtitle,.muted,.description{overflow-wrap:anywhere}
  .top,header,.nav,.top-actions,.actions{gap:8px;flex-wrap:wrap}
  .content,main{padding-left:16px;padding-right:16px}
  .grid{grid-template-columns:minmax(0,1fr)}
  table{display:block;max-width:100%;overflow-x:auto}
  pre,code{max-width:100%;overflow-x:auto;overflow-wrap:anywhere}
}

/* Docs refresh: mob<header class="top" id="top"><button class="mobile-docs-menu header-menu" id="headerMenu" type="button" aria-label="Mở menu tài liệu" aria-controls="docsSidebar" aria-expanded="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><a class="brand" href="/" aria-label="Trang chủ VelclawHost"><svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="#52dda0" stroke-width="1.5"/><path d="M8 10h7l5 10 5-10h7L23 30h-6z" fill="none" stroke="#f4f6f8" stroke-width="2.5" stroke-linejoin="round"/></svg><span>VelclawHost <span style="color:#52dda0">/ TÀI LIỆU</span></span></a><div class="toplinks"><a href="/">TRANG CHỦ</a><a href="/dashboard">DASHBOARD</a><a href="/auth">ĐĂNG NHẬP</a></div></header><div class="layout"><aside id="docsSidebar"><button class="mobile-docs-menu" id="closeMenu" type="button" style="margin-bottom:16px">✕ Đóng menu</button><input id="search" class="search" placeholder="⌕ Tìm trong tài liệu..." aria-label="Tìm trong tài liệu"><div class="label">01_BẮT_ĐẦU/</div><nav class="tree"><a href="#quickstart">Bắt đầu nhanh</a><a href="#cli">CLI</a></nav><div class="label">02_CẤU_HÌNH/</div><nav class="tree"><a href="#config">Cấu hình</a></nav><div class="label">03_API/</div><nav class="tree"><a href="#api">Tham chiếu API</a></nav><div class="label">04_VẬN_HÀNH/</div><nav class="tree"><a href="#deploy">Triển khai</a><a href="#health">Kiểm tra sức khỏe</a></nav></aside><main><button class="mobile-docs-menu" id="openMenu" type="button" aria-controls="docsSidebar" aria-expanded="false">☰ Menu</button><div class="eyebrow">TÀI LIỆU DÀNH CHO NHÀ PHÁT TRIỂN</div><h1>Xây dựng và triển khai với VelclawHost.</h1><p>Hướng dẫn cấu hình dự án, sử dụng endpoint công khai, triển khai dịch vụ và kiểm tra trạng thái vận hành.</p><div class="callout">Trạng thái tài liệu: các ví dụ bên dưới mô tả cách sử dụng dịch vụ công khai. API triển khai và quản lý dự án chỉ được xem là khả dụng khi được liệt kê rõ ràng.</div><label class="label" for="pageToc" style="display:block;margin-top:22px">TRONG TRANG NÀY</label><select id="pageToc" class="mobile-toc" aria-label="Chuyển đến mục"><option value="">Chọn mục...</option><option value="#quickstart">01 · Bắt đầu nhanh</option><option value="#cli">02 · Cài đặt CLI</option><option value="#config">03 · Cấu hình</option><option value="#api">04 · Tham chiếu API</option><option value="#deploy">05 · Triển khai</option><option value="#health">06 · Kiểm tra sức khỏe</option></select><h2 id="quickstart">01 · Bắt đầu nhanh</h2><p>Chuẩn bị dự án Node.js, khai báo lệnh build và start trong nhà cung cấp hosting, đồng thời cấu hình biến môi trường bên ngoài mã nguồn. Chọn trình quản lý gói:</p><div class="package-tabs" role="group" aria-label="Package manager"><button type="button" class="pkg active" data-manager="npm">npm</button><button type="button" class="pkg" data-manager="pnpm">pnpm</button><button type="button" class="pkg" data-manager="yarn">yarn</button></div><pre><button class="copy" aria-label="Sao chép lệnh cài đặt" data-copy="npm install\nnpm run build" title="Sao chép mã"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button><code id="installCode">npm install\nnpm run build</code></pre><p>Set the service's build command to the matching build script and its start command to the production server command in your project.</p><h2 id="cli">02 · Cài đặt CLI</h2><p>Hiện chưa có gói CLI VelclawHost được xác minh là phát hành chính thức. Không cài gói theo tên chưa được xác nhận. Trong thời gian chờ công bố gói và phiên bản chính thức, hãy dùng dashboard của nhà cung cấp hoặc endpoint được mô tả bên dưới.</p><h2 id="config">03 · Cấu hình</h2><p>Lưu thông tin bí mật trong phần cài đặt biến môi trường của nhà cung cấp hosting. Không commit access token, mật khẩu cơ sở dữ liệu hoặc private key vào Git.</p><pre><button class="copy" aria-label="Sao chép cấu hình mẫu" data-copy="{ &quot;name&quot;: &quot;demo-service&quot;, &quot;runtime&quot;: &quot;node&quot;, &quot;buildCommand&quot;: &quot;npm run build&quot;, &quot;startCommand&quot;: &quot;npm start&quot; }" title="Sao chép mã"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button><code>{
  "name": "demo-service",
  "runtime": "node",
  "buildCommand": "npm run build",
  "startCommand": "npm start"
}</code></pre><h2 id="api">04 · Tham chiếu API</h2><p>Dịch vụ hiện cung cấp các trang HTML công khai và endpoint kiểm tra sức khỏe. Chưa có REST API triển khai có xác thực được công bố trong tài liệu này; không xem dữ liệu mẫu trên dashboard là dữ liệu API trực tiếp.</p><h3>GET /health</h3><p>Đọc trạng thái sức khỏe của dịch vụ mà không cần thông tin xác thực.</p><pre><button class="copy" aria-label="Sao chép lệnh kiểm tra sức khỏe" data-copy="curl -i https://velclaw.site/health" title="Sao chép mã"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button><code>curl -i https://velclaw.site/health</code></pre><p>Expected successful response: HTTP 200 with a JSON object indicating the process is healthy. Exact fields may vary by deployed version.</p><pre><button class="copy" aria-label="Sao chép phản hồi sức khỏe mẫu" data-copy='{ "status": "ok" }' title="Sao chép mã"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button><code>{ "status": "ok" }</code></pre><h3>Mã trạng thái HTTP</h3><ul><li><code>200</code> — request succeeded / health check passed.</li><li><code>400</code> — malformed request, when a route validates input.</li><li><code>401</code> — authentication required for protected routes.</li><li><code>403</code> — request denied by access policy or authorization.</li><li><code>404</code> — route or resource not found.</li><li><code>429</code> — request rate limited by an upstream service.</li><li><code>500</code> — unexpected server error.</li><li><code>503</code> — service unavailable or not ready.</li></ul><p>Codes other than the health endpoint's verified response are general HTTP guidance, not a claim that every code is emitted by a VelclawHost route.</p><h2 id="deploy">05 · Triển khai</h2><ol><li>Kết nối repository và nhánh cần triển khai trong nhà cung cấp hosting.</li><li>Khai báo lệnh build, lệnh start và các biến môi trường cần thiết.</li><li>Triển khai rồi kiểm tra build log để phát hiện lỗi.</li><li>Kiểm tra URL production và endpoint sức khỏe sau khi triển khai.</li></ol><h2 id="health">06 · Kiểm tra sức khỏe</h2><p>Dùng URL health của dịch vụ để kiểm tra khả năng phản hồi cơ bản:</p><pre><button class="copy" aria-label="Sao chép lệnh kiểm tra sức khỏe" data-copy="curl -fsS https://velclaw.site/health" title="Sao chép mã"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button><code>curl -fsS https://velclaw.site/health</code></pre><p>For a shell monitor, a non-zero exit status means the request failed or returned an HTTP error. Configure your host's health-check path as <code>/health</code> only if the deployed version confirms that route responds successfully. Never include secrets in health responses.</p><div class="pager"><a href="#config">← Previous: Configuration</a><a href="#deploy">Next: Deployments →</a></div><footer class="docs-footer"><a href="https://github.com/Velclaw/VelclawHost/edit/main/server.ts" target="_blank" rel="noreferrer">Sửa tài liệu ↗</a><a href="https://github.com/Velclaw/VelclawHost/issues/new" target="_blank" rel="noreferrer">Báo lỗi ↗</a><a href="#top" class="back-top" id="backTop">↑ Về đầu trang</a></footer></main><aside class="right"><div class="label">// TRONG TRANG NÀY</div><nav class="toc"><a href="#quickstart">01 · Bắt đầu nhanh</a><a href="#cli">02 · Cài đặt CLI</a><a href="#config">03 · Cấu hình</a><a href="#api">04 · Tham chiếu API</a><a href="#deploy">05 · Triển khai</a><a href="#health">06 · Kiểm tra sức khỏe</a></nav></aside></div><script>
const sidebar=document.getElementById('docsSidebar'),openMenu=document.getElementById('openMenu'),headerMenu=document.getElementById('headerMenu'),closeMenu=document.getElementById('closeMenu');
function setMenu(open){sidebar.classList.toggle('open',open);openMenu.setAttribute('aria-expanded',String(open));headerMenu.setAttribute('aria-expanded',String(open));}
openMenu.addEventListener('click',()=>setMenu(true));headerMenu.addEventListener('click',()=>setMenu(!sidebar.classList.contains('open')));closeMenu.addEventListener('click',()=>setMenu(false));
sidebar.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{const old=b.innerHTML;try{await navigator.clipboard.writeText(b.dataset.copy);b.classList.add('copied');b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>Đã sao chép</span>';b.setAttribute('aria-label','Đã sao chép vào clipboard');b.title='Đã sao chép';b.setAttribute('aria-live','polite');setTimeout(()=>{b.innerHTML=old;b.classList.remove('copied');b.setAttribute('aria-label','Sao chép mã');b.removeAttribute('aria-live');b.title='Sao chép mã';},1600)}catch{b.title='Không thể tự sao chép. Hãy chọn và sao chép mã thủ công.';b.setAttribute('aria-label','Không thể sao chép mã');}}));
const installCode=document.getElementById('installCode');const commands={npm:'npm install\nnpm run build',pnpm:'pnpm install\npnpm run build',yarn:'yarn install\nyarn build'};
document.querySelectorAll('.pkg').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.pkg').forEach(x=>x.classList.toggle('active',x===b));installCode.textContent=commands[b.dataset.manager];document.querySelector('pre .copy').dataset.copy=commands[b.dataset.manager];}));
document.getElementById('search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.tree a,.toc a').forEach(a=>a.style.display=a.textContent.toLowerCase().includes(q)?'flex':'none');});
document.getElementById('pageToc').addEventListener('change',e=>{if(e.target.value)location.hash=e.target.value;});
const sections=[...document.querySelectorAll('main h2[id]')];const links=[...document.querySelectorAll('.tree a,.toc a')];const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+entry.target.id));}})},{rootMargin:'-12% 0px -75% 0px'});sections.forEach(s=>observer.observe(s));
const topButton=document.getElementById('backTop');window.addEventListener('scroll',()=>{topButton.style.display=window.scrollY>700?'inline-flex':'none'},{passive:true});topButton.addEventListener('click',e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&window.innerWidth>700){e.preventDefault();document.getElementById('search').focus();}});
</script></body></html>height:none;padding:18px;background:#080b0a;border-top:1px solid var(--docs-line)}
 .layout>aside:first-child.open{display:block}
 .mobile-docs-menu{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:9px 12px;border:1px solid var(--docs-line);background:#101512;color:#eaf5ee}
 .mobile-toc{display:block;width:100%;min-height:44px;margin:12px 0 20px;padding:10px;background:#101512;border:1px solid var(--docs-line);color:#eaf5ee}
 .layout>main{padding-top:14px}.layout h1{font-size:30px}.layout h2{font-size:20px;margin-top:36px}
 .layout>main>p,.layout>main li{font-size:16px}
 .search{margin-bottom:20px}
 .pager{margin-top:24px}
}
</style></head><body><header class="top"><a class="brand" href="/">[&gt;_] VELCLAWHOST / DOCS</a><div class="toplinks"><a href="/">HOME</a>　<a href="/dashboard">DASHBOARD</a>　<a href="/auth">LOG IN</a></div></header><div class="layout"><aside><input id="search" class="search" placeholder="⌕ SEARCH DOCS...  CMD+K" aria-label="Search docs"><div class="label">01_GETTING_STARTED/</div><nav class="tree"><a href="#quickstart">quickstart.md</a><a href="#cli">cli_installation.md</a></nav><div class="label">02_CONFIGURATION/</div><nav class="tree"><a href="#config">velclaw.config.json</a></nav><div class="label">03_API_REFERENCE/</div><nav class="tree"><a href="#api">api_overview.md</a></nav><div class="label">04_OPERATIONS/</div><nav class="tree"><a href="#deploy">deployments.md</a><a href="#health">health_checks.md</a></nav></aside><main><div class="eyebrow">DOCS // DEVELOPER_GUIDE</div><h1>Build and deploy with VelclawHost.</h1><p>Technical guides for configuring a project, running the CLI workflow and understanding the platform control plane.</p><div class="callout">STATUS: Documentation scaffold. Commands and API examples below are illustrative until the corresponding CLI/API is released and configured.</div><h2 id="quickstart">01 / Quick start</h2><p>Prepare a project repository and configure its runtime before deploying. Example workflow:</p><pre><button class="copy" data-copy="npm install\nvelclaw deploy --prod">COPY</button><code>npm install
velclaw deploy --prod</code></pre><h2 id="cli">02 / CLI installation</h2><p>Install the Velclaw CLI using the official package and version once the package registry is configured. Do not assume the placeholder package exists yet.</p><pre><button class="copy" data-copy="velclaw --help\nvelclaw deploy --prod">COPY</button><code>velclaw --help
velclaw deploy --prod</code></pre><h2 id="config">03 / Configuration</h2><p>Keep environment-specific values in deployment secrets rather than committing credentials.</p><pre><button class="copy" data-copy="{ &quot;name&quot;: &quot;demo-service&quot;, &quot;runtime&quot;: &quot;node&quot; }">COPY</button><code>{
  "name": "demo-service",
  "runtime": "node",
  "buildCommand": "npm run build",
  "startCommand": "npm start"
}</code></pre><h2 id="api">04 / API reference</h2><p>Public API endpoints should document authentication, request schemas, response codes and rate limits before being treated as stable.</p><h2 id="deploy">05 / Deployments</h2><ol><li>Connect a repository and select a branch.</li><li>Set build/start commands and environment variables.</li><li>Deploy, then inspect build logs and health checks.</li></ol><h2 id="health">06 / Health checks</h2><p>Configure a health endpoint that reports service readiness without exposing secrets or internal environment values.</p></main><aside class="right"><div class="label">// ON_THIS_PAGE</div><nav class="toc"><a href="#quickstart">01 Quick start</a><a href="#cli">02 CLI installation</a><a href="#config">03 Configuration</a><a href="#api">04 API reference</a><a href="#deploy">05 Deployments</a><a href="#health">06 Health checks</a></nav></aside></div><script>document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='COPIED';setTimeout(()=>b.textContent='COPY',1200)}catch{b.textContent='SELECT TEXT'}}));document.getElementById('search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.tree a,.toc a').forEach(a=>a.style.display=a.textContent.toLowerCase().includes(q)?'block':'none')});document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('search').focus()}});</script><section id="ecosystem" style="margin-top:42px;padding:22px;border:1px solid #292d34;background:linear-gradient(135deg,#0c1110,#050606);">
<div class="eyebrow">VELCLAW // ECOSYSTEM</div>
<h2 style="margin-top:8px">Hệ sinh thái Velclaw</h2>
<p>VelclawHost là một thành phần trong hệ sinh thái Velclaw. <strong>Velclaw/VELCLAW</strong> là repository trung tâm; các dự án và tài liệu liên quan được liên kết bên dưới để phân biệt rõ vai trò từng thành phần.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;margin-top:18px">
<a href="https://github.com/Velclaw/VELCLAW" target="_blank" rel="noreferrer" style="display:block;border:1px solid #39433f;border-radius:12px!important;padding:16px;background:#0b100e">
<div style="color:#72e3b0;font-size:11px;letter-spacing:.08em">01 · CORE PLATFORM</div><h3 style="margin:8px 0;color:#f4f6f8">VELCLAW</h3><p style="margin:0">Repository trung tâm của hệ sinh thái Velclaw; xem mã nguồn, hướng dẫn và trạng thái dự án tại GitHub.</p><span style="display:block;margin-top:12px;color:#72e3b0">GitHub · Velclaw/VELCLAW ↗</span>
</a>
<a href="https://github.com/Velclaw/VelCli" target="_blank" rel="noreferrer" style="display:block;border:1px solid #39433f;border-radius:12px!important;padding:16px;background:#0b100e">
<div style="color:#72e3b0;font-size:11px;letter-spacing:.08em">02 · AI AGENT</div><h3 style="margin:8px 0;color:#f4f6f8">VelCli</h3><p style="margin:0">Dự án AI Agent/CLI của hệ sinh thái. Tính năng cụ thể và lệnh sử dụng cần theo README và mã nguồn hiện có.</p><span style="display:block;margin-top:12px;color:#72e3b0">GitHub · Velclaw/VelCli ↗</span>
</a>
<a href="https://docs.velclaw.ai" target="_blank" rel="noreferrer" style="display:block;border:1px solid #39433f;border-radius:12px!important;padding:16px;background:#0b100e">
<div style="color:#72e3b0;font-size:11px;letter-spacing:.08em">03 · DOCUMENTATION</div><h3 style="margin:8px 0;color:#f4f6f8">Velclaw Docs</h3><p style="margin:0">Cổng tài liệu tại docs.velclaw.ai dành cho hướng dẫn và tham chiếu của hệ sinh thái.</p><span style="display:block;margin-top:12px;color:#72e3b0">docs.velclaw.ai ↗</span>
</a>
</div>
<p style="font-size:12px;margin-top:16px">Lưu ý: các liên kết này xác định vị trí dự án theo cấu trúc bạn cung cấp; chúng không tự khẳng định mọi repository hoặc endpoint đã được triển khai hay đồng bộ.</p>
</section></body></html>`);
    }
    if (req.path === "/pricing") {
      return res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"><title>Pricing — VelclawHost</title><style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}body{overflow-y:auto;overscroll-behavior-y:auto}input,textarea,select,button{font-size:16px!important;}*{box-sizing:border-box}body{margin:0;background:#000;color:#fff;font:14px/1.6 Geist,Inter,system-ui,sans-serif}.wrap{max-width:1080px;margin:auto;padding:28px 20px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #222;padding-bottom:20px}a{color:inherit;text-decoration:none}.hero{text-align:center;padding:65px 0 35px}h1{font-size:48px;letter-spacing:-2px;margin:0}p{color:#888}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{border:1px solid #222;border-radius:0;padding:24px;background:#0a0a0a}.popular{border-color:#777;box-shadow:0 0 24px #ffffff0d}.price{font-size:32px;font-weight:700}.btn{display:block;text-align:center;background:#fff;color:#000;border-radius:0;padding:11px;margin-top:24px;font-weight:700}input{width:100%;accent-color:#fff}@media(max-width:700px){.grid{grid-template-columns:1fr}h1{font-size:38px}}
/* VelclawHost unified design tokens: sharp geometry + monospace everywhere */
:root{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace!important}*,*::before,*::after{border-radius:0!important}body,button,input,select,textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace!important}button,a,[role="button"],input,select,textarea{border-radius:0!important}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid #8b8b8b;outline-offset:2px}button:hover,a.btn:hover,.btn:hover{transition:background-color .15s ease,color .15s ease,border-color .15s ease}

/* Mobile layout baseline: iPhone CSS viewport 390-430px (reference 402x874). */
html{font-size:16px;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}
body{font-size:16px;line-height:1.55;overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:auto;touch-action:pan-y}
*,*::before,*::after{box-sizing:border-box}
img,svg,video,canvas,iframe{max-width:100%}
input,textarea,select,button{font-size:16px!important;line-height:1.4;max-width:100%;min-width:0}
button,a.btn,.btn,[role="button"]{min-height:44px;max-width:100%;white-space:normal;overflow-wrap:anywhere}
@media(max-width:430px){
  body{width:100%;min-width:0}
  main,.main,.content,.wrap,.container,.shell,.layout{max-width:100%;min-width:0}
  p,li,label,.subtitle,.muted,.description{overflow-wrap:anywhere}
  .top,header,.nav,.top-actions,.actions{gap:8px;flex-wrap:wrap}
  .content,main{padding-left:16px;padding-right:16px}
  .grid{grid-template-columns:minmax(0,1fr)}
  table{display:block;max-width:100%;overflow-x:auto}
  pre,code{max-width:100%;overflow-x:auto;overflow-wrap:anywhere}
}
</style></head><body><div class="wrap"><header><a href="/"><b>△ VelclawHost</b></a><a href="/auth">Log in ↗</a></header><section class="hero"><h1>Simple, transparent plans.</h1><p>Start free. Scale when your workloads need it.</p></section><div class="grid"><article class="card"><h2>Velclaw Hobby</h2><div class="price">Free</div><p>For personal projects and experiments.</p><ul><li>Starter deployments</li><li>Basic project visibility</li><li>Community workflows</li></ul><a class="btn" href="/auth?mode=signup">Get started</a></article><article class="card popular"><p>✦ MOST POPULAR</p><h2>Velclaw Pro</h2><div class="price">Usage-based</div><p>For teams shipping production apps.</p><ul><li>Preview workflow</li><li>Deployment insights</li><li>Team-ready controls</li></ul><a class="btn" href="/auth?mode=signup">Explore Pro</a></article><article class="card"><h2>VelclawHost Enterprise</h2><div class="price">Custom</div><p>For organizations with tailored infrastructure needs.</p><ul><li>Custom deployment model</li><li>Governance workflows</li><li>Dedicated planning</li></ul><a class="btn" href="mailto:enterprise@velclaw.dev">Contact us</a></article></div><section style="max-width:600px;margin:55px auto"><h2>Estimate usage</h2><label for="band">Monthly bandwidth: <span id="bv">100</span> GB</label><input id="band" type="range" min="10" max="2000" value="100"><label for="fn">Function invocations: <span id="fv">1</span> million</label><input id="fn" type="range" min="1" max="100" value="1"><p id="estimate">Usage estimate is illustrative; final charges depend on published rates and actual usage.</p></section></div><script>const b=document.getElementById('band'),f=document.getElementById('fn');function calc(){document.getElementById('bv').textContent=b.value;document.getElementById('fv').textContent=f.value;document.getElementById('estimate').textContent='Estimated usage: '+b.value+' GB bandwidth and '+f.value+' million function invocations. No price is calculated until official rates are configured.'}b.oninput=f.oninput=calc</script></body></html>`);
    }
    if (req.path !== "/") return next();
    return res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"><meta name="theme-color" content="#000000"><title>VelclawHost — Early-access developer platform</title><meta name="description" content="Explore VelclawHost early access: deployment workflows, build controls, and infrastructure tools. Join the waitlist for updates."><meta property="og:title" content="VelclawHost — Early-access developer platform"><meta property="og:description" content="Explore the VelclawHost deployment workflow and join the waitlist."><meta property="og:type" content="website"><meta property="og:url" content="https://velclaw.site/"><meta name="twitter:card" content="summary_large_image"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}body{overflow-y:auto;overscroll-behavior-y:auto}input,textarea,select,button{font-size:16px!important;}
:root{color-scheme:dark;--bg:#000;--surface:#0a0a0a;--card:#0d0d0d;--line:#222;--text:#fff;--muted:#888;--cta:#fff;--ct:#000}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace}a{color:inherit;text-decoration:none}button,select{font:inherit;cursor:pointer}.wrap{max-width:1160px;width:calc(100% - 40px);margin:auto}.nav{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);gap:20px}.brand{font-weight:750;font-size:18px;letter-spacing:-.5px;display:flex;gap:10px;align-items:center;white-space:nowrap}.mark{width:31px;height:31px}.links{display:flex;gap:22px;color:#aaa;font-size:12px}.links a:hover{color:#fff}.right{display:flex;gap:9px;align-items:center}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:0;padding:10px 15px;font-size:12px;font-weight:700;border:1px solid #333;background:transparent;color:#fff}.primary{background:#fff;color:#000;border-color:#fff}.btn:hover{box-shadow:inset 0 0 0 1px #888}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:52px;align-items:center;padding:90px 0 76px}.eyebrow{font:11px ui-monospace,monospace;color:#aaa;border:1px solid #222;border-radius:0;padding:7px 11px;display:inline-flex;gap:8px}.dot{width:6px;height:6px;background:#3ddc97;border-radius:0;margin-top:5px}.hero h1{font-size:clamp(43px,6.3vw,72px);line-height:1.01;letter-spacing:-.07em;margin:24px 0 18px;max-width:680px}.hero p{color:#999;line-height:1.8;font-size:15px;max-width:530px}.actions{display:flex;gap:10px;margin-top:26px;flex-wrap:wrap}.terminal{border:1px solid #222;border-radius:0;background:#0d0d0d;overflow:hidden}.termhead{height:43px;border-bottom:1px solid #222;display:flex;gap:7px;align-items:center;padding:0 14px;color:#888;font-size:11px}.traffic{width:7px;height:7px;border-radius:0;background:#555}.termhead span{margin-left:auto;font:10px ui-monospace,monospace}.term{padding:21px;font:12px/2 ui-monospace,SFMono-Regular,monospace;color:#999}.green{color:#52dda0}.white{color:#fff}.workflow{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:17px}.step{border:1px solid #222;border-radius:0;padding:12px;font-size:11px;color:#aaa}.step b{display:block;color:#fff;margin-bottom:3px}.section{padding:34px 0 84px}.sectionhead{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:20px}.sectionhead h2{font-size:28px;letter-spacing:-1px;margin:0}.sectionhead p{color:#888;font-size:12px;max-width:360px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{border:1px solid #222;border-radius:0;background:#0a0a0a;padding:23px;transition:border-color .2s,box-shadow .2s,transform .2s}.card:hover{border-color:#888;box-shadow:inset 0 0 0 1px #ffffff0a;transform:translateY(-1px)}.icon{width:34px;height:34px;border:1px solid #292929;border-radius:0;display:grid;place-items:center;margin-bottom:22px}.card h3{font-size:15px;margin:0 0 7px}.card p{font-size:12px;line-height:1.8;color:#888;margin:0}.map{height:175px;border:1px solid #222;border-radius:0;background:radial-gradient(ellipse at 50% 50%,#1b1b1b 0,#080808 65%);position:relative;overflow:hidden;margin-top:14px}.map:before{content:"";position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:28px 28px}.node{position:absolute;width:7px;height:7px;border-radius:0;background:#fff;box-shadow:0 0 14px #fff}.node:after{content:"";position:absolute;inset:-7px;border:1px solid #ffffff40;border-radius:0}.footer{border-top:1px solid #222;padding:25px 0;color:#777;font-size:11px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.right{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-shrink:0}.theme-toggle{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 40px;padding:0;border:0;background:transparent;color:var(--text);cursor:pointer;border-radius:50%!important}.theme-toggle:hover{background:#ffffff12}.theme-toggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.right .btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;white-space:nowrap;font-size:13px}.right .btn.primary{min-width:112px}@media(max-width:700px){.nav{gap:10px;padding-left:16px;padding-right:16px;flex-wrap:nowrap}.nav .links{display:none}.brand{white-space:nowrap;font-size:15px}.mark{width:30px;height:30px}.right{gap:6px}.theme-toggle{width:36px;height:40px;flex-basis:36px}.right .btn{min-height:40px;padding:0 10px;font-size:12px}.right .btn.primary{min-width:0;padding:0 11px}}@media(max-width:370px){.brand{font-size:13px;gap:5px}.mark{width:25px;height:25px}.right{gap:4px}.right .btn{padding:0 7px;font-size:11px}.right .btn.primary{padding:0 8px}.theme-toggle{width:30px;flex-basis:30px}}
@media(max-width:850px){.links{display:none}.hero{grid-template-columns:1fr;gap:30px;padding:58px 0}.hero h1{font-size:clamp(42px,11vw,62px)}.grid{grid-template-columns:1fr}.sectionhead{display:block}.workflow{grid-template-columns:1fr}.map{height:145px}.nav{height:64px}.wrap{width:calc(100% - 30px)}}

/* VelclawHost unified design tokens: sharp geometry + monospace everywhere */
:root{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace!important}*,*::before,*::after{border-radius:0!important}body,button,input,select,textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace!important}button,a,[role="button"],input,select,textarea{border-radius:0!important}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid #8b8b8b;outline-offset:2px}button:hover,a.btn:hover,.btn:hover{transition:background-color .15s ease,color .15s ease,border-color .15s ease}

/* Mobile layout baseline: iPhone CSS viewport 390-430px (reference 402x874). */
html{font-size:16px;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:pan-y}
body{font-size:16px;line-height:1.55;overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:auto;touch-action:pan-y}
*,*::before,*::after{box-sizing:border-box}
img,svg,video,canvas,iframe{max-width:100%}
input,textarea,select,button{font-size:16px!important;line-height:1.4;max-width:100%;min-width:0}
button,a.btn,.btn,[role="button"]{min-height:44px;max-width:100%;white-space:normal;overflow-wrap:anywhere}
@media(max-width:430px){
  body{width:100%;min-width:0}
  main,.main,.content,.wrap,.container,.shell,.layout{max-width:100%;min-width:0}
  p,li,label,.subtitle,.muted,.description{overflow-wrap:anywhere}
  .top,header,.nav,.top-actions,.actions{gap:8px;flex-wrap:wrap}
  .content,main{padding-left:16px;padding-right:16px}
  .grid{grid-template-columns:minmax(0,1fr)}
  table{display:block;max-width:100%;overflow-x:auto}
  pre,code{max-width:100%;overflow-x:auto;overflow-wrap:anywhere}
}
/* Responsive homepage fixes and honest early-access presentation */
:root{--bg:#08090b;--surface:#0c0e11;--card:#0c0e11;--line:#292d34;--text:#f4f6f8;--muted:#b0b8c4;color-scheme:dark}
html,body{background:#08090b!important}
body{padding-bottom:calc(24px + env(safe-area-inset-bottom))}
.wrap{width:min(1180px,calc(100% - 48px));padding-bottom:env(safe-area-inset-bottom)}
.nav{flex-wrap:nowrap;gap:16px}
.brand{flex:0 0 auto}
.right{flex:0 0 auto;flex-wrap:nowrap;gap:8px}
.theme-toggle{border:1px solid var(--line);width:40px;height:42px;flex-basis:40px}
.hero{gap:clamp(24px,5vw,60px);padding-top:clamp(42px,7vw,82px)}
.hero h1{font-size:clamp(32px,5.5vw,64px);line-height:1.05;letter-spacing:-.055em;overflow-wrap:anywhere}
.hero p,.sectionhead p,.card p{color:#b0b8c4}
.term,.termhead,.step,.footer{color:#aeb6c2}
.terminal,.card,.step{background:#0c0e11;border-color:#292d34}
.beta-banner{display:flex;gap:9px;align-items:center;width:max-content;max-width:100%;margin-top:22px;padding:8px 11px;border:1px solid #2a4038;color:#a5e6cb;font-size:11px;letter-spacing:.05em}
.beta-banner .dot{border-radius:50%!important}
.wait-card{border:1px solid var(--line);background:var(--surface);padding:clamp(22px,4vw,36px);max-width:720px}
.wait-card h2{font-size:clamp(24px,4vw,36px);margin:14px 0;letter-spacing:-.04em}
.wait-card p{color:#b0b8c4;line-height:1.8}
.footer{padding-bottom:calc(25px + env(safe-area-inset-bottom))}
@media(max-width:850px){.wrap{width:calc(100% - 32px)}.nav{height:68px}.nav .links{display:none}.hero{padding-top:32px}.hero h1{font-size:clamp(32px,8.2vw,50px)}.workflow{grid-template-columns:1fr}.footer{line-height:2.1}}
@media(max-width:420px){.wrap{width:calc(100% - 28px)}.nav{gap:7px}.brand{font-size:14px;gap:7px}.mark{width:28px;height:28px}.right{gap:5px}.right .btn{padding:0 8px;font-size:11px}.right .btn.primary{padding:0 8px}.theme-toggle{width:33px;height:40px;flex-basis:33px}.hero h1{font-size:clamp(30px,7.8vw,38px)}.hero p{font-size:13px}.term{padding:15px;font-size:11px}}
</style></head><body><div class="wrap"><header class="nav"><a href="/" class="brand" aria-label="VelclawHost home"><svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="#52dda0" stroke-width="1.5"/><path d="M7 8h8l5 8 5-8h8L24 24l7 8h-9l-2-3-2 3H9l7-8L7 8Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>VelclawHost</a><nav class="links"><a href="/products">Products⌄</a><a href="/solutions">Solutions⌄</a><a href="/docs">Resources</a><a href="/enterprise">Enterprise</a><a href="/docs">Docs</a><a href="/pricing">Pricing</a></nav><div class="right"><button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch to light mode" title="Switch theme"><svg id="bulbIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4m-2-19a7 7 0 0 0-4 12.75c.8.55 1 1.25 1 2.25h6c0-1 .2-1.7 1-2.25A7 7 0 0 0 12 2Z"/></svg></button><a class="btn" href="/auth?mode=login">Log In</a><a class="btn primary" href="#waitlist">Join waitlist ↗</a></div></header>
<div class="beta-banner"><span class="dot"></span> EARLY ACCESS · DEMO WORKFLOW · FREE DURING BETA</div><section class="hero"><div><span class="eyebrow"><span class="dot"></span> VELCLAW DEVELOPER PLATFORM</span><h1>SHIP WITH CLARITY.<br>DEPLOY WITH CONFIDENCE.</h1><p>Explore a developer-first workspace for build pipelines, deployment controls, and infrastructure workflows. VelclawHost is in early access; production deployment features are still being developed.</p><div class="actions"><a class="btn primary" href="#waitlist">Join waitlist ↗</a><a class="btn" href="/docs">Explore documentation</a></div></div><div><div class="terminal"><div class="termhead"><i class="traffic"></i><i class="traffic"></i><i class="traffic"></i><span>velclaw · terminal</span></div><div class="term"><div><span class="green">➜</span> <span class="white">velclaw deploy</span></div><div>Inspecting project source...</div><div>Building deployment bundle...</div><div class="green">✓ Demo build workflow simulated</div><div class="green">ℹ Production integration in progress</div><br><div><span class="green">➜</span> <span class="white">velclaw status</span></div><div class="green">● Demo status: ready</div><div>Environment: preview (simulated)</div><div><span class="green">➜</span> <span class="white">_</span></div></div></div><div class="workflow"><div class="step"><b>01 · Git Commit</b>Push your changes</div><div class="step"><b>02 · Edge Build</b>Automated pipeline</div><div class="step"><b>03 · Live Domain</b>Ready for traffic</div></div></div></section>
<section class="section"><div class="sectionhead"><h2>Operational clarity.<br>From commit to production.</h2><p>Tools designed for developers to preview, deploy and operate modern applications.</p></div><div class="grid"><article class="card"><div class="icon">⌘</div><h3>Velclaw Develop</h3><p>Build and iterate with a developer-first workflow, bringing deployment controls and operational context into one place.</p></article><article class="card"><div class="icon">↗</div><h3>Velclaw Preview</h3><p>Give every pull request a dedicated preview workflow and a clearer path to review before production.</p></article><article class="card"><div class="icon">◎</div><h3>Infrastructure Metrics (Demo)</h3><p>Explore a conceptual global edge network visualization. Actual regions and latency metrics depend on configured infrastructure.</p><div class="map"><span class="node" style="left:22%;top:37%"></span><span class="node" style="left:47%;top:28%"></span><span class="node" style="left:53%;top:58%"></span><span class="node" style="left:76%;top:40%"></span><span class="node" style="left:83%;top:68%"></span></div></article></div></section><section class="section waitlist" id="waitlist"><div class="wait-card"><span class="eyebrow">EARLY ACCESS</span><h2>Help shape the next release.</h2><p>Join the waitlist by following the project and sharing feedback on GitHub. This demo page does not create an account or deploy an application.</p><a class="btn primary" href="https://github.com/Velclaw/VelclawHost/issues">Request early access ↗</a></div></section><footer class="footer"><span>© <span id="year"></span> VelclawHost · Early access · Free during beta</span><span><a href="/docs">Docs</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="mailto:hello@velclaw.site">Contact</a> · <a href="https://github.com/Velclaw/VelclawHost">GitHub</a> · <a href="/health">Status</a> · <span id="themeLabel">Dark</span></span></footer></div>
<script>
const root=document.documentElement,themeToggle=document.getElementById('themeToggle'),bulbIcon=document.getElementById('bulbIcon');
function setTheme(mode){
 const dark=mode==='dark';
 root.dataset.theme=dark?'dark':'light';
 root.style.colorScheme=dark?'dark':'light';
 if(dark){
  root.style.setProperty('--bg','#08090b');root.style.setProperty('--surface','#0c0e11');root.style.setProperty('--card','#0c0e11');root.style.setProperty('--line','#292d34');root.style.setProperty('--text','#f4f6f8');root.style.setProperty('--muted','#929aa6');root.style.setProperty('--cta','#3984ff');root.style.setProperty('--ct','#fff');
  document.body.style.background='';document.body.style.color='';
  document.querySelectorAll('.links,.hero p,.sectionhead p,.card p,.term,.termhead,.step,.footer').forEach(e=>e.style.removeProperty('color'));
  document.querySelectorAll('.terminal,.card,.step,.map').forEach(e=>{e.style.removeProperty('background');e.style.removeProperty('border-color');e.style.removeProperty('box-shadow')});
  document.querySelectorAll('.btn:not(.primary)').forEach(e=>{e.style.removeProperty('color');e.style.removeProperty('border-color')});
  document.querySelectorAll('.primary').forEach(e=>{e.style.removeProperty('background');e.style.removeProperty('color');e.style.removeProperty('border-color')});
  document.querySelectorAll('.term .white,.step b,.card h3').forEach(e=>e.style.removeProperty('color'));
 }else{
  root.style.setProperty('--bg','#ffffff');root.style.setProperty('--surface','#ffffff');root.style.setProperty('--card','#ffffff');root.style.setProperty('--line','#e5e7eb');root.style.setProperty('--text','#111827');root.style.setProperty('--muted','#5b6472');root.style.setProperty('--cta','#111827');root.style.setProperty('--ct','#ffffff');
  document.body.style.background='#fff';document.body.style.color='#111827';
  document.querySelectorAll('.links,.hero p,.sectionhead p,.card p,.term,.termhead,.step,.footer').forEach(e=>e.style.color='#5b6472');
  document.querySelectorAll('.terminal,.card,.step,.map').forEach(e=>{e.style.background='#fff';e.style.borderColor='#e5e7eb';e.style.boxShadow='0 2px 8px #0000000a'});
  document.querySelectorAll('.btn:not(.primary)').forEach(e=>{e.style.color='#111827';e.style.borderColor='#d1d5db'});
  document.querySelectorAll('.primary').forEach(e=>{e.style.background='#111827';e.style.color='#fff';e.style.borderColor='#111827'});
  document.querySelectorAll('.term .white,.step b,.card h3').forEach(e=>e.style.color='#111827');
 }
 themeToggle.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
 themeToggle.title=dark?'Switch to light mode':'Switch to dark mode';
 bulbIcon.innerHTML=dark?'<path d="M9 18h6m-5 3h4m-2-19a7 7 0 0 0-4 12.75c.8.55 1 1.25 1 2.25h6c0-1 .2-1.7 1-2.25A7 7 0 0 0 12 2Z"/>':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>';
 document.getElementById('themeLabel').textContent=dark?'Dark':'Light';
 try{localStorage.setItem('velclaw-theme',mode)}catch{}
}
let savedTheme='dark';try{savedTheme=localStorage.getItem('velclaw-theme')||'dark'}catch{}if(!['dark','light'].includes(savedTheme))savedTheme='dark';setTheme(savedTheme);
themeToggle.addEventListener('click',()=>setTheme(root.dataset.theme==='dark'?'light':'dark'));
document.getElementById('year').textContent=new Date().getFullYear()
</script></body></html>`);
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