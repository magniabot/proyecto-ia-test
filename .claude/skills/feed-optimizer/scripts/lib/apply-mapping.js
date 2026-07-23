// Mechanical expansion of Claude-authored cluster-level decision files into per-product mapping
// tables and final import CSVs. Claude decides at cluster level (~tens of rows); this module joins
// those decisions against cluster membership and the merchant cache so per-product CSVs scale to
// any catalog size without hand-transcription. Decision-file contracts are documented in each
// action's flow reference (reference/{product-type,taxonomy,custom-label}/*-flow.md).

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { FeedOptimizerError, loadJson, readCsv, writeCsv } from './feed-optimizer-core.js';
import { validateProductTypePath } from './product-type-taxonomy.js';
import { currentGpcOf, resolveGpcPath } from './taxonomy.js';

const CUSTOM_LABEL_SLOTS = new Set(['custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4']);
const MAX_LABEL_VALUE_LENGTH = 100;
const MAX_UNIQUE_LABEL_VALUES = 1000;

// ---- shared helpers ----------------------------------------------------------------------------

// product_id -> cluster name from either cluster-summary shape: product-type summaries carry
// typedProductIds + blankProductIds per cluster, taxonomy summaries carry productIds.
export function clusterMembership(clusterSummary) {
  const membership = new Map();
  for (const cluster of clusterSummary.clusters || []) {
    const ids = [
      ...(cluster.typedProductIds || []),
      ...(cluster.blankProductIds || []),
      ...(cluster.productIds || []),
    ];
    for (const id of ids) membership.set(String(id), cluster.name);
  }
  return membership;
}

export function loadDecisionFile(path, label) {
  if (!existsSync(path)) {
    throw new FeedOptimizerError(
      `missing-${label}`,
      `Decision file not found: ${path}. Author it first (cluster/value assignments + optional per-product overrides) per the flow reference, then re-run this phase.`
    );
  }
  const decision = loadJson(path, `invalid-${label}`);
  if (!decision.assignments || typeof decision.assignments !== 'object' || Array.isArray(decision.assignments)) {
    throw new FeedOptimizerError(`invalid-${label}`, `Decision file ${path} must contain an "assignments" object ({cluster name: value}).`);
  }
  if (decision.overrides && (typeof decision.overrides !== 'object' || Array.isArray(decision.overrides))) {
    throw new FeedOptimizerError(`invalid-${label}`, `"overrides" in ${path} must be an object ({product_id: value}).`);
  }
  return { assignments: decision.assignments, overrides: decision.overrides || {} };
}

// Every populated cluster must be explicitly decided (null = route to exceptions); unknown
// assignment keys are typos. Fail fast on both so a partial decision file never silently maps.
function checkClusterCoverage(clusterSummary, assignments, decisionPath) {
  const clusterNames = new Set(
    (clusterSummary.clusters || [])
      .filter((c) => (c.totalCount ?? c.productCount ?? 0) > 0)
      .map((c) => c.name)
  );
  const missing = [...clusterNames].filter((name) => !(name in assignments));
  const unknown = Object.keys(assignments).filter((name) => !clusterNames.has(name));
  if (missing.length > 0 || unknown.length > 0) {
    const details = [];
    if (missing.length > 0) details.push(`Clusters with no decision (assign a value, or null to route to exceptions): ${missing.join(' | ')}`);
    if (unknown.length > 0) details.push(`Assignment keys that match no cluster in the summary (typos?): ${unknown.join(' | ')}`);
    throw new FeedOptimizerError('incomplete-decision-file', `Decision file ${decisionPath} does not cover the cluster summary exactly.`, details);
  }
}

function summarize(rows, exceptions) {
  const changed = rows.filter((r) => r.changed === 'true').length;
  return {
    total_products: rows.length + exceptions.length,
    mapped: rows.length,
    changed,
    unchanged: rows.length - changed,
    exceptions: exceptions.length,
  };
}

// ---- product-type ------------------------------------------------------------------------------

