#!/usr/bin/env node

import { existsSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import {
  FeedOptimizerError,
  outputPaths,
  loadJson,
  parseArgs,
  writeJson,
  writeCsv,
  checkFreshAuditPrerequisites,
} from './lib/feed-optimizer-core.js';
import {
  clusterProducts,
  detectFeedLanguages,
  extractHighFrequencyTerms,
} from './lib/product-type-taxonomy.js';
import {
  fetchAndCacheTaxonomy,
  parseTaxonomy,
  searchTaxonomy,
  clusterForTaxonomy,
  gpcDistributionSummary,
} from './lib/taxonomy.js';
import {
  loadDecisionFile,
  applyProductTypeMapping,
  applyTaxonomyMapping,
  applyCustomLabelSpec,
  finalizeProductType,
  finalizeTaxonomy,
  finalizeCustomLabel,
} from './lib/apply-mapping.js';

function resolveProjectRoot(startDir) {
  let current = resolve(startDir);
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'context/analysis/feed'))) return current;
    current = dirname(current);
  }
  throw new FeedOptimizerError(
    'client-root-not-found',
    'Could not find PPCOS client root (no context/analysis/feed). Run from a client workspace after /feed-auditor.'
  );
}

function printError(error) {
  if (error instanceof FeedOptimizerError) {
    console.error(`\nError [${error.label}]: ${error.message}`);
    if (error.details) {
      const details = Array.isArray(error.details) ? error.details.join('\n- ') : error.details;
      console.error(`Details: ${Array.isArray(error.details) ? `\n- ${details}` : details}`);
    }
  } else {
    console.error(`\nError [unexpected]: ${error.message}`);
  }
}

// Phase 0 gate for the deterministic actions (product-type, taxonomy, custom-label) — same strict
// freshness check as the LLM actions' `gate`, minus the OPENAI_API_KEY (no LLM calls here).
function handleGate(args, projectRoot) {
  const freshness = checkFreshAuditPrerequisites({ projectRoot, maxAgeHours: parseInt(args['max-age-hours'] || '24', 10) });
  console.log('Phase 0 gate: PASS');
  console.log(`  fresh feed-auditor evidence: ok (<=${freshness.max_age_hours}h)`);
  console.log('  merchant cache: ok');
  console.log('\n__RESULTS_JSON__');
  console.log(JSON.stringify({ status: 'gate_pass', freshness: { max_age_hours: freshness.max_age_hours } }));
}

// Shared reporting for the apply phases: stats, warnings, and a small changed-row sample so Claude
// reviews a representative slice instead of transcribing every row.
function printApplySummary(result, sampleFields) {
  const s = result.summary;
  console.log(`Total: ${s.total_products} | Mapped: ${s.mapped} | Changed: ${s.changed} | Unchanged: ${s.unchanged} | Exceptions: ${s.exceptions}`);
  for (const w of result.warnings || []) console.log(`  ⚠ ${w}`);
  const sample = result.rows.filter((r) => r.changed === 'true').slice(0, 20);
  if (sample.length > 0) {
    console.log(`\nDiff sample (${sample.length} of ${s.changed} changed rows):`);
    for (const r of sample) {
      console.log(`  ${r.product_id}: ${sampleFields.map((f) => r[f]).join(' | ')}`);
    }
  }
  if (result.exceptions.length > 0) {
    console.log(`\nException sample (${Math.min(result.exceptions.length, 10)} of ${result.exceptions.length}):`);
    for (const e of result.exceptions.slice(0, 10)) {
      console.log(`  ${e.product_id}: ${e.reason}${e.cluster_name ? ` (cluster: ${e.cluster_name})` : ''} — ${(e.title || '').slice(0, 50)}`);
    }
  }
}

