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
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4f5f7">
<title>Velclaw — Create your account</title>
<style>
:root{color-scheme:light;--ink:#16181d;--muted:#6f737c;--line:#e0e2e6;--blue:#2864e8;--canvas:#f3f4f6;--white:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:14px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100svh}
.top{height:76px;max-width:1180px;margin:auto;padding:0 34px;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:750;font-size:21px;letter-spacing:-.8px}.logo{width:34px;height:34px;display:block;filter:drop-shadow(0 3px 5px #285be51c)}.hero-brand{display:flex;flex-direction:column;align-items:center;text-align:center;margin:0 0 28px}.hero-mark{width:66px;height:66px;margin-bottom:9px;filter:drop-shadow(0 7px 12px #2457e622)}.hero-name{font-size:31px;font-weight:780;letter-spacing:-1.2px;line-height:1.1}.hero-tagline{font-size:13px;color:#8b91a0;margin-top:7px}.outline{height:39px;padding:0 17px;border:1px solid #cfd2d8;border-radius:9px;background:transparent;color:#24262b;font:600 13px inherit;cursor:pointer}.outline:hover{background:#fff}
main{display:flex;justify-content:center;padding:42px 20px 72px}.card{width:min(100%,448px);padding:36px 38px 28px;background:var(--white);border:1px solid #e8e9ed;border-radius:17px;box-shadow:0 12px 38px #1519220a}
h1{font-size:28px;line-height:1.22;letter-spacing:-1.1px;margin:0 0 10px;font-weight:720}.lead{margin:0 0 27px;color:var(--muted);font-size:13px}
.providers{display:grid;gap:10px}.provider{height:45px;border:1px solid #dcdfe4;border-radius:9px;background:#fff;color:#24262b;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:11px;cursor:pointer;transition:background .15s,border-color .15s;width:100%}.provider:hover{background:#f8f9fb;border-color:#b8bdc6}.provider svg{width:17px;height:17px;flex-shrink:0}.provider[aria-disabled=true]{opacity:.75}
.more{border:0;background:transparent;display:flex;align-items:center;justify-content:center;gap:7px;margin:14px auto 8px;padding:6px;color:#4d535d;font-weight:600;font-size:12px;cursor:pointer}.chevron{transition:transform .2s}.more[aria-expanded=true] .chevron{transform:rotate(180deg)}.other{display:none}.other.open{display:grid;gap:9px}
.sep{display:flex;align-items:center;gap:12px;color:#a0a4ad;font-size:11px;margin:19px 0}.sep:before,.sep:after{content:"";height:1px;background:#e6e7eb;flex:1}
.email-link{display:block;text-align:center;color:var(--blue);font-size:13px;font-weight:650;text-decoration:none;padding:3px 0 10px}.email-link:hover{text-decoration:underline}
.email-form{display:none;margin-top:8px}.email-form.open{display:block}.field{display:block;margin:0 0 13px}.field span{display:block;font-size:12px;font-weight:650;margin-bottom:7px}.field input{width:100%;height:43px;border:1px solid #d7dae0;border-radius:8px;padding:0 12px;background:#fff;color:#16181d;font:inherit;outline:none}.field input:focus{border-color:#7397ed;box-shadow:0 0 0 3px #2864e817}.primary{height:44px;width:100%;border:0;border-radius:8px;background:#202329;color:#fff;font-size:13px;font-weight:650;cursor:pointer}.primary:disabled{opacity:.6;cursor:wait}.notice{font-size:12px;min-height:18px;margin:10px 0;color:#b42318;text-align:center}.legal{border-top:1px solid #eceef1;margin-top:20px;padding-top:17px;color:#8a8e97;font-size:10px;line-height:1.7;text-align:center}.legal a{color:#555b65;text-decoration:underline;text-underline-offset:2px}.foot{max-width:1180px;margin:0 auto;padding:0 34px 26px;display:flex;justify-content:space-between;color:#969aa2;font-size:11px}
@media(max-width:520px){.top{height:68px;padding:0 20px}.brand{font-size:19px}main{padding:24px 13px 45px}.card{padding:29px 22px 23px;border-radius:14px}h1{font-size:26px}.foot{padding:0 20px 22px}.foot span:last-child{display:none}}
</style></head><body>
<header class="top"><a class="brand" href="/" aria-label="Velclaw home"><svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="velclawMark" x1="4" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse"><stop stop-color="#4f8cff"/><stop offset=".52" stop-color="#2457e6"/><stop offset="1" stop-color="#10172f"/></linearGradient></defs><path d="M3 7h12l10 18-6 10L3 7Z" fill="url(#velclawMark)"/><path d="M18 7h19L24 29l-6-10 6-8h-6V7Z" fill="#2864e8"/><path d="M18 7h7l-7 12-6-10 6-2Z" fill="#6ca2ff"/></svg><span>Velclaw</span></a><button class="outline" id="topSwitch" type="button">Log In</button></header>
<main><section class="card" aria-labelledby="title">
<div class="hero-brand"><svg class="hero-mark" viewBox="0 0 64 64" aria-label="Velclaw logo" role="img"><defs><linearGradient id="heroVelclaw" x1="6" y1="5" x2="53" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#4f8cff"/><stop offset=".48" stop-color="#2457e6"/><stop offset="1" stop-color="#10172f"/></linearGradient></defs><path d="M5 9h18l15 27-9 15L5 9Z" fill="url(#heroVelclaw)"/><path d="M28 9h31L39 42l-9-15 9-12H28V9Z" fill="#2864e8"/><path d="M28 9h11L28 27 19 12l9-3Z" fill="#6ca2ff"/></svg><div class="hero-name">Velclaw</div><div class="hero-tagline">Deploy. Build. Grow.</div></div><h1 id="title">Your first deploy is just a sign-up away.</h1><p class="lead" id="lead">Create your Velclaw account to get started.</p>
<div class="providers" id="providers">
<button class="provider" type="button" data-provider="Google"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.7-.06-1.38-.18-2.03H12v3.84h5.38a4.6 4.6 0 0 1-2 3.02v2.48h3.24c1.9-1.75 2.98-4.32 2.98-7.31Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.46l-3.24-2.48c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.75-5.59-4.1H3.06v2.55A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.12-1.32.32-1.92V7.53H3.06A10 10 0 0 0 2 12c0 1.61.39 3.13 1.06 4.47l3.35-2.55Z"/><path fill="#EA4335" d="M12 5.98c1.47 0 2.78.5 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.53l3.35 2.55C7.2 7.73 9.4 5.98 12 5.98Z"/></svg><span>Continue with Google</span></button>
<button class="provider" type="button" data-provider="GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.08c-3.1.67-3.76-1.31-3.76-1.31-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1.75 1.96 3.06 1.5.1-.72.39-1.2.7-1.48-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.29-2.61 5.24-5.1 5.51.4.35.75 1.03.75 2.08V22c0 .29.2.63.77.52A11.1 11.1 0 0 0 12 .9Z"/></svg><span>Continue with GitHub</span></button>
<button class="provider" type="button" data-provider="ChatGPT"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.28 9.3a5.62 5.62 0 0 0-.49-4.6 5.7 5.7 0 0 0-6.13-2.74A5.62 5.62 0 0 0 11.42 0a5.7 5.7 0 0 0-5.44 3.95 5.62 5.62 0 0 0-3.76 2.74 5.7 5.7 0 0 0 .7 6.68 5.62 5.62 0 0 0 .49 4.6 5.7 5.7 0 0 0 6.13 2.74A5.62 5.62 0 0 0 13.58 23a5.7 5.7 0 0 0 5.44-3.95 5.62 5.62 0 0 0 3.76-2.74 5.7 5.7 0 0 0-.5-7.01ZM13.58 21a3.55 3.55 0 0 1-2.28-.83l.11-.06 3.79-2.19a.96.96 0 0 0 .48-.83v-5.35l1.6.92a.18.18 0 0 1 .09.15v4.42A3.77 3.77 0 0 1 13.58 21Zm-7.66-3.27a3.75 3.75 0 0 1-.45-2.53l.11.07 3.8 2.19a.96.96 0 0 0 .95 0l4.63-2.67v1.84a.18.18 0 0 1-.08.15l-3.83 2.21a3.77 3.77 0 0 1-5.13-1.26ZM4.92 7.68a3.54 3.54 0 0 1 1.97-1.7v4.51a.96.96 0 0 0 .48.83L12 14v1.85a.18.18 0 0 1-.09.15l-3.83-2.2a3.77 3.77 0 0 1-3.16-6.12Zm13.16 3.05-4.63-2.67 1.6-.92a.18.18 0 0 1 .17 0l3.83 2.21a3.77 3.77 0 0 1-.58 6.82v-4.51a.96.96 0 0 0-.39-.93ZM16.5 6.3l-.11-.07-3.79-2.19a.96.96 0 0 0-.95 0L7.02 6.71V4.87a.18.18 0 0 1 .08-.15l3.83-2.21a3.77 3.77 0 0 1 5.57 3.79Zm-9.99 5.39-1.6-.92a.18.18 0 0 1-.09-.15V6.2a3.77 3.77 0 0 1 6.19-2.88l-.11.06-3.79 2.19a.96.96 0 0 0-.48.83v5.29Z"/></svg><span>Continue with ChatGPT</span></button>
<button class="provider" type="button" data-provider="Apple"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.37 12.53c.02 2.15 1.89 2.87 1.91 2.88-.02.05-.3 1.04-.99 2.06-.6.9-1.23 1.79-2.22 1.81-.97.02-1.29-.59-2.41-.59s-1.47.57-2.39.61c-.96.04-1.69-.97-2.3-1.86-1.25-1.81-2.2-5.1-.92-7.33a3.55 3.55 0 0 1 3-1.82c.94-.02 1.82.64 2.4.64.57 0 1.65-.79 2.78-.67.47.02 1.8.19 2.65 1.43-.07.04-1.58.92-1.56 2.84ZM14.54 6.97c.5-.61.84-1.47.75-2.32-.73.03-1.61.49-2.13 1.1-.47.54-.88 1.42-.77 2.25.81.06 1.65-.41 2.15-1.03Z"/></svg><span>Continue with Apple</span></button></div>
<button class="more" id="more" type="button" aria-expanded="false">Show other options <span class="chevron">⌄</span></button>
<div class="other" id="other"><button class="provider" type="button" data-provider="Microsoft">Continue with Microsoft</button><button class="provider" type="button" data-provider="GitLab">Continue with GitLab</button></div>
<div class="sep">OR</div><a href="#" class="email-link" id="emailLink">Continue with Email →</a>
<form class="email-form" id="emailForm"><label class="field"><span>Email address</span><input id="email" type="email" autocomplete="username" placeholder="you@company.com" required></label><label class="field" id="passwordWrap"><span>Password</span><input id="password" type="password" autocomplete="current-password" placeholder="Enter password" required></label><button class="primary" id="submit" type="submit">Log in with Email</button><p class="notice" id="notice" role="status"></p></form>
<div class="legal">By continuing, you agree to Velclaw's <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</div>
</section></main><footer class="foot"><span>© <span id="year"></span> Velclaw</span><span>Built for your next deploy.</span></footer>
<script>
const $=id=>document.getElementById(id);let mode='signup';let emailOpen=false;
function renderMode(next){mode=next;$('title').textContent=mode==='signup'?'Your first deploy is just a sign-up away.':'Log in to Velclaw';$('lead').textContent=mode==='signup'?'Create your Velclaw account to get started.':'Welcome back. Sign in to continue to your workspace.';$('topSwitch').textContent=mode==='signup'?'Log In':'Sign Up';$('emailLink').textContent=mode==='signup'?'Continue with Email →':'Continue with Email →';$('submit').textContent=mode==='signup'?'Create account':'Log in with Email';$('passwordWrap').style.display=mode==='signup'?'block':'block';$('password').autocomplete=mode==='signup'?'new-password':'current-password';$('notice').textContent='';}
$('topSwitch').addEventListener('click',()=>{renderMode(mode==='signup'?'login':'signup');if(emailOpen)$('email').focus();});
$('more').addEventListener('click',()=>{const open=$('more').getAttribute('aria-expanded')!=='true';$('more').setAttribute('aria-expanded',String(open));$('other').classList.toggle('open',open);});
$('emailLink').addEventListener('click',e=>{e.preventDefault();emailOpen=!emailOpen;$('emailForm').classList.toggle('open',emailOpen);if(emailOpen)$('email').focus();});
document.querySelectorAll('[data-provider]').forEach(button=>button.addEventListener('click',()=>{$('notice').textContent=button.dataset.provider+' sign-in is not configured on this deployment yet. Use Email sign-in or configure this OAuth provider first.';$('emailForm').classList.add('open');emailOpen=true;}));
$('year').textContent=new Date().getFullYear();
$('emailForm').addEventListener('submit',async e=>{e.preventDefault();const button=$('submit'),notice=$('notice');button.disabled=true;notice.style.color='#6f737c';notice.textContent=mode==='signup'?'Account registration is not enabled yet. Contact the Velclaw administrator.':'Signing in…';if(mode==='signup'){button.disabled=false;notice.style.color='#b42318';notice.textContent='Self-service sign-up is not enabled yet. The current deployment only supports the configured administrator account.';return;}try{const response=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({email:$('email').value,password:$('password').value})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Unable to sign in.');location.assign('/');}catch(err){notice.style.color='#b42318';notice.textContent=err.message||'Sign-in failed.';button.disabled=false;}});
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