export function applyProductTypeMapping({ products, clusterSummary, decision, decisionPath }) {
  checkClusterCoverage(clusterSummary, decision.assignments, decisionPath);

  const pathErrors = [];
  const pathWarnings = [];
  const checkPath = (value, origin) => {
    if (value === null) return;
    const check = validateProductTypePath(value);
    if (!check.valid) pathErrors.push(`${origin}: "${value}" — ${check.errors.join('; ')}`);
    for (const w of check.warnings) pathWarnings.push(`${origin}: "${value}" — ${w}`);
  };
  for (const [cluster, value] of Object.entries(decision.assignments)) checkPath(value, `cluster "${cluster}"`);
  for (const [pid, value] of Object.entries(decision.overrides)) checkPath(value, `override ${pid}`);
  if (pathErrors.length > 0) {
    throw new FeedOptimizerError('invalid-product-type-path', `Decision file ${decisionPath} contains invalid product_type paths.`, pathErrors);
  }

  const membership = clusterMembership(clusterSummary);
  const rows = [];
  const exceptions = [];
  for (const p of products) {
    const pid = String(p.product_id);
    const cluster = membership.get(pid) || '';
    let newValue;
    if (pid in decision.overrides) newValue = decision.overrides[pid];
    else if (cluster && cluster in decision.assignments) newValue = decision.assignments[cluster];
    else newValue = undefined;

    if (newValue === undefined || newValue === null) {
      exceptions.push({
        product_id: pid,
        title: p.title || '',
        language: p.language || '',
        cluster_name: cluster,
        reason: newValue === null ? 'cluster-unassigned' : 'not-in-any-cluster',
      });
      continue;
    }
    const oldValue = (p.product_type || '').trim();
    rows.push({
      product_id: pid,
      feed_label: p.feed_label || '',
      target_country: p.target_country || '',
      language: p.language || '',
      title: p.title || '',
      old_product_type: oldValue,
      new_product_type: newValue,
      cluster_name: cluster,
      changed: String(oldValue !== newValue),
    });
  }
  return { rows, exceptions, warnings: pathWarnings, summary: summarize(rows, exceptions) };
}

// ---- taxonomy ----------------------------------------------------------------------------------

export function applyTaxonomyMapping({ products, clusterSummary, decision, decisionPath, taxonomyData }) {
  checkClusterCoverage(clusterSummary, decision.assignments, decisionPath);

  const idErrors = [];
  const resolvedPaths = new Map();
  const checkGpc = (value, origin) => {
    if (value === null) return;
    const id = String(value).trim();
    const path = resolveGpcPath(taxonomyData, id);
    if (!path) idErrors.push(`${origin}: "${value}" is not a valid GPC ID in the cached Google taxonomy.`);
    else resolvedPaths.set(id, path);
  };
  for (const [cluster, value] of Object.entries(decision.assignments)) checkGpc(value, `cluster "${cluster}"`);
  for (const [pid, value] of Object.entries(decision.overrides)) checkGpc(value, `override ${pid}`);
  if (idErrors.length > 0) {
    throw new FeedOptimizerError('invalid-gpc-id', `Decision file ${decisionPath} contains GPC IDs that do not resolve.`, idErrors);
  }

  const membership = clusterMembership(clusterSummary);
  const rows = [];
  const exceptions = [];
  for (const p of products) {
    const pid = String(p.product_id);
    const cluster = membership.get(pid) || '';
    let newValue;
    if (pid in decision.overrides) newValue = decision.overrides[pid];
    else if (cluster && cluster in decision.assignments) newValue = decision.assignments[cluster];
    else newValue = undefined;

    if (newValue === undefined || newValue === null) {
      exceptions.push({
        product_id: pid,
        title: p.title || '',
        cluster_name: cluster,
        reason: newValue === null ? 'cluster-unassigned' : 'not-in-any-cluster',
      });
      continue;
    }
    const newId = String(newValue).trim();
    const oldId = currentGpcOf(p);
    rows.push({
      product_id: pid,
      title: p.title || '',
      feed_label: p.feed_label || '',
      target_country: p.target_country || '',
      old_gpc_id: oldId,
      old_gpc_path: oldId ? (resolveGpcPath(taxonomyData, oldId) || `(unknown ID ${oldId})`) : '',
      new_gpc_id: newId,
      new_gpc_path: resolvedPaths.get(newId),
      cluster_name: cluster,
      changed: String(oldId !== newId),
    });
  }
  return { rows, exceptions, warnings: [], summary: summarize(rows, exceptions) };
}