function handleProductTypePhase(args, projectRoot) {
  const phase = args.phase || 'detect-languages';
  const language = args.language || null;
  const jobId = args['job-id'] || args.jobId || null;
  const paths = outputPaths(projectRoot);
  const products = loadJson(paths.merchantCacheJson, 'invalid-merchant-cache');

  if (phase === 'detect-languages') {
    const result = detectFeedLanguages(products);
    console.log('\nFeed Optimizer - Product Type: Language Detection');
    console.log(`Total products: ${result.totalProducts}`);
    for (const lang of result.languages) {
      console.log(`  ${lang.language}: ${lang.count} products (${lang.pct}%)`);
    }
    console.log(`\nSuggested primary language: ${result.primary}`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify(result));
    return;
  }

  if (phase === 'extract-terms') {
    if (!language) throw new FeedOptimizerError('missing-language', 'The --language flag is required for extract-terms phase.');
    const terms = extractHighFrequencyTerms(products, language);
    console.log(`\nFeed Optimizer - Product Type: High-Frequency Terms (${language})`);
    console.log(`Top ${terms.length} terms:`);
    for (const t of terms) {
      console.log(`  ${t.term.padEnd(30)} ${String(t.count).padStart(5)} products (${t.pct}%)`);
    }
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({ language, terms }));
    return;
  }

  if (phase === 'cluster') {
    if (!language) throw new FeedOptimizerError('missing-language', 'The --language flag is required for cluster phase.');
    const resolvedJobId = jobId || `product-type-${new Date().toISOString().slice(0, 10)}`;
    const planningDir = paths.planningJobDir(resolvedJobId);

    const result = clusterProducts(products, language);
    const outputPath = resolve(planningDir, `cluster-summary-${language}.json`);
    writeJson(outputPath, result);

    console.log(`\nFeed Optimizer - Product Type: Cluster Analysis (${language})`);
    console.log(`Total: ${result.totalProducts} | With type: ${result.typedProducts} | Blank: ${result.blankProducts}`);
    console.log(`Clusters: ${result.clusterCount} | Stop words: ${result.stopWordsSource}`);
    console.log(`\nCluster summary:`);
    for (const c of result.clusters) {
      if (c.totalCount === 0) continue;
      const badge = c.source === 'existing_taxonomy' ? 'TAX' : 'KW ';
      const deepPaths = c.topPaths.filter(p => p.depth > 3);
      const depthFlag = deepPaths.length > 0 ? ` [⚠ ${deepPaths.length} paths >3 levels]` : '';
      console.log(`  [${badge}] #${String(c.id).padStart(2)} ${c.name.padEnd(35).substring(0, 35)} [${c.typedCount}+${c.blankCount}=${c.totalCount}]${depthFlag}`);
    }
    console.log(`\nCluster detail: ${relative(projectRoot, outputPath)}`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({
      status: 'clusters_ready',
      job_id: resolvedJobId,
      language,
      cluster_summary: relative(projectRoot, outputPath),
      cluster_count: result.clusterCount,
      total_products: result.totalProducts,
      typed_products: result.typedProducts,
      blank_products: result.blankProducts,
      stop_words_source: result.stopWordsSource,
    }));
    return;
  }

  if (phase === 'apply-mapping') {
    if (!language) throw new FeedOptimizerError('missing-language', 'The --language flag is required for apply-mapping phase.');
    if (!jobId) throw new FeedOptimizerError('missing-job-id', 'The --job-id flag is required for apply-mapping (use the job_id from the cluster phase).');
    const planningDir = paths.planningJobDir(jobId);
    const summaryPath = resolve(planningDir, `cluster-summary-${language}.json`);
    if (!existsSync(summaryPath)) {
      throw new FeedOptimizerError('missing-cluster-summary', `No cluster summary at ${relative(projectRoot, summaryPath)} — run --phase=cluster for this language first.`);
    }
    const clusterSummary = loadJson(summaryPath, 'invalid-cluster-summary');
    const decisionPath = resolve(planningDir, `cluster-assignments-${language}.json`);
    const decision = loadDecisionFile(decisionPath, 'cluster-assignments');
    const langProducts = products.filter(p => (p.language || '').toLowerCase() === language);

    const result = applyProductTypeMapping({ products: langProducts, clusterSummary, decision, decisionPath });
    const mappingPath = resolve(planningDir, `mapping-table-${language}.csv`);
    writeCsv(mappingPath, result.rows, ['product_id', 'feed_label', 'target_country', 'language', 'title', 'old_product_type', 'new_product_type', 'cluster_name', 'changed']);
    const exceptionsPath = resolve(planningDir, `exceptions-${language}.csv`);
    writeCsv(exceptionsPath, result.exceptions, ['product_id', 'title', 'language', 'cluster_name', 'reason']);

    console.log(`\nFeed Optimizer - Product Type: Apply Mapping (${language})`);
    printApplySummary(result, ['old_product_type', 'new_product_type']);
    console.log(`\nMapping table: ${relative(projectRoot, mappingPath)}`);
    console.log(`Exceptions: ${relative(projectRoot, exceptionsPath)}`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({
      status: 'mapping_ready',
      job_id: jobId,
      language,
      mapping_table: relative(projectRoot, mappingPath),
      exceptions_csv: relative(projectRoot, exceptionsPath),
      ...result.summary,
      warnings: result.warnings,
    }));
    return;
  }

  if (phase === 'finalize') {
    if (!jobId) throw new FeedOptimizerError('missing-job-id', 'The --job-id flag is required for finalize.');
    const out = finalizeProductType({ paths, jobId });
    console.log('\nFeed Optimizer - Product Type: Finalize');
    console.log(`Mapped: ${out.summary.mapped} | Changed: ${out.summary.changed} | Exceptions: ${out.summary.exceptions}`);
    for (const f of out.importFiles) console.log(`  Import: ${relative(projectRoot, resolve(out.finalDir, f))}`);
    console.log(`  Final dir: ${relative(projectRoot, out.finalDir)} (diff.csv, exceptions.csv, README.md)`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({ status: 'finalized', job_id: jobId, final_dir: relative(projectRoot, out.finalDir), import_files: out.importFiles, ...out.summary }));
    return;
  }

  throw new FeedOptimizerError('unknown-phase', `Unknown product-type phase: "${phase}". Supported: detect-languages, extract-terms, cluster, apply-mapping, finalize.`);
}

