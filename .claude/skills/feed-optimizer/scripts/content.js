#!/usr/bin/env node
// Orchestration CLI for the feed-optimizer `content` action (prose maker). Claude drives this per
// reference/content/content-flow.md. Subcommands mirror small-attributes.js — the LLM job machinery
// (job/run-job/monitor/cost) is shared; only the worklist, prompt, and validator are content-specific.
//   gate       Phase 0: fresh audit + merchant cache + OPENAI_API_KEY + campaigns.csv surface check
//   worklist   build the union (weak title/desc + missing trio) -> jobs/<id>/worklist.json
//   sample     stratified sample, run synchronously, write sample-review.csv (old -> new prose)
//   estimate   project full-run cost from the measured sample
//   launch     freeze config.json (action=content), spawn detached worker + monitor (--confirm)
//   resume     spawn detached worker (--resume) + monitor
//   status     print job-state.json + progress
//   assemble   (re)assemble importable outputs from results.jsonl
//
// Never mutates Merchant Center / Channable. Output is an importable supplemental feed; for title/
// description it OVERRIDES the existing value on import (reviewable via diff.csv).

import { existsSync, mkdirSync, openSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import {
  FeedOptimizerError, parseArgs, outputPaths, loadJson, checkFreshAuditPrerequisites, writeCsv,
} from './lib/feed-optimizer-core.js';
import { jobPaths, writeJsonAtomic, readJsonSafe, loadProgress, writeState, writeControl, assembleOutputs, worklistFingerprint, resolveReasoningEffort, loadSampleForPricing } from './lib/llm/job.js';
import { buildContentWorklist } from './lib/llm/worklist-content.js';
import { stratifiedSample } from './lib/llm/worklist.js';
import { callItem, getApiKey } from './lib/llm/openai-client-content.js';
import { validateProduct } from './lib/llm/validate-content.js';
import { catalogTypeDistribution, VALID_CATALOG_TYPES } from './lib/llm/catalog-type.js';
import { discoverVoice } from './lib/llm/voice.js';
import { costOf, projectCost, fmtUsd, DEFAULT_MODEL, assertKnownModel } from './lib/llm/cost.js';
import { defaultToggles } from './lib/llm/spec-content.js';
import { loadLexiconOverrides } from '../../feed-auditor/scripts/lib/feed-auditor-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAMPAIGNS_CSV = 'context/google-ads/data/campaigns.csv';

function discoverProjectRoot(start) {
  let cur = resolve(start);
  while (cur !== dirname(cur)) {
    if (existsSync(resolve(cur, 'context/feed/cache'))) return cur;
    cur = dirname(cur);
  }
  throw new FeedOptimizerError('client-root-not-found', 'Could not find PPCOS client root (no context/feed/cache). Run from a client workspace after /feed-auditor.');
}

function resolveToggles(args) {
  const toggles = defaultToggles();
  const disable = (args.disable || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const k of disable) if (k in toggles) toggles[k] = false;
  const only = (args.only || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (only.length) for (const k of Object.keys(toggles)) toggles[k] = only.includes(k);
  return toggles;
}

// --type-override "animals & pet supplies=consumables_health_beauty; toys & games=general"
// Pairs are ;-separated (GPC top-level verticals contain commas), keys are GPC top-level verticals,
// values must be a known catalog_type. Returns null when the flag is absent.
function resolveTypeOverrides(args) {
  const raw = String(args['type-override'] || '').trim();
  if (!raw) return null;
  const overrides = {};
  for (const pair of raw.split(';').map((s) => s.trim()).filter(Boolean)) {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new FeedOptimizerError('bad-type-override', `--type-override entries must be "<gpc top-level vertical>=<catalog_type>" (;-separated), got "${pair}".`);
    const key = pair.slice(0, eq).trim().toLowerCase();
    const value = pair.slice(eq + 1).trim().toLowerCase();
    if (!VALID_CATALOG_TYPES.includes(value)) {
      throw new FeedOptimizerError('bad-type-override', `Unknown catalog_type "${value}" in --type-override. Valid: ${VALID_CATALOG_TYPES.join(', ')}.`);
    }
    overrides[key] = value;
  }
  return overrides;
}

function emit(obj) { console.log('\n__RESULTS_JSON__'); console.log(JSON.stringify(obj)); }

// ---- gate -------------------------------------------------------------------------------------
function cmdGate(projectRoot, args) {
  const freshness = checkFreshAuditPrerequisites({ projectRoot, maxAgeHours: parseInt(args['max-age-hours'] || '24', 10) });
  const hasKey = Boolean(getApiKey(projectRoot));
  if (!hasKey) {
    throw new FeedOptimizerError('missing-openai-key', 'OPENAI_API_KEY is not set. Add it to config/.env (Client Env) before running content. It is read only by the worker and never logged.');
  }
  // Soft surface check: campaigns.csv drives short_title relevance (Demand Gen / Video / PMax). Its
  // absence is NOT a failure — short_title simply won't be in scope. See content-flow.md.
  const campaignsPath = resolve(projectRoot, CAMPAIGNS_CSV);
  const campaignsPresent = existsSync(campaignsPath);
  console.log('Phase 0 gate: PASS');
  console.log(`  fresh feed-auditor evidence: ok (<=${freshness.max_age_hours}h)`);
  console.log('  merchant cache: ok');
  console.log('  OPENAI_API_KEY: present');
  console.log(`  campaigns.csv (surface signal for short_title): ${campaignsPresent ? 'present' : 'ABSENT — run /gads-context to enable short_title scope'}`);
  emit({ status: 'gate_pass', freshness: { max_age_hours: freshness.max_age_hours }, openai_key: true, campaigns_csv_present: campaignsPresent });
}

// ---- worklist ---------------------------------------------------------------------------------
function cmdWorklist(projectRoot, args) {
  const paths = outputPaths(projectRoot);
  const jobId = args['job-id'] || `content-${new Date().toISOString().slice(0, 10)}`;
  const products = loadJson(paths.merchantCacheJson, 'invalid-merchant-cache');
  const toggles = resolveToggles(args);
  const typeOverrides = resolveTypeOverrides(args);
  const { profile, items, attribute_summary, catalog_type_mix, surface_present } = buildContentWorklist(products, toggles, { projectRoot, typeOverrides });
  const catalog_distribution = catalogTypeDistribution(products, null, typeOverrides);

  const jp = jobPaths(projectRoot, jobId);
  mkdirSync(jp.dir, { recursive: true });
  writeJsonAtomic(jp.worklist, items);
  writeJsonAtomic(resolve(jp.dir, 'worklist-summary.json'), {
    job_id: jobId, action: 'content', attribute_summary, catalog_type_mix, catalog_distribution,
    type_overrides: typeOverrides, surface_present, item_count: items.length,
    total_products: products.length, toggles,
    vertical_top: profile.vertical_distribution[0] || null,
  });

  console.log('Feed Optimizer - Content: Worklist');
  console.log(`Job: ${jobId}`);
  console.log(`Total products: ${products.length} | In worklist (>=1 weak/missing content field): ${items.length}`);
  console.log(`Demand Gen / Video / PMax surface present (gates short_title): ${surface_present ? 'yes' : 'no'}`);
  console.log('Work per field:');
  for (const [k, n] of Object.entries(attribute_summary).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${n}`);
  console.log('Detected category mix (confirm/override the formula mapping with the user):');
  for (const c of catalog_distribution.slice(0, 8)) console.log(`  ${c.catalog_type.padEnd(26)} ${c.pct}%  -> ${c.title_formula}`);
  if (typeOverrides) {
    console.log('Applied --type-override:');
    for (const [k, v] of Object.entries(typeOverrides)) console.log(`  ${k} -> ${v}`);
  } else {
    console.log('(Override a vertical\'s formula with --type-override "<gpc top-level>=<catalog_type>; ..." and re-run worklist.)');
  }
  console.log(`\nWorklist: ${relative(projectRoot, jp.worklist)}`);
  emit({ status: 'worklist_ready', job_id: jobId, item_count: items.length, total_products: products.length, attribute_summary, catalog_type_mix, catalog_distribution, type_overrides: typeOverrides, surface_present, toggles, worklist: relative(projectRoot, jp.worklist) });
}

// ---- sample -----------------------------------------------------------------------------------
async function cmdSample(projectRoot, args) {
  const jobId = args['job-id'];
  if (!jobId) throw new FeedOptimizerError('missing-job-id', 'sample requires --job-id (run worklist first).');
  const jp = jobPaths(projectRoot, jobId);
  const items = readJsonSafe(jp.worklist, []);
  if (!items.length) throw new FeedOptimizerError('empty-worklist', 'Worklist is empty or missing. Run `worklist` first.');

  const n = parseInt(args['sample-size'] || '20', 10);
  const seed = parseInt(args.seed || '1', 10);
  const steering = args.steering || '';
  const model = args.model || DEFAULT_MODEL;
  assertKnownModel(model);
  const reasoningEffort = resolveReasoningEffort(args, 'low');
  const floor = args['confidence-floor'] || 'low';
  const mock = args.mock === true;
  const apiKey = mock ? null : getApiKey(projectRoot);
  if (!mock && !apiKey) throw new FeedOptimizerError('missing-openai-key', 'OPENAI_API_KEY not set in config/.env.');
  const overrides = loadLexiconOverrides(projectRoot);
  const { hint: voice, sources: voiceSources } = discoverVoice(projectRoot);

  const sample = stratifiedSample(items, n, seed);
  const results = [];
  const reviewRows = [];
  for (const item of sample) {
    item._imageDetail = args['image-detail'] || 'auto';
    let out;
    try { out = await callItem(item, { model, apiKey, steering, voice, reasoningEffort, mock }); }
    catch (err) { results.push({ product_id: item.product_id, error: String(err.message || err) }); continue; }
    const { filled, exceptions } = validateProduct(out.proposed, item, floor, overrides);
    const cost = costOf(out.usage, model);
    results.push({ product_id: item.product_id, proposed: out.proposed, filled, exceptions, usage: out.usage, cost });
    for (const a of item.attrs) {
      const cell = out.proposed[a.attr] || {};
      const proposedDisplay = Array.isArray(cell.value) ? JSON.stringify(cell.value) : (cell.value == null ? '' : String(cell.value));
      const status = a.attr in filled ? 'FILLED' : (exceptions.find((e) => e.attr === a.attr)?.reason || 'abstained');
      reviewRows.push({
        product_id: item.product_id, catalog_type: item.catalog_type, attribute: a.feed_name,
        trigger: a.trigger === 'weakness' ? `weak: ${(a.reasons || []).join('; ')}`.slice(0, 120) : 'missing',
        old_value: String(item.old?.[a.attr] || ''),
        new_value: (a.attr in filled ? filled[a.attr] : proposedDisplay),
        confidence: cell.confidence || '', status, evidence: (cell.evidence || '').slice(0, 240),
      });
    }
  }
  writeJsonAtomic(jp.sample, { job_id: jobId, action: 'content', seed, steering, voice, voice_sources: voiceSources, model, reasoning_effort: reasoningEffort, worklist_fingerprint: worklistFingerprint(items), sample_size: sample.length, results });
  writeCsv(jp.sampleCsv, reviewRows, ['product_id', 'catalog_type', 'attribute', 'trigger', 'old_value', 'new_value', 'confidence', 'status', 'evidence']);

  const filledCells = reviewRows.filter((r) => r.status === 'FILLED').length;
  console.log('Feed Optimizer - Content: Sample Run');
  console.log(`Job: ${jobId} | sample: ${sample.length} products | model: ${model}${mock ? ' (MOCK)' : ''} | seed: ${seed}`);
  if (voiceSources.length) console.log(`Brand voice: loaded from ${voiceSources.join(', ')}`);
  console.log(`Content cells: ${reviewRows.length} | written: ${filledCells} | abstained/rejected: ${reviewRows.length - filledCells}`);
  console.log(`Review CSV (old -> new): ${relative(projectRoot, jp.sampleCsv)}`);
  console.log('Adjust with --steering "..." and --disable a,b (or --only a,b), then re-run sample to iterate.');
  emit({ status: 'sample_ready', job_id: jobId, sample_size: sample.length, cells: reviewRows.length, filled_cells: filledCells, seed, steering, voice_sources: voiceSources, model, sample_csv: relative(projectRoot, jp.sampleCsv) });
}

// ---- estimate ---------------------------------------------------------------------------------
function cmdEstimate(projectRoot, args) {
  const jobId = args['job-id'];
  if (!jobId) throw new FeedOptimizerError('missing-job-id', 'estimate requires --job-id.');
  const jp = jobPaths(projectRoot, jobId);
  const items = readJsonSafe(jp.worklist, []);
  const sampleData = loadSampleForPricing(jp, items, args);
  const model = sampleData.model || DEFAULT_MODEL;
  const throughput = parseInt(args.throughput || '120', 10);
  const proj = projectCost({ sample: sampleData.results, worklistSize: items.length, model, throughput });

  console.log('Feed Optimizer - Content: Cost Estimate');
  console.log(`Worklist: ${items.length} products | model: ${model} (effort: ${sampleData.reasoning_effort || 'n/a'}) | basis: ${proj.basis} (${proj.sample_size} sample calls)`);
  console.log(`Per item: ${fmtUsd(proj.per_item)}`);
  console.log(`Projected cost:  ${fmtUsd(proj.live)}  (~${proj.minutes} min at ${throughput}/min)`);
  console.log(`\nShow this projection to the user and get explicit approval, then launch with the approved figure:`);
  console.log(`  launch --job-id ${jobId} --confirm-cost ${proj.live >= 1 ? proj.live.toFixed(2) : proj.live.toFixed(4)}`);
  emit({ status: 'estimate_ready', job_id: jobId, reasoning_effort: sampleData.reasoning_effort || null, ...proj });
}

// ---- launch -----------------------------------------------------------------------------------
function spawnDetached(scriptRel, extraArgs, projectRoot, jp) {
  const logFd = openSync(resolve(jp.dir, `${scriptRel.includes('monitor') ? 'monitor' : 'worker'}.log`), 'a');
  const child = spawn(process.execPath, [resolve(__dirname, scriptRel), ...extraArgs], {
    detached: true, stdio: ['ignore', logFd, logFd], cwd: projectRoot,
  });
  child.unref();
  return child.pid;
}

function cmdLaunch(projectRoot, args) {
  const jobId = args['job-id'];
  if (!jobId) throw new FeedOptimizerError('missing-job-id', 'launch requires --job-id.');
  if (args.confirm === true) throw new FeedOptimizerError('confirmation-required', '--confirm has been replaced by --confirm-cost <usd>. Run `estimate`, show the projection to the user, get explicit approval, then pass the approved figure: launch --confirm-cost <usd>.');
  const confirmCost = args['confirm-cost'] != null ? parseFloat(args['confirm-cost']) : null;
  if (confirmCost == null || !Number.isFinite(confirmCost)) {
    throw new FeedOptimizerError('confirmation-required', 'Refusing to launch without --confirm-cost <usd>. Run `estimate`, show the projected cost to the user, get explicit approval (AskUserQuestion), then pass the approved figure back: launch --confirm-cost <usd>.');
  }
  if (args.mode != null) throw new FeedOptimizerError('unsupported-flag', '--mode is not supported — jobs always run live. Re-run launch without --mode.');
  const jp = jobPaths(projectRoot, jobId);
  const items = readJsonSafe(jp.worklist, []);
  if (!items.length) throw new FeedOptimizerError('empty-worklist', 'Worklist missing/empty.');
  const sampleData = loadSampleForPricing(jp, items, args);
  const mock = args.mock === true;
  if (!mock && !getApiKey(projectRoot)) throw new FeedOptimizerError('missing-openai-key', 'OPENAI_API_KEY not set in config/.env.');

  // Re-project from the current worklist + sample and bind the launch to the number the user
  // actually approved. A drifted projection means the approval is stale — back to estimate.
  const model = sampleData.model || DEFAULT_MODEL;
  assertKnownModel(model);
  const proj = projectCost({ sample: sampleData.results, worklistSize: items.length, model });
  const tolerance = Math.max(proj.live * 0.10, 0.05);
  if (Math.abs(confirmCost - proj.live) > tolerance) {
    throw new FeedOptimizerError('confirm-cost-mismatch', `--confirm-cost ${fmtUsd(confirmCost)} does not match the current projection ${fmtUsd(proj.live)} (±10%). Re-run \`estimate\`, re-confirm with the user, and pass the new figure.`);
  }

  const config = {
    job_id: jobId, action: 'content',
    model,
    reasoning_effort: sampleData.reasoning_effort || 'low',
    steering: sampleData.steering || '',
    voice: sampleData.voice || '',
    toggles: readJsonSafe(resolve(jp.dir, 'worklist-summary.json'), {}).toggles || defaultToggles(),
    confidence_floor: args['confidence-floor'] || 'low',
    concurrency: parseInt(args.concurrency || '20', 10),
    image_detail: args['image-detail'] || 'auto',
    max_cost: args['max-cost'] != null ? parseFloat(args['max-cost']) : null,
    confirmed_cost: confirmCost, projected_cost: proj.live, per_item_estimate: proj.per_item,
    retry_errored: true, mock, started_at: new Date().toISOString(),
  };
  writeJsonAtomic(jp.config, config);
  writeState(jp, { job_id: jobId, action: 'content', status: 'starting', total: items.length, completed: 0, failed: 0, running_cost: 0, model: config.model, pid: null, started_at: config.started_at, max_cost: config.max_cost });

  const workerArgs = ['--job-id', jobId, '--project-root', projectRoot];
  if (mock) workerArgs.push('--mock');
  const workerPid = spawnDetached('lib/llm/run-job.js', workerArgs, projectRoot, jp);

  const port = parseInt(args.port || '8788', 10);
  let monitorPid = null;
  if (args['no-monitor'] !== true) monitorPid = spawnDetached('lib/llm/monitor.js', ['--job-id', jobId, '--project-root', projectRoot, '--port', String(port), ...(args['no-open'] === true ? ['--no-open'] : [])], projectRoot, jp);

  console.log('Feed Optimizer - Content: Job launched');
  console.log(`Job: ${jobId} | worker pid: ${workerPid}`);
  if (monitorPid) console.log(`Monitor: http://127.0.0.1:${port}  (pid ${monitorPid})`);
  console.log(`Job dir: ${relative(projectRoot, jp.dir)}`);
  emit({ status: 'launched', job_id: jobId, worker_pid: workerPid, monitor_pid: monitorPid, monitor_url: monitorPid ? `http://127.0.0.1:${port}` : null, job_dir: relative(projectRoot, jp.dir) });
}

function cmdResume(projectRoot, args) {
  const jobId = args['job-id'];
  if (!jobId) throw new FeedOptimizerError('missing-job-id', 'resume requires --job-id.');
  const jp = jobPaths(projectRoot, jobId);
  const config = readJsonSafe(jp.config);
  if (!config) throw new FeedOptimizerError('no-config', 'No config.json — launch the job first.');
  // Clear any monitor-issued pause before spawning, or the worker re-reads it and re-pauses
  // after the first item. Same order as the monitor's own resume: control first, then spawn.
  writeControl(jp, 'run');
  const workerArgs = ['--job-id', jobId, '--project-root', projectRoot, '--resume'];
  if (config.mock) workerArgs.push('--mock');
  const workerPid = spawnDetached('lib/llm/run-job.js', workerArgs, projectRoot, jp);
  const port = parseInt(args.port || '8788', 10);
  let monitorPid = null;
  if (args['no-monitor'] !== true) monitorPid = spawnDetached('lib/llm/monitor.js', ['--job-id', jobId, '--project-root', projectRoot, '--port', String(port), ...(args['no-open'] === true ? ['--no-open'] : [])], projectRoot, jp);
  console.log(`Resumed job ${jobId} | worker pid: ${workerPid}${monitorPid ? ` | monitor http://127.0.0.1:${port}` : ''}`);
  emit({ status: 'resumed', job_id: jobId, worker_pid: workerPid, monitor_pid: monitorPid });
}

function cmdStatus(projectRoot, args) {
  const jobId = args['job-id'];
  if (!jobId) throw new FeedOptimizerError('missing-job-id', 'status requires --job-id.');
  const jp = jobPaths(projectRoot, jobId);
  const stateData = readJsonSafe(jp.state, {});
  const progress = loadProgress(jp);
  console.log(`Job ${jobId}: status=${stateData.status || 'unknown'} ${stateData.completed || progress.completedCount}/${stateData.total || '?'} done, ${stateData.failed || progress.errored.size} failed, cost ${fmtUsd(stateData.running_cost || progress.runningCost)}`);
  emit({ status: 'status', job_id: jobId, state: stateData, completed: progress.completedCount, failed: progress.errored.size, running_cost: progress.runningCost });
}

function cmdAssemble(projectRoot, args) {
  const jobId = args['job-id'];
  if (!jobId) throw new FeedOptimizerError('missing-job-id', 'assemble requires --job-id.');
  const out = assembleOutputs(projectRoot, jobId, {});
  console.log('Feed Optimizer - Content: Outputs assembled');
  for (const f of out.supplementalFiles) console.log(`  Supplemental: ${relative(projectRoot, f)}`);
  console.log(`  Diff (old -> new): ${relative(projectRoot, out.diffFile)}`);
  console.log(`  Exceptions: ${relative(projectRoot, out.exceptionsFile)}`);
  console.log(`  README: ${relative(projectRoot, out.readmeFile)}`);
  console.log(`  Products with content written: ${out.summary.filled_products} / ${out.summary.total_results}`);
  emit({ status: 'assembled', job_id: jobId, ...out.summary, supplemental: out.supplementalFiles.map((f) => relative(projectRoot, f)) });
}

// ---- dispatch ---------------------------------------------------------------------------------
function printError(error) {
  if (error instanceof FeedOptimizerError) {
    console.error(`\nError [${error.label}]: ${error.message}`);
    if (error.details) { const d = Array.isArray(error.details) ? `\n- ${error.details.join('\n- ')}` : error.details; console.error(`Details: ${d}`); }
  } else { console.error(`\nError [unexpected]: ${error.message}`); }
}

try {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const positional = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
  const cmd = positional || args.cmd || 'gate';
  const projectRoot = args['project-root'] || discoverProjectRoot(process.cwd());
  if (cmd === 'gate') cmdGate(projectRoot, args);
  else if (cmd === 'worklist') cmdWorklist(projectRoot, args);
  else if (cmd === 'sample') await cmdSample(projectRoot, args);
  else if (cmd === 'estimate') cmdEstimate(projectRoot, args);
  else if (cmd === 'launch') cmdLaunch(projectRoot, args);
  else if (cmd === 'resume') cmdResume(projectRoot, args);
  else if (cmd === 'status') cmdStatus(projectRoot, args);
  else if (cmd === 'assemble') cmdAssemble(projectRoot, args);
  else throw new FeedOptimizerError('unknown-cmd', `Unknown subcommand "${cmd}". Use: gate, worklist, sample, estimate, launch, resume, status, assemble.`);
} catch (error) {
  printError(error);
  process.exitCode = 1;
}
