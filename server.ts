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
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000"><title>Account access — VelclawHost</title><style>
:root{color-scheme:dark;--bg:#000;--panel:#050505;--line:#292929;--line-strong:#454545;--muted:#8b8b8b;--text:#f5f5f5}*{box-sizing:border-box;border-radius:0!important}html{background:#000}body{margin:0;min-height:100svh;background:#000;color:var(--text);font:13px/1.65 "SFMono-Regular",Consolas,"Liberation Mono",monospace;letter-spacing:.01em}a{color:inherit;text-decoration:none}.nav{min-height:64px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:#000}.brand{font-size:15px;font-weight:800;letter-spacing:.04em}.navlinks{display:flex;gap:22px;color:#aaa;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.navlinks a:hover{color:#fff}main{min-height:calc(100svh - 64px);display:grid;place-items:center;padding:42px 18px}.auth{width:min(100%,430px);border:1px solid var(--line);padding:30px;background:#050505;box-shadow:0 0 0 1px #080808}.mark{display:grid;place-items:center;width:38px;height:38px;border:1px solid var(--line-strong);color:#fff;font-size:19px;margin-bottom:22px}.eyebrow{font-size:10px;letter-spacing:.16em;color:#aaa;text-transform:uppercase}.title{font-size:25px;line-height:1.3;letter-spacing:-.04em;margin:10px 0}.sub{color:var(--muted);margin:0 0 25px;font-size:12px}.tabs{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);margin-bottom:24px}.tab{min-height:43px;border:0;border-right:1px solid var(--line);border-bottom:2px solid transparent;background:#080808;color:#888;padding:12px;cursor:pointer;font:inherit;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.tab:last-child{border-right:0}.tab.active{border-bottom-color:#fff;background:#111;color:#fff}.field{display:grid;gap:8px;margin:16px 0}.field label{color:#aaa;font-size:10px;letter-spacing:.1em}.field input{width:100%;min-height:46px;padding:12px 13px;border:1px solid var(--line);background:#000;color:#fff;font:inherit;font-size:12px;outline:none;transition:border-color .15s}.field input::placeholder{color:#555}.field input:focus{border-color:#aaa}.primary,.provider{width:100%;min-height:46px;padding:12px 14px;border:1px solid #eee;background:#f5f5f5;color:#000;font:inherit;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:background .15s,color .15s,border-color .15s}.primary:hover{background:#d9d9d9}.provider{border-color:var(--line-strong);background:#050505;color:#eee;font-weight:500}.provider:hover:not(:disabled){background:#151515;border-color:#777}.provider:disabled{opacity:.45;cursor:not-allowed}.primary:disabled{opacity:.55;cursor:wait}.separator{display:flex;align-items:center;gap:12px;color:#666;font-size:9px;letter-spacing:.12em;margin:22px 0}.separator:before,.separator:after{content:"";height:1px;background:var(--line);flex:1}.providers{display:grid;gap:10px}.message{min-height:20px;color:#f0a0a0;font-size:11px;margin-top:12px;overflow-wrap:anywhere}.foot{border-top:1px solid var(--line);margin-top:24px;padding-top:16px;color:#777;font-size:10px;line-height:1.8}.foot a{color:#ccc;text-decoration:underline;text-underline-offset:3px}:focus-visible{outline:1px solid #fff;outline-offset:3px}@media(max-width:500px){.nav{padding:0 16px;min-height:58px}.navlinks{gap:14px;font-size:10px}main{min-height:calc(100svh - 58px);padding:22px 14px;align-items:start;padding-top:30px}.auth{padding:22px 18px}.title{font-size:23px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body><header class="nav"><a class="brand" href="/">[&gt;_ VELCLAW]</a><nav class="navlinks"><a href="/">Home</a><a href="/docs">Docs</a></nav></header><main><section class="auth"><div class="mark">&gt;_</div><div class="eyebrow">Authentication gateway // 01</div><h1 class="title" id="heading">Sign in to your workspace</h1><p class="sub" id="subheading">Access your projects, deployments and infrastructure settings.</p><div class="tabs"><button class="tab active" id="loginTab" type="button">01 / Sign in</button><button class="tab" id="signupTab" type="button">02 / Register</button></div><form id="authForm"><div class="field"><label for="email">EMAIL ADDRESS</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div><div class="field"><label for="password">PASSWORD</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required minlength="8"></div><button class="primary" id="submit" type="submit">Sign in ↗</button></form><div class="message" id="message" role="status" aria-live="polite"></div><div class="separator">OR CONTINUE WITH</div><div class="providers"><button class="provider" type="button" disabled>Continue with GitHub // unavailable</button><button class="provider" type="button" disabled>Continue with Google // unavailable</button></div><div class="foot">By continuing, you agree to use VelclawHost responsibly. <a href="/docs">Read documentation</a>. Account registration and third-party OAuth must be configured before new accounts can be created.</div></section></main><script>
const loginTab=document.getElementById('loginTab'),signupTab=document.getElementById('signupTab'),heading=document.getElementById('heading'),subheading=document.getElementById('subheading'),submit=document.getElementById('submit'),password=document.getElementById('password'),message=document.getElementById('message');let mode=new URLSearchParams(location.search).get('mode')==='signup'?'signup':'login';function setMode(next){mode=next;loginTab.classList.toggle('active',mode==='login');signupTab.classList.toggle('active',mode==='signup');heading.textContent=mode==='login'?'Sign in to your workspace':'Create your VelclawHost account';subheading.textContent=mode==='login'?'Access your projects, deployments and infrastructure settings.':'Create an account to manage your projects and deployments.';submit.textContent=mode==='login'?'Sign in ↗':'Create account ↗';password.autocomplete=mode==='login'?'current-password':'new-password';message.textContent='';}loginTab.addEventListener('click',()=>setMode('login'));signupTab.addEventListener('click',()=>setMode('signup'));setMode(mode);document.getElementById('authForm').addEventListener('submit',async e=>{e.preventDefault();message.textContent='';submit.disabled=true;submit.textContent='Please wait...';try{if(mode==='signup'){message.textContent='Registration is not configured yet. Contact the platform administrator.';return;}const response=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:password.value})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.message||'Sign-in failed.');location.href='/dashboard';}catch(error){message.textContent=error instanceof Error?error.message:'Sign-in failed.';}finally{submit.disabled=false;submit.textContent=mode==='login'?'Sign in ↗':'Create account ↗';}});
</script></body></html>`;
}

startServer();