// ---- custom-label ------------------------------------------------------------------------------

function parseNumeric(value) {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

// Build (product) -> label value | undefined from the spec's rule. undefined = exception.
function buildLabelResolver(rule, { projectRoot, performanceCsvPath }) {
  if (!rule || typeof rule.type !== 'string') {
    throw new FeedOptimizerError('invalid-label-spec', 'Label spec must contain a "rule" object with a "type" (keyed-mapping, ranked, user-csv, derived-promo).');
  }

  if (rule.type === 'keyed-mapping') {
    if (!rule.key_field || !rule.map || typeof rule.map !== 'object') {
      throw new FeedOptimizerError('invalid-label-spec', 'keyed-mapping rule requires "key_field" and a "map" object ({field value: label value}).');
    }
    const match = rule.match || 'exact';
    // Longest-key-first so the most specific hierarchical prefix wins.
    const prefixKeys = Object.keys(rule.map).sort((a, b) => b.length - a.length);
    return (p) => {
      const fieldValue = String(p[rule.key_field] ?? '').trim();
      if (!fieldValue) return rule.default ?? undefined;
      if (match === 'exact') return rule.map[fieldValue] ?? rule.default ?? undefined;
      if (match === 'prefix') {
        // Segment-aware prefix on " > " paths: "Boxes" matches "Boxes > Shipping", never "Boxers".
        for (const key of prefixKeys) {
          if (fieldValue === key || fieldValue.startsWith(`${key} > `)) return rule.map[key];
        }
        return rule.default ?? undefined;
      }
      throw new FeedOptimizerError('invalid-label-spec', `keyed-mapping "match" must be "exact" or "prefix", got "${match}".`);
    };
  }

  if (rule.type === 'ranked') {
    const metric = rule.metric || 'conversions';
    const topN = parseInt(rule.top_n, 10);
    if (!Number.isFinite(topN) || topN <= 0 || !rule.top_value || !rule.rest_value) {
      throw new FeedOptimizerError('invalid-label-spec', 'ranked rule requires numeric "top_n" plus "top_value" and "rest_value".');
    }
    const perfRows = readCsv(performanceCsvPath);
    if (perfRows.length === 0) {
      throw new FeedOptimizerError('missing-performance-data', `ranked rule needs ${performanceCsvPath}, which is missing or empty. Run /feed-auditor first or pick a different tactic.`);
    }
    const metricColumn = `metrics.${metric}`;
    if (!(metricColumn in perfRows[0])) {
      throw new FeedOptimizerError('invalid-label-spec', `ranked rule metric "${metric}" not found in the shopping performance CSV (expected column ${metricColumn}).`);
    }
    const totals = new Map();
    for (const row of perfRows) {
      const id = String(row['segments.product_item_id'] || '').toLowerCase();
      if (!id) continue;
      totals.set(id, (totals.get(id) || 0) + (parseNumeric(row[metricColumn]) || 0));
    }
    const topIds = new Set([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([id]) => id));
    return (p) => (topIds.has(String(p.product_id).toLowerCase()) ? rule.top_value : rule.rest_value);
  }

  if (rule.type === 'user-csv') {
    if (!rule.path) throw new FeedOptimizerError('invalid-label-spec', 'user-csv rule requires "path" (project-relative CSV with product_id + value columns).');
    const csvPath = resolve(projectRoot, rule.path);
    const rows = readCsv(csvPath);
    if (rows.length === 0) {
      throw new FeedOptimizerError('missing-user-csv', `user-csv rule file ${csvPath} is missing or empty.`);
    }
    const idColumn = rule.id_column || 'product_id';
    const valueColumn = rule.value_column || 'value';
    if (!(idColumn in rows[0]) || !(valueColumn in rows[0])) {
      throw new FeedOptimizerError('invalid-label-spec', `user-csv file ${csvPath} must have "${idColumn}" and "${valueColumn}" columns (override with id_column / value_column).`);
    }
    const byId = new Map(rows.map((r) => [String(r[idColumn]).toLowerCase(), String(r[valueColumn]).trim()]));
    return (p) => byId.get(String(p.product_id).toLowerCase()) ?? rule.default ?? undefined;
  }

  if (rule.type === 'derived-promo') {
    const onSale = rule.on_sale_value || 'on_sale';
    const regular = rule.regular_value || 'regular_price';
    return (p) => {
      const sale = parseNumeric(p.sale_price);
      const price = parseNumeric(p.price);
      if (sale === null || price === null) return undefined;
      return sale < price ? onSale : regular;
    };
  }

  throw new FeedOptimizerError('invalid-label-spec', `Unknown rule type "${rule.type}". Supported: keyed-mapping, ranked, user-csv, derived-promo.`);
}

export function applyCustomLabelSpec({ products, spec, specPath, projectRoot, performanceCsvPath }) {
  if (!spec.slot || !CUSTOM_LABEL_SLOTS.has(spec.slot)) {
    throw new FeedOptimizerError('invalid-label-spec', `Label spec ${specPath} must set "slot" to one of custom_label_0..custom_label_4 (got "${spec.slot || ''}").`);
  }
  if (spec.overrides && (typeof spec.overrides !== 'object' || Array.isArray(spec.overrides))) {
    throw new FeedOptimizerError('invalid-label-spec', `"overrides" in ${specPath} must be an object ({product_id: value}).`);
  }
  const overrides = spec.overrides || {};
  const resolver = buildLabelResolver(spec.rule, { projectRoot, performanceCsvPath });

  const rows = [];
  const exceptions = [];
  const valueErrors = [];
  const distribution = new Map();
  for (const p of products) {
    const pid = String(p.product_id);
    const newValue = pid in overrides ? overrides[pid] : resolver(p);
    if (newValue === undefined || newValue === null) {
      exceptions.push({ product_id: pid, title: p.title || '', slot: spec.slot, reason: 'no-rule-match' });
      continue;
    }
    const value = String(newValue).trim();
    if (!value) {
      valueErrors.push(`${pid}: empty label value`);
      continue;
    }
    if (value.length > MAX_LABEL_VALUE_LENGTH) {
      valueErrors.push(`${pid}: "${value.slice(0, 40)}…" exceeds ${MAX_LABEL_VALUE_LENGTH} chars`);
      continue;
    }
    distribution.set(value, (distribution.get(value) || 0) + 1);
    const oldValue = String(p[spec.slot] ?? '').trim();
    rows.push({
      product_id: pid,
      title: p.title || '',
      feed_label: p.feed_label || '',
      target_country: p.target_country || '',
      slot: spec.slot,
      old_value: oldValue,
      new_value: value,
      changed: String(oldValue !== value),
    });
  }
  if (valueErrors.length > 0) {
    throw new FeedOptimizerError('invalid-label-value', `Label spec ${specPath} produced invalid values.`, valueErrors.slice(0, 20));
  }
  if (distribution.size > MAX_UNIQUE_LABEL_VALUES) {
    throw new FeedOptimizerError('too-many-label-values', `Rule produced ${distribution.size} distinct values — Merchant Center allows at most ${MAX_UNIQUE_LABEL_VALUES} per custom label.`);
  }

  const warnings = [];
  if (distribution.size > 20) {
    warnings.push(`${distribution.size} distinct label values — listing groups get unwieldy past ~20; consider coarser buckets.`);
  }
  return {
    rows,
    exceptions,
    warnings,
    summary: summarize(rows, exceptions),
    distribution: [...distribution.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })),
  };
}

