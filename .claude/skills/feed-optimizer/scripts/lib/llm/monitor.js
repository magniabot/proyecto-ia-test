#!/usr/bin/env node
// Monitor server — a tiny localhost-only HTTP UI for a feed-optimizer job (small-attributes or
// content). Read-only over the job files (job-state.json heartbeat + errors.jsonl tail); owns
// lifecycle buttons (Pause / Resume) that write control.json and spawn a fresh DETACHED
// worker when needed. It can be opened, closed, and reopened without touching the running job. No
// secrets are ever read or served. On startup it auto-opens the page in the default browser unless
// --no-open is passed.
//
//   node monitor.js --job-id <id> --project-root <path> [--port 8787] [--no-open]

import http from 'http';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from '../feed-optimizer-core.js';
import { jobPaths, readJsonSafe, readJsonl, writeControl } from './job.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const jobId = args['job-id'] || args.jobId;
const projectRoot = args['project-root'] || process.env.PWD || resolve(__dirname, '../../../../../..');
const port = parseInt(args.port || '8787', 10);
if (!jobId) { console.error('--job-id is required'); process.exit(1); }
const paths = jobPaths(projectRoot, jobId);

// Human label for this job's action, used in the page <title> + heading. config.json is the source
// of truth; fall back to the state heartbeat, then to small-attributes (the historical default).
const ACTION_LABELS = { content: 'Content', 'small-attributes': 'Small Attributes' };
function actionLabel() {
  const action = readJsonSafe(paths.config, {}).action || readJsonSafe(paths.state, {}).action || 'small-attributes';
  return ACTION_LABELS[action] || 'Feed Optimizer';
}
const LABEL = actionLabel();

