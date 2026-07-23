#!/usr/bin/env node
// Detached worker for a small-attributes job. Walks the remaining worklist (everything not already
// in results.jsonl), calls the LLM with a concurrency cap, validates each result, and appends to
// results.jsonl / errors.jsonl. Writes a job-state.json heartbeat after every item. Honors
// control.json (pause/resume/stop) and an optional max_cost ceiling. Survives the Claude session and
// the monitor — it is a plain detached node process.
//
//   node run-job.js --job-id <id> --project-root <path> [--resume] [--mock]

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from '../feed-optimizer-core.js';
import { jobPaths, readJsonSafe, appendJsonl, writeState, loadProgress, readControl, assembleOutputs } from './job.js';
import { getApiKey } from './openai-client.js';
import { costOf } from './cost.js';

// Per-action adapter: small-attributes (extract enums) and content (author prose) share this worker,
// job lifecycle, monitor, and cost model — only the LLM call + validator differ. Default is
// small-attributes so existing jobs are byte-for-byte unchanged.
async function loadActionAdapter(action, { projectRoot, floor, voice }) {
  if (action === 'content') {
    const client = await import('./openai-client-content.js');
    const v = await import('./validate-content.js');
    const core = await import('../../../../feed-auditor/scripts/lib/feed-auditor-core.js');
    const overrides = core.loadLexiconOverrides(projectRoot);
    return {
      callItem: (item, base) => client.callItem(item, { ...base, voice }),
      validate: (out, item) => v.validateProduct(out.proposed, item, floor, overrides),
    };
  }
  const client = await import('./openai-client.js');
  const v = await import('./validate.js');
  return {
    callItem: client.callItem,
    validate: (out, item) => v.validateProduct(
      Object.fromEntries(Object.entries(out.proposed).map(([k, val]) => [k, { value: val.value, confidence: val.confidence }])),
      item.attrs.map((a) => a.attr), floor,
    ),
  };
}

function discoverProjectRoot(start) {
  let cur = resolve(start);
  while (cur !== dirname(cur)) {
    if (existsSync(resolve(cur, 'context/feed/cache')) || existsSync(resolve(cur, 'config'))) return cur;
    cur = dirname(cur);
  }
  return resolve(start);
}

