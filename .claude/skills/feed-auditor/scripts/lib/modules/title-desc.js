// Title & Description module.
//
// Answers: "is the free-text quality good in business context?" Reuses the tested title/
// description detectors in core, then compresses full-catalog evidence into bounded
// SOP-shaped clusters. Claude reads clusters/samples/top performers, not thousands of rows.
// All findings are free-text rewrites -> content-maker fixability -> the feed-optimizer
// `content` action. No advisory brief.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { FIXABILITY, makeQueueRow, scoreFromAffected } from './shared.js';

export const id = 'title-desc';
export const label = 'Title & Description';
export const weight = 15;

const CLUSTER_SAMPLE_LIMIT = 5;
const TOP_CLUSTER_LIMIT = 25;
const TOP_PERFORMER_LIMIT = 50;
const LANGUAGE_PATTERN_RELATIVE_PATH = 'context/feed/cache/title-desc-language-patterns.json';

export const TITLE_FORMULAS = {
  fashion_apparel: 'Brand + Gender + Product type + Attributes (color/size/material)',
  electronics: 'Brand + Attributes + Product type + Model',
  consumables_health_beauty: 'Brand + Product type + Attributes (weight/amount/flavor)',
  home_furniture: 'Brand + Product type + Attributes (size/material/color) + Style',
  books_media: 'Title + Author + Format + ISBN',
  seasonal_occasion: 'Occasion + Product type + Attributes',
  sports_outdoors: 'Brand + Product type + Attributes (size/weight/material) + Use case',
  automotive: 'Year/Make/Model compatibility + Product type + Brand + Attributes',
  general: 'Brand + Product type + Key attribute + Differentiator',
};

export const DESCRIPTION_TEMPLATES = {
  fashion_apparel: 'Identify brand/product, target wearer, material, fit, color, size, and comfort/style benefits.',
  electronics: 'Identify brand/model, key specs, use case, compatibility, included components, and finish/color.',
  consumables_health_beauty: 'Identify brand/product, active amount or size, target audience, format, quality cues, and usage facts.',
  home_furniture: 'Identify room/use, brand/product, dimensions, material, color, style, features, and assembly facts.',
  books_media: 'Identify title, author/creator, format, topic/genre, edition/version, length, and ISBN when available.',
  seasonal_occasion: 'Identify occasion first, then product type, size/capacity, colors, features, and indoor/outdoor use.',
  sports_outdoors: 'Identify brand/product, activity/use case, specs, material, capacity/dimensions, and durability features.',
  automotive: 'Identify compatibility first when relevant, then product type, brand, material/specs, quantity, and fitment facts.',
  general: 'Identify brand/product type, key attributes, use case, differentiator, and concrete specs already present in feed data.',
};

const ISSUE_TAGS = [
  ['title_very_short', /title is very short \(under 30 characters\)/],
  ['title_over_150', /title exceeds 150 characters/],
  ['title_promo', /title contains promotional wording/],
  ['title_all_caps', /title is mostly all caps/],
  ['title_missing_brand', /brand exists but title does not contain brand/],
  ['title_missing_product_type_leaf', /title may be missing product_type leaf terms/],
  ['description_blank', /description is blank/],
  ['description_short_80', /description is shorter than 80 characters/],
  ['description_promo', /description contains promotional wording/],
  ['description_html', /description contains HTML-like markup/],
  ['description_url', /description contains a URL/],
  ['description_empty_brand', /description contains an empty brand placeholder/],
  ['description_boilerplate_first_160', /first 160 characters are store\/price boilerplate/],
];

export const SOURCE_FIELDS = [
  'brand',
  'product_type',
  'google_product_category',
  'color',
  'size',
  'material',
  'pattern',
  'gender',
  'age_group',
  'mpn',
  'gtin',
  'condition',
  'custom_label_0',
  'custom_label_1',
  'custom_label_2',
  'custom_label_3',
  'custom_label_4',
];

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function present(value) {
  return String(value || '').trim() !== '';
}

function marketMatches(pattern, product) {
  for (const field of ['language', 'target_country', 'feed_label']) {
    if (!pattern[field]) continue;
    if (norm(pattern[field]) !== norm(product[field])) return false;
  }
  return true;
}

function compactTerms(values) {
  return Array.from(new Set((values || [])
    .map((value) => norm(value).trim())
    .filter((value) => value.length >= 2)))
    .slice(0, 200);
}

