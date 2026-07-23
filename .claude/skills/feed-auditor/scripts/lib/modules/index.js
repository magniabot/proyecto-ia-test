// Module-layer orchestrator for feed-auditor.
//
// Reuses analyzeFeedAudit (core) to load data + write the evidence summary, then runs the
// selected modules on top: per-module 0-100 score, per-module queue CSV (the downstream
// contract), advisory briefs, the account-health gate, and a combined weighted score
// (Performance excluded from the denominator).

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  analyzeFeedAudit,
  FeedAuditorError,
  loadJson,
  moduleBriefPath,
  moduleQueuePath,
  outputPaths,
  writeCsv,
  writeJson,
} from '../feed-auditor-core.js';
import { MODULE_QUEUE_HEADERS, renderAdvisoryBrief, statusBand } from './shared.js';
import { interpretAccountHealth } from './account-health.js';
import * as errors from './errors.js';
import * as completeness from './completeness.js';
import * as attributes from './attributes.js';
import * as titleDesc from './title-desc.js';
import * as images from './images.js';
import * as performance from './performance.js';

// Scored modules, in cascade order. Performance is registered but deferred (weight 0, no score).
export const SCORED_MODULES = [errors, completeness, attributes, titleDesc, images];
export const ALL_MODULE_IDS = [...SCORED_MODULES.map((m) => m.id), performance.id];

export function resolveSelection(selected) {
  if (!selected || selected.length === 0 || selected.includes('full')) {
    return { ids: SCORED_MODULES.map((m) => m.id), run: 'full', full: true };
  }
  const valid = new Set(ALL_MODULE_IDS);
  const requested = new Set(selected.filter((id) => valid.has(id)));
  const ids = [
    ...SCORED_MODULES.filter((moduleDef) => requested.has(moduleDef.id)).map((moduleDef) => moduleDef.id),
    ...(requested.has(performance.id) ? [performance.id] : []),
  ];
  return { ids, run: ids.length === 1 ? 'single' : 'partial', full: false };
}

function combinedScore(moduleResults) {
  // Weighted average over scored modules that are applicable (score !== null).
  // Renormalises weights so deferred/N-A modules do not drag the score.
  const scored = moduleResults.filter((result) => result.score !== null && result.weight > 0);
  const sumWeights = scored.reduce((sum, result) => sum + result.weight, 0);
  if (sumWeights === 0) return null;
  const weighted = scored.reduce((sum, result) => sum + result.weight * result.score, 0);
  return Math.round(weighted / sumWeights);
}

export function runModuleAnalysis({ projectRoot, selected = null, generatedAt = new Date().toISOString() }) {
  const paths = outputPaths(projectRoot);
  const generatedDate = generatedAt.slice(0, 10);

  // 1. Account-health gate (always). This happens before analyzeFeedAudit because hard
  // account blockers mean no audit happened and no analysis files should be written.
  if (!existsSync(paths.accountHealthJson)) {
    throw new FeedAuditorError(
      'missing-account-health',
      'Account-health cache is missing. Run feed-auditor pull-data.js with --refresh before analysis.'
    );
  }
  const accountHealth = loadJson(paths.accountHealthJson, 'missing-account-health');
  const accountHealthResult = interpretAccountHealth(accountHealth);
  if (accountHealthResult.gate === 'block' || accountHealthResult.available === 0) {
    const blockerText = accountHealthResult.blockers.length > 0
      ? accountHealthResult.blockers.join(' ')
      : 'No account-health resources were available for the mandatory pre-check.';
    throw new FeedAuditorError(
      'account-health-blocked',
      `Account-health pre-check blocked the feed audit. ${blockerText}`
    );
  }

  // 2. Load data + write deterministic evidence summary via the tested core path.
  const audit = analyzeFeedAudit({ projectRoot, generatedAt });
  const products = audit.products;

  // 3. Run the selected modules in cascade order, regardless of user argument order.
  const { ids, run, full } = resolveSelection(selected);
  const byId = Object.fromEntries([...SCORED_MODULES, performance].map((m) => [m.id, m]));
  const ranResults = [];

  for (const moduleId of ids) {
    const moduleDef = byId[moduleId];
    if (!moduleDef) continue;
    const result = moduleDef.build({ audit, products, projectRoot });

    // Per-module queue CSV (always written for a ran module, even if empty, so the contract is stable).
    const queuePath = moduleQueuePath(projectRoot, moduleId);
    writeCsv(queuePath, result.queueRows, MODULE_QUEUE_HEADERS);
    result.queue_file = `context/analysis/feed/${moduleId}-queue.csv`;

    // Advisory brief only when there are source-required / external findings.
    if (result.briefSections && result.briefSections.some((section) => section.rows.length > 0)) {
      const briefPath = moduleBriefPath(projectRoot, moduleId);
      mkdirSync(dirname(briefPath), { recursive: true });
      writeFileSync(briefPath, renderAdvisoryBrief(result.label, generatedDate, result.briefSections), 'utf8');
      result.brief_file = `context/analysis/feed/${moduleId}-advisory-brief.md`;
    }

    ranResults.push(result);
  }

  // 4. Combined score (scored modules that ran).
  const scoredRan = ranResults.filter((result) => result.weight > 0);
  const scopedScore = combinedScore(scoredRan);
  const combined = full ? scopedScore : null;

  // 5. module-scores.json (mechanical inputs; Claude finalises bands/SKIP per scoring-model.md).
  const moduleScores = {
    generated_at: generatedAt,
    run,
    modules_run: ids,
    account_health: accountHealthResult,
    combined_score: combined,
    combined_band: statusBand(combined),
    scoped_score: scopedScore,
    scoped_band: statusBand(scopedScore),
    weights: Object.fromEntries(SCORED_MODULES.map((m) => [m.id, m.weight])),
    performance_status: 'deferred-excluded-from-combined',
    modules: ranResults.map((result) => ({
      id: result.id,
      label: result.label,
      weight: result.weight,
      deferred: Boolean(result.deferred),
      applicable: result.applicable,
      score: result.score,
      band: statusBand(result.score),
      eligible: result.eligible,
      affected: result.affected,
      findings: result.findings,
      findings_by_tier: result.findings_by_tier || undefined,
      upside_summary: result.upside_summary || undefined,
      queue_file: result.queue_file || null,
      brief_file: result.brief_file || null,
      notes: result.notes || '',
      business_profile: result.business_profile || undefined,
      attribute_coverage: result.attribute_coverage || undefined,
      performance_label_overview: result.performance_label_overview || undefined,
    })),
  };
  // Surface the detected business profile at the top level so any consumer (Claude's Phase 4.2,
  // the attributes flow) reads the SAME vertical/classification instead of recomputing it.
  const profileSource = ranResults.find((result) => result.business_profile);
  if (profileSource) moduleScores.business_profile = profileSource.business_profile;
  writeJson(paths.moduleScoresJson, moduleScores);

  return { moduleScores, accountHealthResult, ranResults, combined, full, paths };
}
