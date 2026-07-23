#!/usr/bin/env node

import { existsSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { FeedAuditorError, parseArgs } from './lib/feed-auditor-core.js';
import { ALL_MODULE_IDS, runModuleAnalysis } from './lib/modules/index.js';

function resolveProjectRoot(startDir) {
  let current = resolve(startDir);
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'context/feed/cache'))) {
      return current;
    }
    current = dirname(current);
  }

  throw new FeedAuditorError(
    'client-root-not-found',
    'Could not find PPCOS client root (no context/feed/cache). Run this from a client workspace after pull-data.js.'
  );
}

function printError(error) {
  if (error instanceof FeedAuditorError) {
    console.error(`\nError [${error.label}]: ${error.message}`);
    if (error.details && process.env.FEED_AUDITOR_DEBUG === '1') {
      console.error(`Details: ${error.details}`);
    }
  } else {
    console.error(`\nError [unexpected]: ${error.message}`);
  }
}

// --module accepts a comma list or "full". It is REQUIRED: a full run must be explicit
// (--module=full) — running everything because the flag was forgotten is exactly the silent
// full run the dispatch rules forbid.
function selectedModules(args) {
  const raw = args.module || args.modules || null;
  if (!raw || raw === true) {
    throw new FeedAuditorError(
      'missing-module',
      `analyze.js requires --module. Valid: ${ALL_MODULE_IDS.join(', ')}, or an explicit --module=full to run all scored modules.`
    );
  }
  const ids = String(raw).split(',').map((id) => id.trim()).filter(Boolean);
  const unknown = ids.filter((id) => id !== 'full' && !ALL_MODULE_IDS.includes(id));
  if (unknown.length > 0) {
    throw new FeedAuditorError(
      'unknown-module',
      `Unknown module(s): ${unknown.join(', ')}. Valid: ${ALL_MODULE_IDS.join(', ')}, full.`
    );
  }
  return ids;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = resolveProjectRoot(args['client-root'] || process.cwd());
  const selected = selectedModules(args);
  const { moduleScores, accountHealthResult, combined } = runModuleAnalysis({ projectRoot, selected });

  console.log('\nFeed Auditor - Module Evidence');
  console.log(`Run: ${moduleScores.run} (${moduleScores.modules_run.join(', ')})`);
  console.log(`Account-health gate: ${accountHealthResult.gate} (${accountHealthResult.available}/${accountHealthResult.total} resources available)`);
  if (accountHealthResult.blockers.length > 0) {
    console.log('Account-health blockers:');
    for (const blocker of accountHealthResult.blockers) console.log(`  - ${blocker}`);
  }
  console.log('Per-module mechanical scores:');
  for (const moduleResult of moduleScores.modules) {
    const score = moduleResult.deferred ? 'deferred' : (moduleResult.score === null ? 'n/a' : `${moduleResult.score}/100`);
    console.log(`  - ${moduleResult.label}: ${score} (${moduleResult.band}) | ${moduleResult.findings} finding(s) -> ${moduleResult.queue_file || 'none'}`);
  }
  console.log(`Full combined mechanical score: ${combined === null ? 'n/a' : `${combined}/100`} (explicit full runs only)`);
  console.log(`Scoped mechanical score: ${moduleScores.scoped_score === null ? 'n/a' : `${moduleScores.scoped_score}/100`} (${moduleScores.scoped_band})`);
  console.log(`Module scores: ${relative(projectRoot, resolve(projectRoot, 'context/analysis/feed/module-scores.json'))}`);
  console.log('Final report owner: Claude writes the full, single-module, or partial report path from references and evidence.');
  console.log('\n__RESULTS_JSON__');
  console.log(JSON.stringify({
    run: moduleScores.run,
    modules_run: moduleScores.modules_run,
    account_health_gate: accountHealthResult.gate,
    combined_mechanical_score: combined,
    scoped_mechanical_score: moduleScores.scoped_score,
    module_scores: moduleScores.modules.map((m) => ({ id: m.id, score: m.score, band: m.band, findings: m.findings })),
    final_report_owned_by: 'Claude',
  }));
} catch (error) {
  printError(error);
  process.exitCode = 1;
}