// ---- finalize ----------------------------------------------------------------------------------

function readMappingTables(planningDir, pattern, label) {
  if (!existsSync(planningDir)) {
    throw new FeedOptimizerError(`missing-${label}`, `Planning dir ${planningDir} not found — run apply-mapping first.`);
  }
  const files = readdirSync(planningDir).filter((f) => pattern.test(f)).sort();
  if (files.length === 0) {
    throw new FeedOptimizerError(`missing-${label}`, `No approved mapping tables matching ${pattern} in ${planningDir} — run apply-mapping first.`);
  }
  return files.map((file) => ({ file, rows: readCsv(resolve(planningDir, file)) }));
}

function combineExceptions(planningDir, pattern) {
  if (!existsSync(planningDir)) return [];
  const files = readdirSync(planningDir).filter((f) => pattern.test(f)).sort();
  return files.flatMap((file) => readCsv(resolve(planningDir, file)));
}

function copyIfPresent(planningDir, finalDir, filenames) {
  const copied = [];
  for (const name of filenames) {
    const src = resolve(planningDir, name);
    if (existsSync(src)) {
      copyFileSync(src, resolve(finalDir, name));
      copied.push(name);
    }
  }
  return copied;
}

function writeReadme(finalDir, { action, jobId, summary, importFiles, extraFiles, notes }) {
  const lines = [
    `# Feed Optimizer Job: ${jobId}`,
    '',
    `Action: ${action}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Products mapped: ${summary.mapped}`,
    `- Changed: ${summary.changed}`,
    `- Unchanged: ${summary.unchanged}`,
    `- Exceptions (unmapped): ${summary.exceptions}`,
    '',
    '## Files',
    '',
    '| File | Description |',
    '|------|-------------|',
    ...importFiles.map((f) => `| ${f} | Supplemental feed import (changed rows only) |`),
    '| diff.csv | All changed rows with old and new values |',
    '| exceptions.csv | Products that could not be mapped |',
    ...extraFiles.map((f) => `| ${f} | Planning artifact (copied for reference) |`),
    '',
    '## Notes',
    '',
    ...(notes.length > 0 ? notes.map((n) => `- ${n}`) : ['- (none)']),
    '',
  ];
  const path = resolve(finalDir, 'README.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n'), 'utf8');
  return path;
}

