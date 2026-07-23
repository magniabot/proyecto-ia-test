// Job lib — durable state for a small-attributes enrichment job. The append-only results.jsonl is
// the source of truth: a crash mid-item loses at most the in-flight item, and resume = "process
// everything not already in results.jsonl" (no double-spend). Decoupled from the monitor (which is
// read-only over these files + the lifecycle control file).

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { writeCsv, FeedOptimizerError } from '../feed-optimizer-core.js';
import { REASONING_EFFORTS } from './cost.js';
import { OWNED } from './spec-small-attributes.js';
import { FEED_NAME as FEED_NAME_CONTENT } from './spec-content.js';

const FEED_NAME_SA = new Map(OWNED.map((a) => [a.key, a.feed_name]));

// The supplemental-feed column name for an owned key depends on the action (the two actions own
// different attribute sets). Default to small-attributes for backward compatibility.
function feedNameMapFor(action) {
  return action === 'content' ? FEED_NAME_CONTENT : FEED_NAME_SA;
}

export function jobPaths(projectRoot, jobId) {
  const dir = resolve(projectRoot, 'created/feed-optimizer/jobs', jobId);
  return {
    dir,
    config: resolve(dir, 'config.json'),
    worklist: resolve(dir, 'worklist.json'),
    results: resolve(dir, 'results.jsonl'),
    errors: resolve(dir, 'errors.jsonl'),
    state: resolve(dir, 'job-state.json'),
    control: resolve(dir, 'control.json'), // monitor -> worker: { command: 'pause'|'resume'|'stop' }
    sample: resolve(dir, 'sample-results.json'),
    sampleCsv: resolve(dir, 'sample-review.csv'),
    outputsDir: resolve(projectRoot, 'created/feed-optimizer/jobs', jobId, 'output'),
  };
}

function ensureDir(path) { mkdirSync(dirname(path), { recursive: true }); }

// Fingerprint of the work itself (which products, which attrs each). Stamped into sample-results
// by `sample`; `estimate` and `launch` recompute it from the current worklist.json and refuse on
// mismatch, so a worklist regenerated with new toggles can't be priced off a stale sample.
export function worklistFingerprint(items) {
  const sig = (items || []).map((it) => `${it.product_id}:${(it.attrs || []).map((a) => a.attr).join(',')}`).sort();
  return createHash('sha256').update(sig.join('\n')).digest('hex').slice(0, 16);
}

export function resolveReasoningEffort(args, fallback) {
  const effort = args['reasoning-effort'] || fallback;
  if (!REASONING_EFFORTS.includes(effort)) {
    throw new FeedOptimizerError('bad-reasoning-effort', `--reasoning-effort must be one of: ${REASONING_EFFORTS.join(', ')} (got "${effort}").`);
  }
  return effort;
}

// Estimate and launch may only price/run what the sample actually measured: same worklist (by
// fingerprint), same model/steering/effort. Anything else means the confirmed number is fiction.
export function loadSampleForPricing(jp, items, args) {
  const sampleData = readJsonSafe(jp.sample);
  if (!sampleData || !Array.isArray(sampleData.results) || sampleData.results.length === 0) {
    throw new FeedOptimizerError('no-sample', 'Run `sample` (then `estimate`) before this step.');
  }
  const fp = worklistFingerprint(items);
  if (sampleData.worklist_fingerprint !== fp) {
    throw new FeedOptimizerError(
      'stale-sample',
      sampleData.worklist_fingerprint
        ? 'worklist.json changed since the sample ran (re-ran worklist with different toggles or data?). Re-run `sample`, then `estimate`.'
        : 'This sample predates the worklist-fingerprint check. Re-run `sample`, then `estimate`.'
    );
  }
  for (const [flag, key] of [['model', 'model'], ['steering', 'steering'], ['reasoning-effort', 'reasoning_effort']]) {
    if (args[flag] != null && String(args[flag]) !== String(sampleData[key] ?? '')) {
      throw new FeedOptimizerError('sample-mismatch', `--${flag} "${args[flag]}" differs from the sampled value "${sampleData[key] ?? ''}". The estimate is only valid for the sampled settings — re-run \`sample\` with --${flag}.`);
    }
  }
  return sampleData;
}