async function runPool(items, concurrency, worker, shouldStop) {
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      if (shouldStop()) return;
      const i = idx++;
      await worker(items[i], i);
    }
  }
  const lanes = [];
  for (let k = 0; k < Math.min(concurrency, items.length); k++) lanes.push(next());
  await Promise.all(lanes);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobId = args['job-id'] || args.jobId;
  if (!jobId) throw new Error('--job-id is required');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = args['project-root'] || discoverProjectRoot(process.env.PWD || __dirname);
  const paths = jobPaths(projectRoot, jobId);

  const config = readJsonSafe(paths.config);
  if (!config) throw new Error(`Missing config.json for job ${jobId}`);
  const worklist = readJsonSafe(paths.worklist, []);
  const mock = args.mock === true || config.mock === true || process.env.FEED_OPTIMIZER_MOCK_LLM === '1';
  const model = config.model || 'gpt-4o-mini';
  const concurrency = Math.max(1, Math.min(50, config.concurrency || 20));
  const steering = config.steering || '';
  const floor = config.confidence_floor || 'low';
  const maxCost = Number.isFinite(config.max_cost) ? config.max_cost : null;
  const retryErrored = config.retry_errored !== false;
  const imageDetail = config.image_detail || 'auto';
  const pricingOverrides = config.pricing || {};
  const action = config.action || 'small-attributes';
  const reasoningEffort = config.reasoning_effort || (action === 'content' ? 'low' : 'none');
  const adapter = await loadActionAdapter(action, { projectRoot, floor, voice: config.voice || '' });

  const apiKey = mock ? null : getApiKey(projectRoot);
  if (!mock && !apiKey) {
    writeState(paths, { job_id: jobId, status: 'failed', error: 'OPENAI_API_KEY not set in config/.env', pid: process.pid });
    throw new Error('OPENAI_API_KEY not set in config/.env');
  }

  // Resume: skip everything already in results.jsonl. Optionally retry previously-errored ids.
  const progress = loadProgress(paths);
  const remaining = worklist.filter((it) => {
    if (progress.completed.has(it.product_id)) return false;
    if (!retryErrored && progress.errored.has(it.product_id)) return false;
    return true;
  });

  let runningCost = progress.runningCost;
  let completed = progress.completedCount;
  let failed = progress.errored.size;
  let stopping = false;
  let stopReason = null;
  let stopNote = null;
  let inFlight = 0;

  // Pre-dispatch cost ceiling: at concurrency N, checking only after completion lets ~N in-flight
  // calls blow past max_cost. Project runningCost + in-flight spend before starting each item and
  // stop dispatching once the ceiling is reachable; in-flight calls still finish and are recorded.
  const perItemEstimate = () => (completed > 0 ? runningCost / completed : (config.per_item_estimate || 0));
  const ceilingReachable = () => maxCost != null && runningCost + (inFlight + 1) * perItemEstimate() > maxCost;

  const state = () => ({
    job_id: jobId, action, status: stopping ? (stopReason || 'paused') : 'running',
    model, total: worklist.length, completed, failed,
    remaining: worklist.length - completed, running_cost: runningCost,
    projected_total: completed > 0 ? (runningCost / completed) * worklist.length : config.projected_cost || 0,
    max_cost: maxCost, started_at: config.started_at || new Date().toISOString(), pid: process.pid,
  });
  writeState(paths, state());

  let sinceHeartbeat = 0;
  const worker = async (item) => {
    item._imageDetail = imageDetail;
    let attempts = 0;
    inFlight += 1;
    try {
      attempts += 1;
      const out = await adapter.callItem(item, { model, apiKey, steering, reasoningEffort, mock, maxRetries: config.max_retries ?? 4 });
      const { filled, exceptions } = adapter.validate(out, item);
      const cost = costOf(out.usage, model, pricingOverrides);
      runningCost += cost;
      completed += 1;
      appendJsonl(paths.results, {
        product_id: item.product_id, feed_label: item.feed_label, target_country: item.target_country,
        language: item.language, filled, exceptions, cells: out.proposed,
        old: item.old || Object.fromEntries(item.attrs.map((a) => [a.attr, ''])),
        usage: out.usage, cost, attempts, image_used: Boolean(item.image_link), mocked: Boolean(out.mocked),
      });
    } catch (err) {
      failed += 1;
      appendJsonl(paths.errors, { product_id: item.product_id, reason: String(err.message || err).slice(0, 300), attempts, ts: new Date().toISOString() });
    }
    inFlight -= 1;
    // Heartbeat + lifecycle/cost checks between items.
    if (++sinceHeartbeat >= 1) { writeState(paths, state()); sinceHeartbeat = 0; }
    const control = readControl(paths);
    if (control.command === 'pause' || control.command === 'stop') { stopping = true; stopReason = 'paused'; }
    if (maxCost != null && runningCost >= maxCost) { stopping = true; stopReason = 'paused'; stopNote = `max_cost ${maxCost} reached`; }
  };

  await runPool(remaining, concurrency, worker, () => {
    if (stopping) return true;
    if (ceilingReachable()) {
      stopping = true;
      stopReason = 'paused';
      stopNote = `max_cost ${maxCost} reachable with in-flight calls — stopped dispatching`;
      return true;
    }
    return false;
  });

  if (stopping) {
    writeState(paths, { ...state(), status: 'paused', ...(stopNote ? { note: stopNote } : {}) });
    console.log(`[run-job] paused: ${stopReason}${stopNote ? ` (${stopNote})` : ''}. completed=${completed} cost=${runningCost.toFixed(4)}`);
    return;
  }

  // Done — assemble importable outputs.
  const assembled = assembleOutputs(projectRoot, jobId, {});
  writeState(paths, { ...state(), status: 'completed', completed, outputs: assembled.summary });
  console.log(`[run-job] completed. products=${completed} filled_products=${assembled.summary.filled_products} cost=${runningCost.toFixed(4)}`);
}

main().catch((err) => { console.error(`[run-job] fatal: ${err.message}`); process.exitCode = 1; });