// Open a URL in the OS default browser, detached. Best-effort: a failure to open never breaks the
// monitor (the URL is also printed to the console).
function openBrowser(url) {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const openArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(cmd, openArgs, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch { /* best-effort */ }
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function spawnWorker() {
  const config = readJsonSafe(paths.config, {});
  const workerArgs = ['--job-id', jobId, '--project-root', projectRoot, '--resume'];
  if (config.mock) workerArgs.push('--mock');
  const child = spawn(process.execPath, [resolve(__dirname, 'run-job.js'), ...workerArgs], {
    detached: true, stdio: 'ignore', cwd: projectRoot,
  });
  child.unref();
  return child.pid;
}

function statusPayload() {
  const state = readJsonSafe(paths.state, {});
  const errorsTail = readJsonl(paths.errors).slice(-20).reverse();
  const alive = pidAlive(state.pid);
  const total = state.total || 0;
  const completed = state.completed || 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const elapsedMin = state.started_at ? Math.max(0.01, (Date.now() - new Date(state.started_at).getTime()) / 60000) : 0;
  const rate = elapsedMin ? completed / elapsedMin : 0;
  const etaMin = rate > 0 ? Math.ceil((total - completed) / rate) : null;
  return {
    job_id: jobId, status: state.status || 'unknown', worker_alive: alive,
    total, completed, failed: state.failed || 0, pct,
    running_cost: state.running_cost || 0, projected_total: state.projected_total || 0,
    max_cost: state.max_cost || null, model: state.model || '', mode: state.mode || '',
    rate_per_min: Math.round(rate), eta_min: etaMin, errors: errorsTail, updated_at: state.updated_at || null,
  };
}

function renderPage(label) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label} — Feed Optimizer Monitor</title>
<style>
 :root{
   --Navy-6:#0C0A3E; --Navy-5:#09082D; --Navy-4:#1E406F; --Dark-2:#0A060E;
   --Blue-46:#2F5BFF; --Blue-42:#194CF2; --Blue-44:#4166F1; --Blue-38:#0C57BD;
   --White-100:#FFFFFF; --Grey-65:#949EAF; --Grey-42:#6B7280;
   --font-body:'Geist',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
   --font-mono:ui-monospace,'SF Mono',Menlo,'Cascadia Code',Consolas,monospace;
   --r-card:12px; --r-button:10px; --r-pill:50px;
   --panel:rgba(255,255,255,0.04); --panel-border:rgba(255,255,255,0.10);
 }
 *{box-sizing:border-box}
 body{
   font-family:var(--font-body); font-size:14px; line-height:1.5; margin:0; color:var(--White-100);
   background:
     radial-gradient(1100px 520px at 80% -10%, rgba(47,91,255,0.18), transparent 60%),
     linear-gradient(94deg, var(--Navy-6) 0.06%, var(--Navy-5) 30%, var(--Navy-5) 60%, var(--Navy-4) 100%);
   background-attachment:fixed; min-height:100vh;
 }
 .wrap{max-width:820px;margin:0 auto;padding:32px 24px 56px}
 .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:28px}
 .brand{display:flex;align-items:center;gap:10px}
 .brand svg{display:block}
 .brand .name{font-weight:600;letter-spacing:-0.2px}
 .brand .name b{color:var(--White-100)} .brand .name span{color:var(--Grey-65)}
 h1.title{font-size:30px;font-weight:700;letter-spacing:-0.64px;margin:0 0 4px;line-height:1.1}
 .title .accent{
   background:linear-gradient(277deg,#2F5BFF 0%,rgba(47,91,255,0.45) 50%,#2F5BFF 100%);
   -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
 }
 .sub{color:var(--Grey-65);margin:0 0 22px;font-family:var(--font-mono);font-size:12.5px}
 .statusline{display:flex;align-items:center;gap:10px;margin-bottom:6px}
 .bar{height:14px;background:rgba(255,255,255,0.06);border:1px solid var(--panel-border);border-radius:var(--r-pill);overflow:hidden;margin:14px 0 6px}
 .fill{height:100%;background:linear-gradient(90deg,var(--Blue-38),var(--Blue-46));width:0;border-radius:var(--r-pill);transition:width .5s ease}
 .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:20px 0}
 .card{background:var(--panel);border:1px solid var(--panel-border);border-radius:var(--r-card);padding:16px;box-shadow:0 0 24px -8px rgba(0,0,0,0.35)}
 .card .k{color:var(--Grey-65);font-size:12px;letter-spacing:-0.12px} .card .v{font-size:22px;font-weight:700;margin-top:4px;letter-spacing:-0.4px}
 .btns{display:flex;gap:10px;margin:22px 0}
 button{
   font-family:var(--font-body);font-weight:600;font-size:13px;color:var(--White-100);
   background:var(--panel);border:1px solid var(--panel-border);border-radius:var(--r-button);
   padding:9px 16px;cursor:pointer;transition:background 120ms ease,border-color 120ms ease;
 }
 button:hover{background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.2)}
 button.primary{
   background:var(--Blue-46);border:2px solid var(--Blue-42);
   box-shadow:inset 0 -2px 2px 3px var(--Blue-46), inset 0 0 0 4px var(--Blue-44);
 }
 button.primary:hover{background:var(--Blue-42)}
 .pill{display:inline-block;padding:3px 12px;border-radius:var(--r-pill);font-size:12px;font-weight:600;text-transform:capitalize}
 .running{background:rgba(34,197,94,0.16);color:#86efac;border:1px solid rgba(34,197,94,0.35)}
 .paused{background:rgba(244,140,6,0.16);color:#fdba74;border:1px solid rgba(244,140,6,0.35)}
 .completed{background:rgba(47,91,255,0.18);color:#bfd0ff;border:1px solid rgba(47,91,255,0.4)}
 .failed{background:rgba(239,68,68,0.16);color:#fca5a5;border:1px solid rgba(239,68,68,0.35)}
 .starting,.unknown{background:rgba(148,158,175,0.16);color:var(--Grey-65);border:1px solid var(--panel-border)}
 h3{font-size:14px;font-weight:600;margin:26px 0 8px;letter-spacing:-0.2px}
 table{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--panel);border:1px solid var(--panel-border);border-radius:var(--r-card);overflow:hidden}
 td,th{text-align:left;padding:9px 12px;border-bottom:1px solid var(--panel-border)}
 tr:last-child td{border-bottom:none}
 th{color:var(--Grey-65);font-weight:600} td:first-child{font-family:var(--font-mono);color:#bfd0ff}
 .muted{color:var(--Grey-65);font-size:12px} #upd{margin-top:18px}
</style></head><body><div class="wrap">
 <div class="topbar">
   <div class="brand">
     <svg viewBox="0 0 256.905 276.429" width="24" height="26" aria-hidden="true"><path d="M229.284,53.282L151.921,9.012c-14.434-8.261-32.219-8.261-46.653,0L27.904,53.282c-14.437,8.261-23.328,23.527-23.328,40.047v88.543c0,16.522,8.891,31.788,23.328,40.047l77.363,44.272c14.435,8.259,32.219,8.259,46.653,0l77.363-44.272c14.437-8.259,23.328-23.525,23.328-40.047v-88.543c0-16.52-8.891-31.786-23.328-40.047ZM187.569,178.601l-58.734,34.381-.226-75.468-65.074-37.056,59.191-33.999c3.785-2.174,8.439-2.182,12.231-.021l58.501,33.341.205,68.157c.013,4.386-2.308,8.449-6.093,10.664Z" fill="#fff"/></svg>
     <span class="name"><b>PPC Mastery</b> <span>· Feed Optimizer</span></span>
   </div>
   <span class="pill unknown" id="status">…</span>
 </div>
 <h1 class="title">${label} <span class="accent">Job Monitor</span></h1>
 <p class="sub" id="job"></p>
 <div class="statusline"><span class="muted" id="worker"></span></div>
 <div class="bar"><div class="fill" id="fill"></div></div>
 <div class="muted" id="prog"></div>
 <div class="grid">
   <div class="card"><div class="k">Running cost</div><div class="v" id="cost">—</div></div>
   <div class="card"><div class="k">Projected total</div><div class="v" id="proj">—</div></div>
   <div class="card"><div class="k">ETA</div><div class="v" id="eta">—</div></div>
 </div>
 <div class="btns">
   <button class="primary" onclick="ctl('resume')">▶ Resume</button>
   <button onclick="ctl('pause')">⏸ Pause</button>
 </div>
 <h3>Recent failures</h3>
 <table><thead><tr><th>product_id</th><th>reason</th></tr></thead><tbody id="errs"><tr><td colspan="2" class="muted">none</td></tr></tbody></table>
 <p class="muted" id="upd"></p>
<script>
 const usd=n=>n>=1?'$'+n.toFixed(2):'$'+n.toFixed(4);
 const esc=s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
 async function tick(){
   const r=await fetch('/api/status'); const s=await r.json();
   document.getElementById('job').textContent=s.job_id+' · '+s.model;
   const st=document.getElementById('status'); st.textContent=s.status; st.className='pill '+(s.status||'unknown');
   document.getElementById('worker').textContent=s.worker_alive?'● worker running':'○ worker not running';
   document.getElementById('fill').style.width=s.pct+'%';
   document.getElementById('prog').textContent=s.completed+' / '+s.total+' done · '+s.failed+' failed · '+s.rate_per_min+'/min';
   document.getElementById('cost').textContent=usd(s.running_cost||0);
   document.getElementById('proj').textContent=usd(s.projected_total||0)+(s.max_cost?(' / cap '+usd(s.max_cost)):'');
   document.getElementById('eta').textContent=s.eta_min==null?'—':(s.eta_min+' min');
   const tb=document.getElementById('errs');
   tb.innerHTML=(s.errors&&s.errors.length)?s.errors.map(e=>'<tr><td>'+esc(e.product_id)+'</td><td>'+esc(e.reason)+'</td></tr>').join(''):'<tr><td colspan="2" class="muted">none</td></tr>';
   document.getElementById('upd').textContent='updated '+(s.updated_at||'');
 }
 async function ctl(cmd){ await fetch('/api/control?cmd='+cmd,{method:'POST'}); setTimeout(tick,400); }
 tick(); setInterval(tick,2000);
</script></div></body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(renderPage(LABEL)); return; }
  if (url.pathname === '/api/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(statusPayload())); return; }
  if (url.pathname === '/api/control' && req.method === 'POST') {
    const cmd = url.searchParams.get('cmd');
    let spawned = null;
    if (cmd === 'pause') writeControl(paths, 'pause');
    else if (cmd === 'resume') {
      writeControl(paths, 'run');
      const state = readJsonSafe(paths.state, {});
      if (!pidAlive(state.pid)) spawned = spawnWorker(); // only spawn if no worker is alive
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, cmd, spawned })); return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`[monitor] ${url}  (job ${jobId})`);
  // Auto-open once the server is actually listening (so the browser never races an unbound port).
  if (args['no-open'] !== true) openBrowser(url);
});