function normalizePatternEntries(raw) {
  const entries = [];
  const sourcePatterns = Array.isArray(raw?.patterns) ? raw.patterns : [];

  for (const pattern of sourcePatterns) {
    const base = {
      id: pattern.id || pattern.pattern_id || '',
      language: pattern.language || pattern.match?.language || '',
      target_country: pattern.target_country || pattern.match?.target_country || '',
      feed_label: pattern.feed_label || pattern.match?.feed_label || '',
      fields: Array.isArray(pattern.fields) && pattern.fields.length > 0
        ? pattern.fields
        : ['product_type', 'title', 'description'],
      confidence: pattern.confidence || 'manual',
    };

    const directTerms = compactTerms([
      ...(pattern.terms || []),
      ...(pattern.category_terms || []),
      ...(pattern.product_type_terms || []),
      ...(pattern.title_terms || []),
    ]);
    if (pattern.catalog_type && directTerms.length > 0) {
      entries.push({ ...base, catalog_type: pattern.catalog_type, terms: directTerms });
    }

    if (pattern.catalog_type_terms && typeof pattern.catalog_type_terms === 'object') {
      for (const [catalogType, terms] of Object.entries(pattern.catalog_type_terms)) {
        const normalizedTerms = compactTerms(terms);
        if (normalizedTerms.length > 0) {
          entries.push({ ...base, catalog_type: catalogType, terms: normalizedTerms });
        }
      }
    }
  }

  return entries.filter((entry) => TITLE_FORMULAS[entry.catalog_type] && entry.terms.length > 0);
}

export function readRuntimeLanguagePatterns(projectRoot) {
  const path = projectRoot ? resolve(projectRoot, LANGUAGE_PATTERN_RELATIVE_PATH) : '';
  if (!path || !existsSync(path)) {
    return {
      loaded: false,
      path: LANGUAGE_PATTERN_RELATIVE_PATH,
      pattern_count: 0,
      entries: [],
      note: 'No runtime language pattern file found; catalog type falls back to general unless structured evidence is added by Claude.',
    };
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const entries = normalizePatternEntries(raw);
    return {
      loaded: true,
      path: LANGUAGE_PATTERN_RELATIVE_PATH,
      generated_at: raw.generated_at || '',
      pattern_count: entries.length,
      entries,
      note: entries.length > 0
        ? 'Runtime language patterns loaded from client feed cache.'
        : 'Runtime language pattern file loaded but no usable catalog_type terms were found.',
    };
  } catch (error) {
    return {
      loaded: false,
      path: LANGUAGE_PATTERN_RELATIVE_PATH,
      pattern_count: 0,
      entries: [],
      error: String(error.message || error),
      note: 'Runtime language pattern file could not be parsed; catalog type falls back to general.',
    };
  }
}

export function detectCatalogType(product, runtimePatterns) {
  const patterns = runtimePatterns?.entries || [];
  for (const pattern of patterns) {
    if (!marketMatches(pattern, product)) continue;
    const haystack = pattern.fields.map((field) => norm(product[field])).join(' ');
    const matchedTerm = pattern.terms.find((term) => haystack.includes(term));
    if (matchedTerm) {
      return {
        catalog_type: pattern.catalog_type,
        source: 'runtime-language-pattern',
        confidence: pattern.confidence,
        pattern_id: pattern.id,
        matched_term: matchedTerm,
      };
    }
  }

  return {
    catalog_type: 'general',
    source: 'fallback',
    confidence: 'low',
    pattern_id: '',
    matched_term: '',
  };
}