export function finalizeProductType({ paths, jobId }) {
  const planningDir = paths.planningJobDir(jobId);
  const finalDir = paths.createdJobDir(jobId);
  const tables = readMappingTables(planningDir, /^mapping-table-(?!cl\d)[\w-]+\.csv$/, 'product-type-mapping');

  const allRows = tables.flatMap((t) => t.rows);
  const changedRows = allRows.filter((r) => r.changed === 'true');

  const groups = new Map();
  for (const r of changedRows) {
    const key = `import-${r.language}-${r.feed_label}-${r.target_country}.csv`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: r.product_id, product_type: r.new_product_type });
  }
  const importFiles = [...groups.keys()].sort();
  for (const [file, rows] of groups) writeCsv(resolve(finalDir, file), rows, ['id', 'product_type']);

  writeCsv(resolve(finalDir, 'diff.csv'), changedRows, ['product_id', 'feed_label', 'target_country', 'language', 'title', 'old_product_type', 'new_product_type', 'cluster_name', 'changed']);
  const exceptions = combineExceptions(planningDir, /^exceptions-[\w-]+\.csv$/);
  writeCsv(resolve(finalDir, 'exceptions.csv'), exceptions, ['product_id', 'title', 'language', 'cluster_name', 'reason']);

  const planningArtifacts = readdirSync(planningDir).filter((f) => /^taxonomy-tree-[\w-]+\.md$/.test(f) || f === 'translation-map.csv');
  const copied = copyIfPresent(planningDir, finalDir, planningArtifacts);

  const summary = { mapped: allRows.length, changed: changedRows.length, unchanged: allRows.length - changedRows.length, exceptions: exceptions.length };
  writeReadme(finalDir, {
    action: 'product-type',
    jobId,
    summary,
    importFiles,
    extraFiles: copied,
    notes: ['Import files contain changed rows only — unchanged products keep their current product_type.'],
  });
  return { finalDir, importFiles, summary, languages: tables.map((t) => t.file) };
}