async function handleTaxonomyPhase(args, projectRoot) {
  const phase = args.phase || 'fetch-taxonomy';
  const jobId = args['job-id'] || args.jobId || null;
  const paths = outputPaths(projectRoot);

  if (phase === 'fetch-taxonomy') {
    const force = args.force === true;
    const result = await fetchAndCacheTaxonomy({ force });
    console.log('\nFeed Optimizer - Taxonomy: Fetch Google Taxonomy');
    console.log(`Status: ${result.status}`);
    console.log(`Categories: ${result.categories}`);
    console.log(`Cache: ${result.path}`);
    if (result.age_days !== undefined) console.log(`Cache age: ${result.age_days} days (max ${result.max_age_days})`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify(result));
    return;
  }

  if (phase === 'gpc-distribution') {
    const products = loadJson(paths.merchantCacheJson, 'invalid-merchant-cache');
    const taxonomyResult = await fetchAndCacheTaxonomy();
    const taxonomyData = parseTaxonomy(taxonomyResult.path);
    const distribution = gpcDistributionSummary(products, taxonomyData);
    const withProductType = products.filter(p => (p.product_type || '').trim()).length;
    const ptCoverage = Math.round(withProductType / products.length * 100);

    console.log('\nFeed Optimizer - Taxonomy: GPC Distribution');
    console.log(`Total products: ${products.length}`);
    console.log(`Product type coverage: ${withProductType}/${products.length} (${ptCoverage}%)`);
    console.log(`Unique GPC values: ${distribution.length}`);
    console.log('\nCurrent GPC distribution:');
    for (const entry of distribution) {
      console.log(`  ${entry.id.padEnd(10)} ${entry.path.padEnd(60).substring(0, 60)} ${String(entry.count).padStart(6)} (${entry.pct}%)`);
    }
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({
      total_products: products.length,
      product_type_coverage: ptCoverage,
      with_product_type: withProductType,
      unique_gpc_values: distribution.length,
      distribution,
    }));
    return;
  }

  if (phase === 'cluster') {
    const products = loadJson(paths.merchantCacheJson, 'invalid-merchant-cache');
    const taxonomyResult = await fetchAndCacheTaxonomy();
    const taxonomyData = parseTaxonomy(taxonomyResult.path);
    const resolvedJobId = jobId || `taxonomy-${new Date().toISOString().slice(0, 10)}`;
    const planningDir = paths.planningJobDir(resolvedJobId);

    const result = clusterForTaxonomy(products, taxonomyData);
    const outputPath = resolve(planningDir, 'cluster-summary.json');
    writeJson(outputPath, result);

    console.log('\nFeed Optimizer - Taxonomy: Cluster Analysis');
    console.log(`Total: ${result.totalProducts} | With product_type: ${result.withProductType} | Without: ${result.withoutProductType}`);
    console.log(`Unique current GPC values: ${result.uniqueCurrentGpcValues}`);
    console.log(`Clusters: ${result.clusterCount}`);
    console.log('\nCluster summary:');
    for (const c of result.clusters) {
      const srcBadge = c.source === 'product_type' ? 'PT ' : c.source === 'current_gpc' ? 'GPC' : c.source === 'title_keyword' ? 'KW ' : 'UNC';
      const gpcSummary = c.currentGpcDistribution.length > 0
        ? c.currentGpcDistribution.slice(0, 2).map(g => `${g.id}(${g.count})`).join(', ')
        : 'no GPC';
      console.log(`  [${srcBadge}] #${String(c.id).padStart(2)} ${c.name.padEnd(40).substring(0, 40)} [${c.productCount} products] GPC: ${gpcSummary}`);
    }
    console.log(`\nCluster detail: ${relative(projectRoot, outputPath)}`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({
      status: 'clusters_ready',
      job_id: resolvedJobId,
      cluster_summary: relative(projectRoot, outputPath),
      cluster_count: result.clusterCount,
      total_products: result.totalProducts,
      with_product_type: result.withProductType,
      without_product_type: result.withoutProductType,
      unique_current_gpc: result.uniqueCurrentGpcValues,
    }));
    return;
  }

  if (phase === 'search-taxonomy') {
    const keywords = args.keywords || args._ || '';
    if (!keywords) throw new FeedOptimizerError('missing-keywords', 'The --keywords flag is required for search-taxonomy phase.');
    const topN = parseInt(args['top-n'] || args.topN || '10', 10);
    const taxonomyResult = await fetchAndCacheTaxonomy();
    const taxonomyData = parseTaxonomy(taxonomyResult.path);
    const results = searchTaxonomy(taxonomyData, keywords, topN);

    console.log(`\nFeed Optimizer - Taxonomy: Search (keywords: "${keywords}")`);
    console.log(`Results: ${results.length}`);
    for (const r of results) {
      console.log(`  [${r.id.padEnd(8)}] ${r.path} (depth: ${r.depth}, score: ${r.score})`);
    }
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({ keywords, results }));
    return;
  }

  if (phase === 'apply-mapping') {
    if (!jobId) throw new FeedOptimizerError('missing-job-id', 'The --job-id flag is required for apply-mapping (use the job_id from the cluster phase).');
    const products = loadJson(paths.merchantCacheJson, 'invalid-merchant-cache');
    const taxonomyResult = await fetchAndCacheTaxonomy();
    const taxonomyData = parseTaxonomy(taxonomyResult.path);
    const planningDir = paths.planningJobDir(jobId);
    const summaryPath = resolve(planningDir, 'cluster-summary.json');
    if (!existsSync(summaryPath)) {
      throw new FeedOptimizerError('missing-cluster-summary', `No cluster summary at ${relative(projectRoot, summaryPath)} — run --phase=cluster first.`);
    }
    const clusterSummary = loadJson(summaryPath, 'invalid-cluster-summary');
    const decisionPath = resolve(planningDir, 'cluster-assignments.json');
    const decision = loadDecisionFile(decisionPath, 'cluster-assignments');

    const result = applyTaxonomyMapping({ products, clusterSummary, decision, decisionPath, taxonomyData });
    const mappingPath = resolve(planningDir, 'mapping-table.csv');
    writeCsv(mappingPath, result.rows, ['product_id', 'title', 'feed_label', 'target_country', 'old_gpc_id', 'old_gpc_path', 'new_gpc_id', 'new_gpc_path', 'cluster_name', 'changed']);
    const exceptionsPath = resolve(planningDir, 'exceptions.csv');
    writeCsv(exceptionsPath, result.exceptions, ['product_id', 'title', 'cluster_name', 'reason']);

    console.log('\nFeed Optimizer - Taxonomy: Apply Mapping');
    printApplySummary(result, ['old_gpc_path', 'new_gpc_path']);
    console.log(`\nMapping table: ${relative(projectRoot, mappingPath)}`);
    console.log(`Exceptions: ${relative(projectRoot, exceptionsPath)}`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({
      status: 'mapping_ready',
      job_id: jobId,
      mapping_table: relative(projectRoot, mappingPath),
      exceptions_csv: relative(projectRoot, exceptionsPath),
      ...result.summary,
    }));
    return;
  }

  if (phase === 'finalize') {
    if (!jobId) throw new FeedOptimizerError('missing-job-id', 'The --job-id flag is required for finalize.');
    const out = finalizeTaxonomy({ paths, jobId });
    console.log('\nFeed Optimizer - Taxonomy: Finalize');
    console.log(`Mapped: ${out.summary.mapped} | Changed: ${out.summary.changed} | Exceptions: ${out.summary.exceptions}`);
    for (const f of out.importFiles) console.log(`  Import: ${relative(projectRoot, resolve(out.finalDir, f))}`);
    console.log(`  Final dir: ${relative(projectRoot, out.finalDir)} (diff.csv, exceptions.csv, README.md)`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({ status: 'finalized', job_id: jobId, final_dir: relative(projectRoot, out.finalDir), import_files: out.importFiles, ...out.summary }));
    return;
  }

  throw new FeedOptimizerError('unknown-phase', `Unknown taxonomy phase: "${phase}". Supported: fetch-taxonomy, gpc-distribution, cluster, search-taxonomy, apply-mapping, finalize.`);
}