export function writeJsonAtomic(path, obj) {
  ensureDir(path);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
}

export function readJsonSafe(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

export function appendJsonl(path, obj) {
  ensureDir(path);
  appendFileSync(path, `${JSON.stringify(obj)}\n`);
}

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

// Rebuild resume state from results.jsonl + errors.jsonl: which product_ids are done, running cost,
// and per-attribute fill/abstain counts. Errored ids are returned separately so the worker can retry
// them (or skip, per config).
export function loadProgress(paths) {
  const completed = new Set();
  let runningCost = 0;
  let completedCount = 0;
  const fillCounts = {};
  const abstainCounts = {};
  for (const r of readJsonl(paths.results)) {
    if (!r.product_id || completed.has(r.product_id)) continue;
    completed.add(r.product_id);
    completedCount += 1;
    runningCost += r.cost || 0;
    for (const k of Object.keys(r.filled || {})) fillCounts[k] = (fillCounts[k] || 0) + 1;
    for (const ex of r.exceptions || []) abstainCounts[ex.attr] = (abstainCounts[ex.attr] || 0) + 1;
  }
  const errored = new Set();
  for (const e of readJsonl(paths.errors)) if (e.product_id) errored.add(e.product_id);
  return { completed, errored, runningCost, completedCount, fillCounts, abstainCounts };
}

export function writeState(paths, state) {
  writeJsonAtomic(paths.state, { ...state, updated_at: new Date().toISOString() });
}

export function readControl(paths) {
  return readJsonSafe(paths.control, { command: 'run' });
}
export function writeControl(paths, command) {
  writeJsonAtomic(paths.control, { command, at: new Date().toISOString() });
}

// ---- output assembly --------------------------------------------------------------------------

// Assemble importable outputs from results.jsonl: one supplemental CSV per feed_label (id + filled
// attribute columns), a diff (with evidence/confidence), an exceptions file, and a README. Nothing
// is auto-applied — these are import artifacts for Channable / Merchant Center.
export function assembleOutputs(projectRoot, jobId, { generatedAt = new Date().toISOString() } = {}) {
  const paths = jobPaths(projectRoot, jobId);
  const config = readJsonSafe(paths.config, {});
  const FEED_NAME = feedNameMapFor(config.action);
  const results = readJsonl(paths.results);
  const errors = readJsonl(paths.errors);
  mkdirSync(paths.outputsDir, { recursive: true });

  // Group filled results by feed_label.
  const byFeed = new Map();
  const diffRows = [];
  const exceptionRows = [];
  const fillCounts = {};
  const abstainCounts = {};
  let filledProducts = 0;

  for (const r of results) {
    const filledKeys = Object.keys(r.filled || {});
    if (filledKeys.length > 0) {
      filledProducts += 1;
      const feed = r.feed_label || 'global';
      if (!byFeed.has(feed)) byFeed.set(feed, { rows: [], cols: new Set() });
      const bucket = byFeed.get(feed);
      const row = { id: r.product_id };
      for (const k of filledKeys) {
        const col = FEED_NAME.get(k) || k;
        row[col] = r.filled[k];
        bucket.cols.add(col);
        fillCounts[k] = (fillCounts[k] || 0) + 1;
        const cell = (r.cells || {})[k] || {};
        diffRows.push({
          product_id: r.product_id, feed_label: feed, attribute: col,
          old_value: (r.old || {})[k] || '', new_value: r.filled[k],
          confidence: cell.confidence || '', evidence: (cell.evidence || '').slice(0, 300),
        });
      }
      bucket.rows.push(row);
    }
    for (const ex of r.exceptions || []) {
      abstainCounts[ex.attr] = (abstainCounts[ex.attr] || 0) + 1;
      exceptionRows.push({
        product_id: r.product_id, feed_label: r.feed_label || '', attribute: FEED_NAME.get(ex.attr) || ex.attr,
        reason: ex.reason, proposed: ex.proposed || '', confidence: ex.confidence || '',
      });
    }
  }
  for (const e of errors) {
    exceptionRows.push({ product_id: e.product_id, feed_label: '', attribute: '(all)', reason: `call-failed: ${e.reason || ''}`.slice(0, 200), proposed: '', confidence: '' });
  }

  // Write one supplemental CSV per feed_label.
  const supplementalFiles = [];
  for (const [feed, bucket] of byFeed.entries()) {
    const headers = ['id', ...[...bucket.cols].sort()];
    const safeFeed = String(feed).replace(/[^A-Za-z0-9_-]+/g, '-') || 'global';
    const file = resolve(paths.outputsDir, `supplemental-${safeFeed}.csv`);
    writeCsv(file, bucket.rows, headers);
    supplementalFiles.push(file);
  }

  const diffFile = resolve(paths.outputsDir, 'diff.csv');
  const exceptionsFile = resolve(paths.outputsDir, 'exceptions.csv');
  writeCsv(diffFile, diffRows, ['product_id', 'feed_label', 'attribute', 'old_value', 'new_value', 'confidence', 'evidence']);
  writeCsv(exceptionsFile, exceptionRows, ['product_id', 'feed_label', 'attribute', 'reason', 'proposed', 'confidence']);

  const readmeFile = resolve(paths.outputsDir, 'README.md');
  writeFileSync(readmeFile, renderReadme({ config, generatedAt, results, errors, filledProducts, fillCounts, abstainCounts, supplementalFiles, projectRoot }), 'utf8');

  return {
    supplementalFiles, diffFile, exceptionsFile, readmeFile,
    summary: { total_results: results.length, filled_products: filledProducts, errors: errors.length, fillCounts, abstainCounts },
  };
}

function renderReadme({ config, generatedAt, results, errors, filledProducts, fillCounts, abstainCounts, supplementalFiles, projectRoot }) {
  const rel = (p) => p.replace(`${projectRoot}/`, '');
  const isContent = config.action === 'content';
  const fillLines = Object.entries(fillCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- \`${k}\`: ${n} ${isContent ? 'written' : 'filled'}`);
  const abstainLines = Object.entries(abstainCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- \`${k}\`: ${n} abstained / rejected`);
  const whatThis = isContent
    ? 'A **supplemental feed** to import into your feed tool (Channable) or Merchant Center. Each row is a product `id` plus the optimized/added content columns. For `title` and `description` the value **overrides** your existing primary-feed value when imported (a supplemental feed overlays by `id`); the original primary feed is untouched, and you can stop importing to revert. `product_highlight` / `product_detail` are comma-separated multi-value columns (internal commas replaced with `;`). **Nothing was applied automatically** — review `diff.csv` (old → new) and import the CSV yourself.'
    : 'A **supplemental feed** to import into your feed tool (Channable) or Merchant Center. Each row is a product `id` plus the newly-filled attribute columns. Blank/abstained attributes are omitted. **Nothing was applied automatically** — review and import the CSV yourself.';
  return [
    `# ${isContent ? 'Content' : 'Small Attributes'} — ${config.job_id || ''}`,
    '',
    `Generated: ${generatedAt}`,
    `Model: ${config.model || ''} | Mode: ${config.mode || ''}`,
    '',
    '## What this is',
    '',
    whatThis,
    '',
    '## Result summary',
    '',
    `- Products processed: ${results.length}`,
    `- Products with >=1 filled attribute: ${filledProducts}`,
    `- Failed (in exceptions): ${errors.length}`,
    '',
    '### Filled per attribute',
    ...(fillLines.length ? fillLines : ['- (none)']),
    '',
    '### Abstained / rejected per attribute (needs source data or no evidence)',
    ...(abstainLines.length ? abstainLines : ['- (none)']),
    '',
    '## Files',
    ...supplementalFiles.map((f) => `- Supplemental feed: \`${rel(f)}\``),
    '- Diff (with evidence + confidence per cell): `diff.csv`',
    '- Exceptions (abstentions, rejects, failures): `exceptions.csv`',
    '',
    '## How to import',
    '',
    '1. Open the supplemental CSV. The first column `id` matches your product IDs.',
    '2. In Channable (or Merchant Center supplemental feed), map `id` to your product ID and each attribute column to the matching feed field.',
    '3. Import as a **supplemental** feed so it overlays your primary feed without replacing it.',
    '4. Re-run `/feed-auditor` afterward to confirm the gaps closed.',
    '',
  ].join('\n');
}