export function finalizeTaxonomy({ paths, jobId }) {
  const planningDir = paths.planningJobDir(jobId);
  const finalDir = paths.createdJobDir(jobId);
  const tables = readMappingTables(planningDir, /^mapping-table\.csv$/, 'taxonomy-mapping');

  const allRows = tables.flatMap((t) => t.rows);
  const changedRows = allRows.filter((r) => r.changed === 'true');

  const groups = new Map();
  for (const r of changedRows) {
    const key = `import-${r.feed_label}-${r.target_country}.csv`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: r.product_id, google_product_category: r.new_gpc_id });
  }
  const importFiles = [...groups.keys()].sort();
  for (const [file, rows] of groups) writeCsv(resolve(finalDir, file), rows, ['id', 'google_product_category']);

  writeCsv(resolve(finalDir, 'diff.csv'), changedRows, ['product_id', 'title', 'feed_label', 'target_country', 'old_gpc_id', 'old_gpc_path', 'new_gpc_id', 'new_gpc_path', 'cluster_name', 'changed']);
  const exceptions = combineExceptions(planningDir, /^exceptions\.csv$/);
  writeCsv(resolve(finalDir, 'exceptions.csv'), exceptions, ['product_id', 'title', 'cluster_name', 'reason']);

  const summary = { mapped: allRows.length, changed: changedRows.length, unchanged: allRows.length - changedRows.length, exceptions: exceptions.length };
  writeReadme(finalDir, {
    action: 'taxonomy',
    jobId,
    summary,
    importFiles,
    extraFiles: [],
    notes: ['google_product_category values are numeric GPC IDs and apply across all markets.'],
  });
  return { finalDir, importFiles, summary };
}

export function finalizeCustomLabel({ paths, jobId }) {
  const planningDir = paths.planningJobDir(jobId);
  const finalDir = paths.createdJobDir(jobId);
  const tables = readMappingTables(planningDir, /^mapping-table-cl\d\.csv$/, 'custom-label-mapping');

  // Merge per-slot tables into one record per product: which slots this job touched, old/new per slot.
  const slots = [...new Set(tables.flatMap((t) => t.rows.map((r) => r.slot)))].sort();
  const byProduct = new Map();
  for (const { rows } of tables) {
    for (const r of rows) {
      if (!byProduct.has(r.product_id)) {
        byProduct.set(r.product_id, { product_id: r.product_id, title: r.title, feed_label: r.feed_label, target_country: r.target_country, slots: {} });
      }
      byProduct.get(r.product_id).slots[r.slot] = { old: r.old_value, new: r.new_value, changed: r.changed === 'true' };
    }
  }

  const changedProducts = [...byProduct.values()].filter((p) => Object.values(p.slots).some((s) => s.changed));
  const groups = new Map();
  for (const p of changedProducts) {
    const key = `${p.feed_label}|${p.target_country}`;
    if (!groups.has(key)) groups.set(key, []);
    const row = { id: p.product_id };
    for (const slot of slots) if (p.slots[slot]) row[slot] = p.slots[slot].new;
    groups.get(key).push(row);
  }
  // Single market keeps the simple import.csv name; multi-market splits per feed_label + country.
  const importFiles = [];
  for (const [key, rows] of groups) {
    const [feedLabel, country] = key.split('|');
    const file = groups.size === 1 ? 'import.csv' : `import-${feedLabel}-${country}.csv`;
    writeCsv(resolve(finalDir, file), rows, ['id', ...slots]);
    importFiles.push(file);
  }

  const diffRows = tables.flatMap((t) => t.rows.filter((r) => r.changed === 'true'));
  writeCsv(resolve(finalDir, 'diff.csv'), diffRows, ['product_id', 'title', 'feed_label', 'target_country', 'slot', 'old_value', 'new_value', 'changed']);
  const exceptions = combineExceptions(planningDir, /^exceptions-cl\d\.csv$/);
  writeCsv(resolve(finalDir, 'exceptions.csv'), exceptions, ['product_id', 'title', 'slot', 'reason']);

  const copied = copyIfPresent(planningDir, finalDir, ['custom-label-strategy.md']);

  const totalCells = tables.reduce((n, t) => n + t.rows.length, 0);
  const summary = { mapped: totalCells, changed: diffRows.length, unchanged: totalCells - diffRows.length, exceptions: exceptions.length };
  writeReadme(finalDir, {
    action: 'custom-label',
    jobId,
    summary,
    importFiles: importFiles.sort(),
    extraFiles: copied,
    notes: [
      `Slots configured: ${slots.join(', ')}`,
      'Import files contain products with at least one changed label; cells hold the new values for every job slot.',
    ],
  });
  return { finalDir, importFiles: importFiles.sort(), slots, summary };
}