// custom-label has no clustering: Claude authors a per-slot label spec (rule + overrides) at
// jobs/{job_id}/label-spec-cl{N}.json and this expands it to the per-product mapping table.
function handleCustomLabelPhase(args, projectRoot) {
  const phase = args.phase;
  const jobId = args['job-id'] || args.jobId || null;
  const paths = outputPaths(projectRoot);

  if (phase === 'apply-labels') {
    if (!jobId) throw new FeedOptimizerError('missing-job-id', 'The --job-id flag is required for apply-labels.');
    const slotArg = String(args.slot ?? '');
    const slotNum = slotArg.match(/^(?:custom_label_)?([0-4])$/)?.[1];
    if (!slotNum) throw new FeedOptimizerError('missing-slot', 'apply-labels requires --slot 0..4 (or custom_label_N), matching the label spec being applied.');
    const planningDir = paths.planningJobDir(jobId);
    const specPath = args.spec ? resolve(projectRoot, args.spec) : resolve(planningDir, `label-spec-cl${slotNum}.json`);
    if (!existsSync(specPath)) {
      throw new FeedOptimizerError('missing-label-spec', `No label spec at ${relative(projectRoot, specPath)}. Author it per reference/custom-label/custom-label-flow.md (CL-3), then re-run.`);
    }
    const spec = loadJson(specPath, 'invalid-label-spec');
    const products = loadJson(paths.merchantCacheJson, 'invalid-merchant-cache');

    const result = applyCustomLabelSpec({ products, spec, specPath, projectRoot, performanceCsvPath: paths.performanceCsv });
    const mappingPath = resolve(planningDir, `mapping-table-cl${slotNum}.csv`);
    writeCsv(mappingPath, result.rows, ['product_id', 'title', 'feed_label', 'target_country', 'slot', 'old_value', 'new_value', 'changed']);
    const exceptionsPath = resolve(planningDir, `exceptions-cl${slotNum}.csv`);
    writeCsv(exceptionsPath, result.exceptions, ['product_id', 'title', 'slot', 'reason']);

    console.log(`\nFeed Optimizer - Custom Label: Apply Labels (${spec.slot})`);
    printApplySummary(result, ['old_value', 'new_value']);
    console.log('\nValue distribution:');
    for (const d of result.distribution) console.log(`  ${d.value.padEnd(30)} ${d.count}`);
    console.log(`\nMapping table: ${relative(projectRoot, mappingPath)}`);
    console.log(`Exceptions: ${relative(projectRoot, exceptionsPath)}`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({
      status: 'mapping_ready',
      job_id: jobId,
      slot: spec.slot,
      mapping_table: relative(projectRoot, mappingPath),
      exceptions_csv: relative(projectRoot, exceptionsPath),
      distribution: result.distribution,
      ...result.summary,
      warnings: result.warnings,
    }));
    return;
  }

  if (phase === 'finalize') {
    if (!jobId) throw new FeedOptimizerError('missing-job-id', 'The --job-id flag is required for finalize.');
    const out = finalizeCustomLabel({ paths, jobId });
    console.log('\nFeed Optimizer - Custom Label: Finalize');
    console.log(`Slots: ${out.slots.join(', ')} | Label cells changed: ${out.summary.changed} | Exceptions: ${out.summary.exceptions}`);
    for (const f of out.importFiles) console.log(`  Import: ${relative(projectRoot, resolve(out.finalDir, f))}`);
    console.log(`  Final dir: ${relative(projectRoot, out.finalDir)} (diff.csv, exceptions.csv, README.md)`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({ status: 'finalized', job_id: jobId, final_dir: relative(projectRoot, out.finalDir), import_files: out.importFiles, slots: out.slots, ...out.summary }));
    return;
  }

  throw new FeedOptimizerError('unknown-phase', `Unknown custom-label phase: "${phase}". Supported: apply-labels, finalize.`);
}