function inferDominantCatalogType(products, runtimePatterns) {
  const counts = new Map();
  const sourceCounts = new Map();
  for (const product of products) {
    const detection = detectCatalogType(product, runtimePatterns);
    counts.set(detection.catalog_type, (counts.get(detection.catalog_type) || 0) + 1);
    sourceCounts.set(detection.source, (sourceCounts.get(detection.source) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [type, count] = ranked[0] || ['general', 0];
  const pct = products.length ? Math.round((count / products.length) * 100) : 0;
  const fallbackCount = sourceCounts.get('fallback') || 0;
  return {
    dominant_catalog_type: type,
    confidence: runtimePatterns?.pattern_count > 0 && fallbackCount / (products.length || 1) < 0.5
      ? (pct >= 70 ? 'high' : (pct >= 40 ? 'medium' : 'low'))
      : 'low',
    classification_sources: Object.fromEntries(sourceCounts),
    distribution: ranked.map(([catalog_type, product_count]) => ({
      catalog_type,
      product_count,
      pct: products.length ? Math.round((product_count / products.length) * 100) : 0,
    })),
  };
}

function issueTags(reason) {
  const tags = ISSUE_TAGS.filter(([, pattern]) => pattern.test(reason || '')).map(([tag]) => tag);
  return tags.length ? tags : ['other_title_desc_issue'];
}

function issueLabel(tag) {
  return tag.replace(/_/g, ' ');
}

function priorityForTag(tag) {
  if (/promo|all_caps|html|url|blank/.test(tag)) return 1;
  if (/missing_brand|missing_product_type/.test(tag)) return 2;
  if (/short|boilerplate/.test(tag)) return 3;
  return 4;
}

function availableFields(products) {
  return SOURCE_FIELDS.map((field) => ({
    field,
    populated_count: products.filter((product) => present(product[field])).length,
    sample_values: Array.from(new Set(products.map((product) => String(product[field] || '').trim()).filter(Boolean))).slice(0, 5),
  })).filter((row) => row.populated_count > 0);
}

function rowForSample(product, queueRowsByProduct, perf = {}, runtimePatterns = null) {
  const catalogDetection = detectCatalogType(product, runtimePatterns);
  return {
    product_id: product.product_id || '',
    title: product.title || '',
    description_first_160: String(product.description || '').slice(0, 160),
    brand: product.brand || '',
    product_type: product.product_type || '',
    google_product_category: product.google_product_category || '',
    feed_label: product.feed_label || '',
    target_country: product.target_country || '',
    language: product.language || '',
    catalog_type: catalogDetection.catalog_type,
    catalog_type_source: catalogDetection.source,
    catalog_type_matched_term: catalogDetection.matched_term,
    findings: (queueRowsByProduct.get(product.product_id) || []).map((row) => row.finding),
    performance: {
      impressions: num(perf.impressions),
      clicks: num(perf.clicks),
      cost: round(num(perf.cost)),
      conversions: round(num(perf.conversions), 4),
      conversion_value: round(num(perf.conversion_value)),
      roas_or_poas: num(perf.cost) > 0 ? round(num(perf.conversion_value) / num(perf.cost)) : null,
      cost_per_conversion: num(perf.conversions) > 0 ? round(num(perf.cost) / num(perf.conversions)) : null,
      performance_label: perf.performance_label || '',
    },
  };
}

function readBusinessMd(projectRoot) {
  if (!projectRoot) return '';
  const path = resolve(projectRoot, 'context/business.md');
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function inferPrimaryMetric(businessMd) {
  const text = norm(businessMd);
  const primaryLine = text.split('\n').find((line) => line.includes('primary metric')) || '';
  const probe = primaryLine || text;
  if (/\bpoas\b|profit on ad spend|profitmetrics/.test(probe)) return { metric: 'poas', source: primaryLine ? 'context/business.md primary metric' : 'context/business.md profit metric mention' };
  if (/\broas\b|return on ad spend/.test(probe)) return { metric: 'roas', source: primaryLine ? 'context/business.md primary metric' : 'context/business.md ROAS mention' };
  if (/\bcpa\b|cost per acquisition|cost per conversion/.test(probe)) return { metric: 'cpa', source: primaryLine ? 'context/business.md primary metric' : 'context/business.md CPA mention' };
  if (/conversion value|gross profit|revenue|value/.test(probe)) return { metric: 'conversion_value', source: primaryLine ? 'context/business.md primary metric' : 'context/business.md value mention' };
  return { metric: 'conversions', source: 'fallback: no product-level business metric found in context/business.md' };
}

function primaryMetricScore(perf, metric) {
  const cost = num(perf.cost);
  const conversions = num(perf.conversions);
  const conversionValue = num(perf.conversion_value);
  if ((metric === 'poas' || metric === 'roas') && cost > 0) return conversionValue / cost;
  if (metric === 'cpa' && conversions > 0) return cost / conversions;
  if (metric === 'conversion_value') return conversionValue;
  return conversions;
}

function comparePerformance(a, b, metric) {
  const aScore = primaryMetricScore(a, metric);
  const bScore = primaryMetricScore(b, metric);
  if (metric === 'cpa') {
    const aUsable = num(a.conversions) > 0;
    const bUsable = num(b.conversions) > 0;
    if (aUsable !== bUsable) return aUsable ? -1 : 1;
    if (aUsable && aScore !== bScore) return aScore - bScore;
  } else if (aScore !== bScore) {
    return bScore - aScore;
  }
  if (num(a.conversions) !== num(b.conversions)) return num(b.conversions) - num(a.conversions);
  if (num(a.conversion_value) !== num(b.conversion_value)) return num(b.conversion_value) - num(a.conversion_value);
  if (num(a.clicks) !== num(b.clicks)) return num(b.clicks) - num(a.clicks);
  return String(a.product_id || '').localeCompare(String(b.product_id || ''));
}

function buildPerformanceIndex(audit, products, projectRoot, queueRowsByProduct, runtimePatterns) {
  const businessMetric = inferPrimaryMetric(readBusinessMd(projectRoot));
  const byProduct = new Map(products.map((product) => [product.product_id, product]));
  const rows = (audit.evidence.performanceLabelSnapshot || [])
    .filter((row) => byProduct.has(row.product_id))
    .map((row) => ({
      ...row,
      primary_metric: businessMetric.metric,
      primary_metric_score: round(primaryMetricScore(row, businessMetric.metric), 4),
    }));
  const hasSignal = rows.some((row) => (
    num(row.impressions) > 0 ||
    num(row.clicks) > 0 ||
    num(row.cost) > 0 ||
    num(row.conversions) > 0 ||
    num(row.conversion_value) > 0
  ));
  const ranked = hasSignal ? [...rows].sort((a, b) => comparePerformance(a, b, businessMetric.metric)) : [];
  const rankByProduct = new Map(ranked.map((row, index) => [row.product_id, index + 1]));
  const perfByProduct = new Map(rows.map((row) => [row.product_id, row]));

  return {
    rankByProduct,
    perfByProduct,
    slice: {
      available: hasSignal,
      limit: TOP_PERFORMER_LIMIT,
      basis: `${businessMetric.source}; rank by ${businessMetric.metric}, then conversions, then conversion_value`,
      primary_metric: businessMetric.metric,
      products: ranked.slice(0, TOP_PERFORMER_LIMIT).map((row, index) => ({
        rank: index + 1,
        primary_metric_score: row.primary_metric_score,
        ...rowForSample(byProduct.get(row.product_id), queueRowsByProduct, row, runtimePatterns),
      })),
    },
  };
}

function clusterHandoff(tag, catalogType) {
  const missing = [];
  if (/missing_brand/.test(tag)) missing.push('brand in title');
  if (/missing_product_type/.test(tag)) missing.push('product_type leaf terms in title');
  if (/short/.test(tag)) missing.push('category-specific attributes that are factual in feed data');
  if (/blank|short_/.test(tag) && tag.startsWith('description')) missing.push('product-specific features/specs/benefits in first 160 characters');
  if (/boilerplate/.test(tag)) missing.push('product substance before store or price boilerplate');

  return {
    recommended_downstream: 'feed-optimizer:content',
    title_formula: TITLE_FORMULAS[catalogType] || TITLE_FORMULAS.general,
    description_template: DESCRIPTION_TEMPLATES[catalogType] || DESCRIPTION_TEMPLATES.general,
    missing_elements_to_fix: missing,
    rewrite_constraints: [
      'Use only facts available in source fields or user-provided context.',
      'Do not invent material, size, model, compatibility, quantity, claims, or certification.',
      'Remove promotional text, URLs, HTML, empty placeholders, and store/price boilerplate.',
      'Keep title within Google Shopping limits and front-load the category-specific core terms.',
    ],
  };
}

function buildClusters({ products, queueRows, queueRowsByProduct, performance, runtimePatterns }) {
  const byProduct = new Map(products.map((product) => [product.product_id, product]));
  const clusters = new Map();

  for (const row of queueRows) {
    const product = byProduct.get(row.product_id);
    if (!product) continue;
    const tags = issueTags(row.finding);
    for (const tag of tags) {
      const catalogDetection = detectCatalogType(product, runtimePatterns);
      const catalogType = catalogDetection.catalog_type;
      const market = [product.feed_label, product.target_country, product.language].map((v) => v || 'unknown').join('|');
      const key = [catalogType, market, row.attribute, tag].join('::');
      if (!clusters.has(key)) {
        clusters.set(key, {
          cluster_id: `${catalogType}_${market.replace(/[^a-zA-Z0-9]+/g, '_')}_${row.attribute}_${tag}`,
          catalog_type: catalogType,
          catalog_type_source: catalogDetection.source,
          market: {
            feed_label: product.feed_label || '',
            target_country: product.target_country || '',
            language: product.language || '',
          },
          attribute: row.attribute,
          issue_tag: tag,
          issue: issueLabel(tag),
          priority_tier: priorityForTag(tag),
          product_ids: new Set(),
          products: [],
          sourceRows: [],
        });
      }
      const cluster = clusters.get(key);
      cluster.product_ids.add(product.product_id);
      cluster.products.push(product);
      cluster.sourceRows.push(row);
    }
  }

  return [...clusters.values()]
    .map((cluster) => {
      const sampleProducts = [...new Map(cluster.products.map((product) => [product.product_id, product])).values()]
        .sort((a, b) => {
          const aRank = performance.rankByProduct.get(a.product_id) || Number.MAX_SAFE_INTEGER;
          const bRank = performance.rankByProduct.get(b.product_id) || Number.MAX_SAFE_INTEGER;
          if (aRank !== bRank) return aRank - bRank;
          return String(a.product_id || '').localeCompare(String(b.product_id || ''));
        });
      const perfRanks = sampleProducts.map((product) => performance.rankByProduct.get(product.product_id)).filter(Boolean);
      return {
        cluster_id: cluster.cluster_id,
        catalog_type: cluster.catalog_type,
        market: cluster.market,
        attribute: cluster.attribute,
        issue_tag: cluster.issue_tag,
        issue: cluster.issue,
        affected_count: cluster.product_ids.size,
        top_performer_overlap_count: perfRanks.filter((rank) => rank <= TOP_PERFORMER_LIMIT).length,
        highest_top_performer_rank: perfRanks.length ? Math.min(...perfRanks) : null,
        priority_tier: cluster.priority_tier,
        handoff: clusterHandoff(cluster.issue_tag, cluster.catalog_type),
        available_source_fields: availableFields(sampleProducts),
        samples: sampleProducts.slice(0, CLUSTER_SAMPLE_LIMIT).map((product) => (
          rowForSample(product, queueRowsByProduct, performance.perfByProduct.get(product.product_id), runtimePatterns)
        )),
      };
    })
    .sort((a, b) => {
      if (a.priority_tier !== b.priority_tier) return a.priority_tier - b.priority_tier;
      if ((a.highest_top_performer_rank || 999999) !== (b.highest_top_performer_rank || 999999)) {
        return (a.highest_top_performer_rank || 999999) - (b.highest_top_performer_rank || 999999);
      }
      return b.affected_count - a.affected_count;
    });
}

function renderBrief({ generatedAt, profile, runtimePatterns, topPerformerSlice, clusters, eligible, affected }) {
  const lines = [
    `# Title & Description Brief (${generatedAt.slice(0, 10)})`,
    '',
    'This brief is bounded evidence for Claude and `/feed-optimizer content`. The script scanned the full catalog; Claude should use the clusters, samples, and top-performer slice instead of reading raw product rows.',
    '',
    '## Evidence Budget',
    '',
    `- Products with title eligible for scoring: ${eligible}`,
    `- Products affected by title/description findings: ${affected}`,
    `- Clusters emitted: ${Math.min(clusters.length, TOP_CLUSTER_LIMIT)} of ${clusters.length}`,
    `- Samples per cluster: max ${CLUSTER_SAMPLE_LIMIT}`,
    `- Top performer slice: max ${TOP_PERFORMER_LIMIT}`,
    '',
    '## Catalog Classification',
    '',
    `- Dominant type: ${profile.dominant_catalog_type}`,
    `- Confidence: ${profile.confidence}`,
    `- Source: ${Object.entries(profile.classification_sources || {}).map(([source, count]) => `${source}=${count}`).join(', ') || 'unknown'}`,
    `- Formula: ${TITLE_FORMULAS[profile.dominant_catalog_type] || TITLE_FORMULAS.general}`,
    `- Runtime patterns: ${runtimePatterns.loaded ? `loaded (${runtimePatterns.pattern_count})` : 'not loaded'}`,
    `- Pattern file: ${runtimePatterns.path}`,
    '',
    '## Top Performer Slice',
    '',
    `- Available: ${topPerformerSlice.available ? 'yes' : 'no'}`,
    `- Basis: ${topPerformerSlice.basis}`,
    `- Products in slice: ${topPerformerSlice.products.length}`,
    '',
    '## Priority Clusters',
    '',
    '| Cluster | Products | Top-50 overlap | Formula | Handoff |',
    '|---|---:|---:|---|---|',
  ];

  for (const cluster of clusters.slice(0, TOP_CLUSTER_LIMIT)) {
    lines.push(`| ${cluster.issue} (${cluster.catalog_type}, ${cluster.market.feed_label || 'all'}/${cluster.market.target_country || 'all'}/${cluster.market.language || 'all'}) | ${cluster.affected_count} | ${cluster.top_performer_overlap_count} | ${cluster.handoff.title_formula} | ${cluster.handoff.recommended_downstream} |`);
  }

  lines.push(
    '',
    '## Creator Guardrails',
    '',
    '- Rewrite from known facts only. Unknown material, size, model, compatibility, quantity, claims, or certification must not be invented.',
    '- Keep market/language clusters separate when examples differ.',
    '- Prioritize policy/high-risk text issues first, then top performer overlap, then largest affected clusters.',
    ''
  );

  return `${lines.join('\n')}\n`;
}

function writeTitleDescArtifacts(projectRoot, artifact) {
  if (!projectRoot) return {};
  const outputDir = resolve(projectRoot, 'context/analysis/feed');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = resolve(outputDir, 'title-desc-clusters.json');
  const briefPath = resolve(outputDir, 'title-desc-brief.md');
  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  writeFileSync(briefPath, renderBrief({
    generatedAt: artifact.generated_at,
    profile: artifact.catalog_profile,
    runtimePatterns: artifact.runtime_language_patterns,
    topPerformerSlice: artifact.top_performer_slice,
    clusters: artifact.clusters,
    eligible: artifact.eligible,
    affected: artifact.affected,
  }), 'utf8');
  return {
    clusters_file: 'context/analysis/feed/title-desc-clusters.json',
    brief_file: 'context/analysis/feed/title-desc-brief.md',
  };
}

export function build({ audit, products, projectRoot }) {
  const byProduct = new Map(products.map((product) => [product.product_id, product]));
  const queueRows = [];
  const affected = new Set();

  const push = (row, attribute) => {
    const product = byProduct.get(row.product_id) || row;
    queueRows.push(makeQueueRow(product, id, {
      finding: row.reason,
      attribute,
      fixability_class: FIXABILITY.CONTENT_MAKER,
      confidence: row.severity === 'high' ? 'high' : 'medium',
      priority_basis: `severity=${row.severity || 'medium'}`,
    }));
    affected.add(row.product_id);
  };

  for (const row of audit.evidence.weakTitleRows || []) push(row, 'title');
  for (const row of audit.evidence.weakDescriptionRows || []) push(row, 'description');

  // Eligible = products that have a title to assess (free-text quality is only meaningful then).
  const eligible = products.filter((product) => product.title).length;
  const queueRowsByProduct = new Map();
  for (const row of queueRows) {
    if (!queueRowsByProduct.has(row.product_id)) queueRowsByProduct.set(row.product_id, []);
    queueRowsByProduct.get(row.product_id).push(row);
  }
  const runtimePatterns = readRuntimeLanguagePatterns(projectRoot);
  const performance = buildPerformanceIndex(audit, products, projectRoot, queueRowsByProduct, runtimePatterns);
  const clusters = buildClusters({ products, queueRows, queueRowsByProduct, performance, runtimePatterns });
  const catalogProfile = inferDominantCatalogType(products, runtimePatterns);
  const artifact = {
    generated_at: audit.generatedAt || new Date().toISOString(),
    module: id,
    eligible,
    affected: affected.size,
    evidence_budget: {
      full_catalog_scanned_by_script: true,
      claude_should_not_review_raw_catalog_rows: true,
      cluster_sample_limit: CLUSTER_SAMPLE_LIMIT,
      top_cluster_limit: TOP_CLUSTER_LIMIT,
      top_performer_limit: TOP_PERFORMER_LIMIT,
    },
    catalog_profile: catalogProfile,
    runtime_language_patterns: {
      loaded: runtimePatterns.loaded,
      path: runtimePatterns.path,
      generated_at: runtimePatterns.generated_at || '',
      pattern_count: runtimePatterns.pattern_count,
      note: runtimePatterns.note,
      error: runtimePatterns.error || '',
    },
    top_performer_slice: performance.slice,
    clusters,
  };
  const artifactFiles = writeTitleDescArtifacts(projectRoot, artifact);

  return {
    id,
    label,
    weight,
    applicable: eligible > 0,
    eligible,
    affected: affected.size,
    score: scoreFromAffected(affected, eligible),
    findings: queueRows.length,
    queueRows,
    briefSections: [],
    notes: `${affected.size} of ${eligible} product(s) with a title have a title/description quality issue. Cluster evidence: ${artifactFiles.clusters_file || 'not written'}; creator brief: ${artifactFiles.brief_file || 'not written'}.`,
  };
}
