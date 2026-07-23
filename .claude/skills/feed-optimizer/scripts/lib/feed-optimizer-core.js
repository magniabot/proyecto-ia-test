import { existsSync, readFileSync, statSync } from 'fs';
import { relative, resolve } from 'path';
import {
  parseArgs,
  parseDotenv,
  readCsv,
  writeCsv,
  writeJson,
} from '../../../feed-auditor/scripts/lib/feed-auditor-core.js';

export { parseArgs, parseDotenv, readCsv, writeCsv, writeJson };

export class FeedOptimizerError extends Error {
  constructor(label, message, details = null) {
    super(message);
    this.name = 'FeedOptimizerError';
    this.label = label;
    this.details = details;
  }
}

// ---- feed-auditor contract ---------------------------------------------------------------------
// The redesigned feed-auditor emits per-module outputs, not a combined queue. The optimizer's
// worklist is always the full normalized merchant cache; module-scores.json is the proof that a
// fresh audit actually ran. The per-module queues and the run report (named per run type) are
// fixability-aware extras, used when present but never required. This file/column surface is the
// internal contract between the two skills — see docs/adr/0001-feed-auditor-optimizer-runtime-coupling.md.

// Hard requirement, relative to context/analysis/feed/. Proves analyze.js produced a fresh audit.
export const REQUIRED_AUDIT_EVIDENCE_FILENAMES = [
  'module-scores.json',
];

// Per-module queues from the redesigned auditor (carry fixability_class + recommended_downstream).
// Optional: freshness-checked when present, consumed for tag enrichment by the small-attributes worklist.
export const OPTIONAL_MODULE_FILENAMES = [
  'errors-queue.csv',
  'completeness-queue.csv',
  'attributes-queue.csv',
  'title-desc-queue.csv',
  'images-queue.csv',
];

// Claude-authored run report, named by run type. Lives in context/analysis/ (not .../feed/).
// Optional: freshness-checked when present, never required (a scoped run produces only its variant).
export const REPORT_VARIANT_FILENAMES = [
  'feed-audit.md',
  'feed-partial-audit.md',
  'feed-errors-audit.md',
  'feed-completeness-audit.md',
  'feed-attributes-audit.md',
  'feed-title-desc-audit.md',
  'feed-images-audit.md',
];

export function outputPaths(projectRoot) {
  const analysisRoot = resolve(projectRoot, 'context/analysis');
  const analysisDir = resolve(analysisRoot, 'feed');
  const createdDir = resolve(projectRoot, 'created/feed-optimizer');
  return {
    cacheDir: resolve(projectRoot, 'context/feed/cache'),
    analysisDir,
    createdDir,
    moduleScoresJson: resolve(analysisDir, 'module-scores.json'),
    moduleQueueCsv: (moduleId) => resolve(analysisDir, `${moduleId}-queue.csv`),
    merchantCacheJson: resolve(projectRoot, 'context/feed/cache/merchant-products-normalized.json'),
    performanceCsv: resolve(projectRoot, 'context/feed/cache/google-ads-shopping-performance.csv'),
    requiredEvidenceFiles: REQUIRED_AUDIT_EVIDENCE_FILENAMES.map((file) => resolve(analysisDir, file)),
    optionalModuleFiles: OPTIONAL_MODULE_FILENAMES.map((file) => resolve(analysisDir, file)),
    reportVariantFiles: REPORT_VARIANT_FILENAMES.map((file) => resolve(analysisRoot, file)),
    planningJobDir: (jobId) => resolve(createdDir, 'jobs', jobId),
    createdJobDir: (jobId) => resolve(createdDir, 'jobs', jobId, 'output'),
  };
}

export function loadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new FeedOptimizerError(label, `Could not read valid JSON at ${path}.`, error.message);
  }
}

export function checkFreshAuditPrerequisites({ projectRoot, now = new Date(), maxAgeHours = 24 } = {}) {
  const paths = outputPaths(projectRoot);

  // Required spine: the worklist (merchant cache) + proof a fresh audit ran (module-scores.json).
  const required = [
    paths.merchantCacheJson,
    ...paths.requiredEvidenceFiles,
  ];
  const missing = Array.from(new Set(required)).filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new FeedOptimizerError(
      'missing-fresh-feed-audit',
      'feed-optimizer requires a fresh /feed-auditor run: the normalized merchant cache and module-scores.json. Run /feed-auditor first.',
      missing.map((path) => relative(projectRoot, path))
    );
  }

  // Optional fixability-aware inputs (per-module queues) and the run report variant. Present-only
  // and freshness-checked; a scoped single-module audit passes the gate without the others.
  const presentOptional = [...paths.optionalModuleFiles, ...paths.reportVariantFiles]
    .filter((path) => existsSync(path));

  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const stale = Array.from(new Set([...required, ...presentOptional]))
    .filter((path) => (now.getTime() - statSync(path).mtimeMs) > maxAgeMs);
  if (stale.length > 0) {
    throw new FeedOptimizerError(
      'stale-feed-audit',
      `feed-optimizer requires feed-auditor evidence no older than ${maxAgeHours} hours. Run /feed-auditor first.`,
      stale.map((path) => relative(projectRoot, path))
    );
  }

  return {
    status: 'fresh',
    checked_at: now.toISOString(),
    max_age_hours: maxAgeHours,
    required_files: required.map((path) => relative(projectRoot, path)),
    module_files: presentOptional.map((path) => relative(projectRoot, path)),
  };
}