try {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const projectRoot = resolveProjectRoot(args['client-root'] || process.cwd());
  // parseArgs only captures --flags; accept a leading positional subcommand (`plan.js gate`) like
  // the other CLIs do.
  const positional = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
  const action = args.action || positional || 'product-type';

  if (action === 'gate') {
    handleGate(args, projectRoot);
  } else if (action === 'product-type' && args.phase) {
    // Freshness is enforced per phase call, not just at the explicit gate — a stale audit fails
    // fast even when the gate step was skipped. Loosen with --max-age-hours if ever needed.
    checkFreshAuditPrerequisites({ projectRoot, maxAgeHours: parseInt(args['max-age-hours'] || '24', 10) });
    handleProductTypePhase(args, projectRoot);
  } else if (action === 'taxonomy' && args.phase) {
    checkFreshAuditPrerequisites({ projectRoot, maxAgeHours: parseInt(args['max-age-hours'] || '24', 10) });
    await handleTaxonomyPhase(args, projectRoot);
  } else if (action === 'custom-label' && args.phase) {
    checkFreshAuditPrerequisites({ projectRoot, maxAgeHours: parseInt(args['max-age-hours'] || '24', 10) });
    handleCustomLabelPhase(args, projectRoot);
  } else if (action === 'product-type') {
    throw new FeedOptimizerError('missing-phase', 'Product-type action requires a --phase flag. Supported: detect-languages, extract-terms, cluster, apply-mapping, finalize. Taxonomy design and the cluster-assignments decision file are written by Claude per reference/product-type/product-type-flow.md; apply-mapping and finalize expand them to per-product CSVs.');
  } else if (action === 'taxonomy') {
    throw new FeedOptimizerError('missing-phase', 'Taxonomy action requires a --phase flag. Supported: fetch-taxonomy, gpc-distribution, cluster, search-taxonomy, apply-mapping, finalize. GPC assignment and the cluster-assignments decision file are written by Claude per reference/taxonomy/taxonomy-flow.md; apply-mapping and finalize expand them to per-product CSVs.');
  } else if (action === 'custom-label') {
    throw new FeedOptimizerError('missing-phase', 'Custom-label action requires a --phase flag. Supported: apply-labels (--slot N), finalize. Strategy and the per-slot label-spec files are written by Claude per reference/custom-label/custom-label-flow.md; apply-labels and finalize expand them to per-product CSVs.');
  } else if (action === 'small-attributes') {
    throw new FeedOptimizerError('wrong-script', 'small-attributes runs via scripts/small-attributes.js (subcommands: gate, worklist, sample, estimate, launch, resume, status, assemble), not plan.js.');
  } else {
    throw new FeedOptimizerError('unsupported-action', `Unsupported plan.js action "${action}". Supported: gate, product-type (--phase), taxonomy (--phase), custom-label (--phase). small-attributes uses small-attributes.js.`);
  }
} catch (error) {
  printError(error);
  process.exitCode = 1;
}
